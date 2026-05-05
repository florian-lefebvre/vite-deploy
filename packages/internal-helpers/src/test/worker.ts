import { join } from "node:path";
import { createBuilder, createServer, type InlineConfig, preview } from "vite";
import type { ChildRequest, ChildResponse } from "./index.js";

const send = (m: ChildResponse) => process.send?.(m);

function pickUrl(urls: ReadonlyArray<string> | undefined): string {
	const first = urls?.[0];
	if (!first) throw new Error("server did not resolve a local URL");
	return first.endsWith("/") ? first.slice(0, -1) : first;
}

process.once("message", async (msg: ChildRequest) => {
	try {
		if (msg.kind === "build") {
			process.chdir(msg.cwd);
			const builder = await createBuilder(
				{
					root: msg.cwd,
					configFile: join(msg.cwd, "vite.config.ts"),
					logLevel: "silent",
					build: {},
				},
				null,
			);
			await builder.buildApp();
			send({ kind: "done" });
			process.exit(0);
		}
		if (msg.kind === "server") {
			process.chdir(msg.cwd);
			const config: InlineConfig = {
				root: msg.cwd,
				configFile: join(msg.cwd, "vite.config.ts"),
				logLevel: "silent",
			};
			const server = await (msg.mode === "dev"
				? createServer(config).then((s) => s.listen())
				: preview(config));
			send({ kind: "ready", url: pickUrl(server.resolvedUrls?.local) });
			process.once("message", async (stop: ChildRequest) => {
				if (stop.kind === "stop") {
					await server.close();
					process.exit(0);
				}
			});
		}
	} catch (err) {
		send({
			kind: "error",
			message: err instanceof Error ? err.message : String(err),
		});
		process.exit(1);
	}
});
