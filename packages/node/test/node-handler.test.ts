import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import {
	exampleDir,
	runBuild,
	type ServerHandle,
	startServer,
} from "@vite-deploy/internal-helpers/test";

const cwd = exampleDir("node-handler");

describe("node-handler", () => {
	describe("dev", () => {
		let server: ServerHandle;
		before(async () => {
			server = await startServer({ cwd, mode: "dev" });
		});
		after(async () => server.stop());

		it("renders / from handler (DEV branch)", async () => {
			const res = await fetch(`${server.url}/`);
			assert.equal(res.status, 200);
			assert.match(res.headers.get("content-type") ?? "", /text\/html/);
			assert.match(await res.text(), /<div>foo<\/div>/);
		});

		it("renders dynamic route via handler", async () => {
			const res = await fetch(`${server.url}/anything`);
			assert.equal(res.status, 200);
			assert.match(await res.text(), /^Running \/anything in /);
		});
	});

	describe("build", () => {
		before(async () => runBuild(cwd));

		it("prerenders / to client output", () => {
			const indexPath = join(cwd, "dist/client/index.html");
			assert.ok(existsSync(indexPath));
			assert.match(readFileSync(indexPath, "utf8"), /<div>foo<\/div>/);
		});

		it("emits server function for dynamic routes", () => {
			assert.ok(existsSync(join(cwd, "dist/server/index.mjs")));
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
			assert.match(await res.text(), /<div>foo<\/div>/);
		});

		it("serves dynamic route via handler", async () => {
			const res = await fetch(`${server.url}/anything`);
			assert.equal(res.status, 200);
			assert.match(await res.text(), /^Running \/anything in /);
		});
	});
});
