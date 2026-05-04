import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	getRouteFilename,
	getStaticPaths,
	getTimeStat,
	isRedirectResponse,
	localFetch,
	normalizePaths,
} from "../src/utils.ts";

describe("getStaticPaths", () => {
	it("throws when the module has no default export", async () => {
		await assert.rejects(() => getStaticPaths({}), /invalid shape/);
	});

	it("throws when the default export has no getStaticPaths", async () => {
		await assert.rejects(
			() => getStaticPaths({ default: {} }),
			/invalid shape/,
		);
	});

	it("throws when getStaticPaths does not return an array", async () => {
		await assert.rejects(
			() => getStaticPaths({ default: { getStaticPaths: () => "nope" } }),
			/not an array of strings/,
		);
	});

	it("throws when getStaticPaths returns non-string entries", async () => {
		await assert.rejects(
			() =>
				getStaticPaths({
					default: { getStaticPaths: () => ["/ok", 42] },
				}),
			/not an array of strings/,
		);
	});

	it("returns paths from a sync getStaticPaths", async () => {
		const paths = await getStaticPaths({
			default: { getStaticPaths: () => ["/a", "/b"] },
		});
		assert.deepEqual(paths, ["/a", "/b"]);
	});

	it("returns paths from an async getStaticPaths", async () => {
		const paths = await getStaticPaths({
			default: { getStaticPaths: async () => ["/a"] },
		});
		assert.deepEqual(paths, ["/a"]);
	});
});

describe("normalizePaths", () => {
	it("prefixes paths missing a leading slash", () => {
		assert.deepEqual(normalizePaths(["foo", "bar"]), ["/foo", "/bar"]);
	});

	it("leaves already-prefixed paths untouched", () => {
		assert.deepEqual(normalizePaths(["/foo", "/bar"]), ["/foo", "/bar"]);
	});

	it("dedupes paths after normalization", () => {
		assert.deepEqual(normalizePaths(["foo", "/foo", "bar"]), ["/foo", "/bar"]);
	});

	it("returns an empty array for an empty input", () => {
		assert.deepEqual(normalizePaths([]), []);
	});
});

describe("getTimeStat", () => {
	it("formats sub-750ms durations as milliseconds", () => {
		assert.equal(getTimeStat(0), "0ms");
		assert.equal(getTimeStat(123.4), "123ms");
		assert.equal(getTimeStat(749), "749ms");
	});

	it("formats >=750ms durations as seconds with two decimals", () => {
		assert.equal(getTimeStat(750), "0.75s");
		assert.equal(getTimeStat(1500), "1.50s");
		assert.equal(getTimeStat(12_345), "12.35s");
	});
});

describe("isRedirectResponse", () => {
	it("returns true for 3xx responses with a location header", () => {
		const res = new Response(null, {
			status: 301,
			headers: { location: "/elsewhere" },
		});
		assert.equal(isRedirectResponse(res), true);
	});

	it("returns false for 3xx responses without a location header", () => {
		const res = new Response(null, { status: 304 });
		assert.equal(isRedirectResponse(res), false);
	});

	it("returns false for 2xx responses with a location header", () => {
		const res = new Response(null, {
			status: 200,
			headers: { location: "/elsewhere" },
		});
		assert.equal(isRedirectResponse(res), false);
	});

	it("returns false for 4xx responses", () => {
		const res = new Response(null, { status: 404 });
		assert.equal(isRedirectResponse(res), false);
	});
});

