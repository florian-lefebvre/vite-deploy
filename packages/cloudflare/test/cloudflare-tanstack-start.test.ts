import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import {
	exampleDir,
	runBuild,
	type ServerHandle,
	startServer,
} from "./helpers.ts";

// Folder name has the upstream typo ("clouflare-"); package name is correct.
const cwd = exampleDir("clouflare-tanstack-start");

describe("cloudflare-tanstack-start", () => {
	describe("dev", () => {
		let server: ServerHandle;
		before(async () => {
			server = await startServer({
				cwd,
				mode: "dev",
			});
		});
		after(async () => server.stop());

		it("renders SSR home page", async () => {
			const res = await fetch(`${server.url}/`);
			assert.equal(res.status, 200);
			assert.match(res.headers.get("content-type") ?? "", /text\/html/);
			assert.match(await res.text(), /Welcome Home!!!/);
		});

		it("renders dynamic /posts route as HTML", async () => {
			const res = await fetch(`${server.url}/posts`);
			assert.equal(res.status, 200);
			assert.match(res.headers.get("content-type") ?? "", /text\/html/);
		});
	});

	describe("build", () => {
		before(async () => runBuild(cwd));

		it("prerenders / to client output", () => {
			const indexPath = join(cwd, "dist/client/index.html");
			assert.ok(existsSync(indexPath));
			assert.match(readFileSync(indexPath, "utf8"), /Welcome Home!!!/);
		});

		it("emits hashed client assets", () => {
			assert.ok(existsSync(join(cwd, "dist/client/assets")));
		});

		it("emits server worker for dynamic routes", () => {
			assert.ok(existsSync(join(cwd, "dist/server/index.mjs")));
			assert.ok(existsSync(join(cwd, "dist/server/wrangler.json")));
		});
	});

	describe("preview", () => {
		let server: ServerHandle;
		before(async () => {
			await runBuild(cwd);
			server = await startServer({
				cwd,
				mode: "preview",
			});
		});
		after(async () => server.stop());

		it("serves prerendered /", async () => {
			const res = await fetch(`${server.url}/`);
			assert.equal(res.status, 200);
			assert.match(await res.text(), /Welcome Home!!!/);
		});

		it("serves dynamic /posts via worker", async () => {
			const res = await fetch(`${server.url}/posts`);
			assert.equal(res.status, 200);
			assert.match(res.headers.get("content-type") ?? "", /text\/html/);
		});
	});
});
