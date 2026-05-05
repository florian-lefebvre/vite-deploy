import { rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	createBuilder,
	createServer,
	type PreviewServer,
	preview,
	type ViteDevServer,
} from "vite";

const examplesRoot = fileURLToPath(
	new URL("../../../examples/", import.meta.url),
);

export function exampleDir(name: string): string {
	return join(examplesRoot, name);
}

export interface ServerHandle {
	url: string;
	stop: () => Promise<void>;
}

export async function startServer(opts: {
	cwd: string;
	mode: "dev" | "preview";
}): Promise<ServerHandle> {
	// `@cloudflare/vite-plugin` / miniflare resolve some paths from `process.cwd()`
	// rather than vite's `root`, so chdir into the example to match the CLI behavior.
	process.chdir(opts.cwd);
	let server: ViteDevServer | PreviewServer;
	if (opts.mode === "dev") {
		server = await createServer({
			root: opts.cwd,
			configFile: join(opts.cwd, "vite.config.ts"),
			server: { strictPort: true },
			logLevel: "silent",
		});
		await server.listen();
	} else {
		server = await preview({
			root: opts.cwd,
			configFile: join(opts.cwd, "vite.config.ts"),
			preview: { strictPort: true },
			logLevel: "silent",
		});
	}

	const url = pickUrl(server.resolvedUrls?.local);
	return {
		url,
		stop: () => server.close(),
	};
}

function pickUrl(urls: ReadonlyArray<string> | undefined): string {
	const first = urls?.[0];
	if (!first) throw new Error("server did not resolve a local URL");
	return first.endsWith("/") ? first.slice(0, -1) : first;
}

export async function runBuild(cwd: string): Promise<void> {
	process.chdir(cwd);
	await rm(join(cwd, "dist"), { recursive: true, force: true });
	const builder = await createBuilder(
		{
			root: cwd,
			configFile: join(cwd, "vite.config.ts"),
			logLevel: "silent",
			build: {},
		},
		null,
	);
	await builder.buildApp();
}
