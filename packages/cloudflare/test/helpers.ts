import { type ChildProcess, spawn } from "node:child_process";
import { once } from "node:events";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const examplesRoot = fileURLToPath(
	new URL("../../../examples/", import.meta.url),
);

export function exampleDir(name: string): string {
	return join(examplesRoot, name);
}

export interface ServerHandle {
	url: string;
	process: ChildProcess;
	stop(): Promise<void>;
}

const READY_REGEX = /(https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/?)\s*$/m;

export async function startServer(opts: {
	cwd: string;
	mode: "dev" | "preview";
	port: number;
	timeoutMs?: number;
}): Promise<ServerHandle> {
	const args = ["exec", "vite"];
	if (opts.mode === "preview") args.push("preview");
	args.push("--port", String(opts.port), "--strictPort");

	const child = spawn("pnpm", args, {
		cwd: opts.cwd,
		stdio: ["ignore", "pipe", "pipe"],
		env: {
			...process.env,
			FORCE_COLOR: "0",
			NO_COLOR: "1",
			CI: "1",
		},
	});

	const timeout = opts.timeoutMs ?? 60_000;
	const stdoutChunks: Array<string> = [];
	const stderrChunks: Array<string> = [];
	child.stdout.setEncoding("utf8");
	child.stderr.setEncoding("utf8");
	child.stdout.on("data", (chunk: string) => stdoutChunks.push(chunk));
	child.stderr.on("data", (chunk: string) => stderrChunks.push(chunk));

	let url: string | undefined;
	const start = Date.now();
	while (Date.now() - start < timeout) {
		if (child.exitCode !== null) {
			throw new Error(
				`Server exited with code ${child.exitCode}\nSTDOUT:\n${stdoutChunks.join(
					"",
				)}\nSTDERR:\n${stderrChunks.join("")}`,
			);
		}
		const combined = stdoutChunks.join("") + stderrChunks.join("");
		const match = combined.match(READY_REGEX);
		if (match) {
			url = match[1];
			if (url.endsWith("/")) url = url.slice(0, -1);
			break;
		}
		await sleep(100);
	}

	if (!url) {
		await stopChild(child);
		throw new Error(
			`Server did not become ready within ${timeout}ms\nSTDOUT:\n${stdoutChunks.join(
				"",
			)}\nSTDERR:\n${stderrChunks.join("")}`,
		);
	}

	// Probe once to make sure the server actually accepts connections.
	const probeStart = Date.now();
	while (Date.now() - probeStart < 5_000) {
		try {
			const probe = await fetch(`${url}/__probe_ready__`, {
				signal: AbortSignal.timeout(1_000),
			});
			void probe.body?.cancel();
			break;
		} catch {
			await sleep(100);
		}
	}

	return {
		url,
		process: child,
		stop: () => stopChild(child),
	};
}

async function stopChild(child: ChildProcess): Promise<void> {
	if (child.exitCode !== null) return;
	child.kill("SIGTERM");
	const exit = once(child, "exit");
	const timeout = sleep(5_000).then(() => "timeout" as const);
	const result = await Promise.race([exit, timeout]);
	if (result === "timeout") {
		child.kill("SIGKILL");
		await once(child, "exit").catch(() => {});
	}
}

export async function runBuild(cwd: string): Promise<void> {
	await rm(join(cwd, "dist"), { recursive: true, force: true });
	const child = spawn("pnpm", ["exec", "vite", "build"], {
		cwd,
		stdio: ["ignore", "pipe", "pipe"],
		env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1", CI: "1" },
	});
	const out: Array<string> = [];
	const err: Array<string> = [];
	child.stdout.setEncoding("utf8");
	child.stderr.setEncoding("utf8");
	child.stdout.on("data", (c: string) => out.push(c));
	child.stderr.on("data", (c: string) => err.push(c));
	const [code] = (await once(child, "exit")) as [number | null];
	if (code !== 0) {
		throw new Error(
			`vite build failed with code ${code}\nSTDOUT:\n${out.join(
				"",
			)}\nSTDERR:\n${err.join("")}`,
		);
	}
}

let nextPort = 51000;
export function allocatePort(): number {
	return nextPort++;
}
