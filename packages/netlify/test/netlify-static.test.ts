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

const cwd = exampleDir("netlify-static");

describe("netlify-static", () => {
	describe("dev", () => {
		let server: ServerHandle;
		before(async () => {
			server = await startServer({ cwd, mode: "dev" });
		});
		after(async () => server.stop());

		it("renders / from handler", async () => {
			const res = await fetch(`${server.url}/`);
			assert.equal(res.status, 200);
			assert.match(res.headers.get("content-type") ?? "", /text\/html/);
			assert.match(await res.text(), /<div>foo<\/div>/);
		});

		it("returns 404 for unknown route", async () => {
			const res = await fetch(`${server.url}/missing`);
			assert.equal(res.status, 404);
			void res.body?.cancel();
		});
	});

	describe("build", () => {
		before(async () => runBuild(cwd));

		it("prerenders / to client output", () => {
			const indexPath = join(cwd, "dist/index.html");
			assert.ok(existsSync(indexPath));
			assert.match(readFileSync(indexPath, "utf8"), /<div>foo<\/div>/);
		});

		it("does not emit server function", () => {
			assert.ok(!existsSync(join(cwd, ".netlify/v1/functions/index.mjs")));
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

		it("returns 404 for unknown route", async () => {
			const res = await fetch(`${server.url}/missing`);
			assert.equal(res.status, 404);
			void res.body?.cancel();
		});
	});
});
