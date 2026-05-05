import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import {
	exampleDir,
	runBuild,
	type ServerHandle,
	startServer,
} from "@vite-deploy/internal-helpers/test";

const cwd = exampleDir("netlify-server");

describe("netlify-server", () => {
	describe("dev", () => {
		let server: ServerHandle;
		before(async () => {
			server = await startServer({ cwd, mode: "dev" });
		});
		after(async () => server.stop());

		it("renders / as HTML", async () => {
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

		it("emits client output", () => {
			assert.ok(existsSync(join(cwd, "dist/favicon.svg")));
		});

		it("emits server function", () => {
			assert.ok(existsSync(join(cwd, ".netlify/v1/functions/index.mjs")));
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

		it("renders / as HTML", async () => {
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
});