describe("localFetch", () => {
	const baseUrl = new URL("http://localhost:3000");

	it("builds the request URL from baseUrl + path", async () => {
		let received: Request | undefined;
		const res = await localFetch({
			path: "/hello",
			baseUrl,
			warn: () => {},
			fetch: async (req) => {
				received = req;
				return new Response("ok");
			},
		});
		assert.equal(received?.url, "http://localhost:3000/hello");
		assert.equal(await res.text(), "ok");
	});

	it("follows redirects whose location starts with /", async () => {
		const seen: Array<string> = [];
		const res = await localFetch({
			path: "/start",
			baseUrl,
			warn: () => {},
			fetch: async (req) => {
				seen.push(new URL(req.url).pathname);
				if (seen.length === 1) {
					return new Response(null, {
						status: 302,
						headers: { location: "/next" },
					});
				}
				return new Response("done");
			},
		});
		assert.deepEqual(seen, ["/start", "/next"]);
		assert.equal(await res.text(), "done");
	});

	it("follows redirects whose location is an http://localhost URL", async () => {
		const seen: Array<string> = [];
		const res = await localFetch({
			path: "/start",
			baseUrl,
			warn: () => {},
			fetch: async (req) => {
				seen.push(new URL(req.url).pathname);
				if (seen.length === 1) {
					return new Response(null, {
						status: 301,
						headers: { location: "http://localhost:3000/next" },
					});
				}
				return new Response("done");
			},
		});
		assert.deepEqual(seen, ["/start", "/:3000/next"]);
		assert.equal(await res.text(), "done");
	});

	it("skips external redirects and warns", async () => {
		const warnings: Array<string> = [];
		let calls = 0;
		const res = await localFetch({
			path: "/start",
			baseUrl,
			warn: (m) => warnings.push(m),
			fetch: async () => {
				calls++;
				return new Response(null, {
					status: 302,
					headers: { location: "https://example.com/elsewhere" },
				});
			},
		});
		assert.equal(calls, 1);
		assert.equal(res.status, 302);
		assert.equal(warnings.length, 1);
		assert.match(warnings.at(0) ?? "", /external location/);
	});

	it("stops following once maxRedirects is exhausted", async () => {
		let calls = 0;
		const res = await localFetch({
			path: "/loop",
			baseUrl,
			maxRedirects: 2,
			warn: () => {},
			fetch: async () => {
				calls++;
				return new Response(null, {
					status: 302,
					headers: { location: "/loop" },
				});
			},
		});
		assert.equal(calls, 3);
		assert.equal(res.status, 302);
	});
});

describe("getRouteFilename", () => {
	it("returns non-HTML paths unchanged", () => {
		assert.equal(
			getRouteFilename({
				path: "/assets/app.css",
				htmlContentType: false,
				format: "file",
			}),
			"/assets/app.css",
		);
	});

	it("appends index.html to paths ending with /", () => {
		assert.equal(
			getRouteFilename({
				path: "/blog/",
				htmlContentType: true,
				format: "file",
			}),
			"/blog/index.html",
		);
		assert.equal(
			getRouteFilename({
				path: "/blog/",
				htmlContentType: true,
				format: "directory",
			}),
			"/blog/index.html",
		);
	});

	it("file format keeps existing .html paths", () => {
		assert.equal(
			getRouteFilename({
				path: "/about.html",
				htmlContentType: true,
				format: "file",
			}),
			"/about.html",
		);
	});

	it("file format appends .html to extensionless paths", () => {
		assert.equal(
			getRouteFilename({
				path: "/about",
				htmlContentType: true,
				format: "file",
			}),
			"/about.html",
		);
	});

	it("directory format keeps existing /index.html paths", () => {
		assert.equal(
			getRouteFilename({
				path: "/about/index.html",
				htmlContentType: true,
				format: "directory",
			}),
			"/about/index.html",
		);
	});

	it("directory format rewrites /foo.html to /foo/index.html", () => {
		assert.equal(
			getRouteFilename({
				path: "/about.html",
				htmlContentType: true,
				format: "directory",
			}),
			"/about/index.html",
		);
	});

	it("directory format appends /index.html to extensionless paths", () => {
		assert.equal(
			getRouteFilename({
				path: "/about",
				htmlContentType: true,
				format: "directory",
			}),
			"/about/index.html",
		);
	});

	it("treats .html paths as HTML even with htmlContentType=false", () => {
		assert.equal(
			getRouteFilename({
				path: "/about.html",
				htmlContentType: false,
				format: "directory",
			}),
			"/about/index.html",
		);
	});
});
