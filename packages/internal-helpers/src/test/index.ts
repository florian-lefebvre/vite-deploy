import { type ChildProcess, fork } from "node:child_process";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const examplesRoot = fileURLToPath(
	new URL("../../../../examples/", import.meta.url),
);
const WORKER = fileURLToPath(new URL("./worker.js", import.meta.url));

export function exampleDir(name: string): string {
	return join(examplesRoot, name);
}

export interface ServerHandle {
	url: string;
	stop: () => Promise<void>;
}

export type ChildRequest =
	| { kind: "build"; cwd: string }
	| { kind: "server"; cwd: string; mode: "dev" | "preview" }
	| { kind: "stop" };

export type ChildResponse =
	| { kind: "ready"; url: string }
	| { kind: "done" }
	| { kind: "error"; message: string };

export async function startServer(opts: {
	cwd: string;
	mode: "dev" | "preview";
}): Promise<ServerHandle> {
	const child = forkWorker();
	const url = await new Promise<string>((resolve, reject) => {
		const onExit = (code: number | null) =>
			reject(new Error(`worker exited before ready (code ${code})`));
		child.once("error", reject);
		child.once("exit", onExit);
		child.on("message", (msg: ChildResponse) => {
			if (msg.kind === "ready") {
				child.off("exit", onExit);
				resolve(msg.url);
			} else if (msg.kind === "error") {
				reject(new Error(msg.message));
			}
		});
		child.send({
			kind: "server",
			cwd: opts.cwd,
			mode: opts.mode,
		} satisfies ChildRequest);
	});

	return {
		url,
		stop: () =>
			new Promise<void>((resolve) => {
				if (child.exitCode !== null) return resolve();
				const kill = setTimeout(() => child.kill("SIGKILL"), 5000);
				child.once("exit", () => {
					clearTimeout(kill);
					resolve();
				});
				child.send({ kind: "stop" } satisfies ChildRequest);
			}),
	};
}

export async function runBuild(cwd: string): Promise<void> {
	await rm(join(cwd, "dist"), { recursive: true, force: true });
	const child = forkWorker();
	await new Promise<void>((resolve, reject) => {
		child.once("error", reject);
		child.on("message", (msg: ChildResponse) => {
			if (msg.kind === "done") resolve();
			else if (msg.kind === "error") reject(new Error(msg.message));
		});
		child.once("exit", (code) => {
			if (code !== 0 && code !== null)
				reject(new Error(`build worker exited ${code}`));
		});
		child.send({ kind: "build", cwd } satisfies ChildRequest);
	});
}

function forkWorker(): ChildProcess {
	return fork(WORKER, [], {
		stdio: ["ignore", "inherit", "inherit", "ipc"],
	});
}
