import type { Format } from "./types.js";

export async function getStaticPaths(
	mod: Record<string, any>,
): Promise<Array<string>> {
	if (!("default" in mod && "getStaticPaths" in mod.default)) {
		throw new Error("Prerender entrypoint returns an invalid shape");
	}
	const paths = await mod.default.getStaticPaths();
	if (!Array.isArray(paths) || !paths.every((e) => typeof e === "string")) {
		throw new Error(
			"Paths returned by getStaticPaths() are not an array of strings",
		);
	}
	return paths;
}

export function normalizePaths(input: Array<string>): Array<string> {
	return [
		...new Set(
			input.map((path) => {
				if (path[0] !== "/") {
					path = `/${path}`;
				}
				return path;
			}),
		),
	];
}

export function getTimeStat(buildTime: number): string {
	return buildTime < 750
		? `${Math.round(buildTime)}ms`
		: `${(buildTime / 1000).toFixed(2)}s`;
}

export function isRedirectResponse(res: Response): boolean {
	return res.status >= 300 && res.status < 400 && res.headers.has("location");
}

export async function localFetch({
	path,
	baseUrl,
	options,
	maxRedirects = 5,
	warn,
	fetch,
}: {
	path: string;
	baseUrl: URL;
	options?: RequestInit;
	maxRedirects?: number;
	warn: (message: string) => void;
	fetch: (request: Request) => Promise<Response>;
}): Promise<Response> {
	const url = new URL(path, baseUrl);
	const request = new Request(url, options);
	const response = await fetch(request);

	if (isRedirectResponse(response) && maxRedirects > 0) {
		const location = response.headers.get("location") ?? "";
		if (location.startsWith("http://localhost") || location.startsWith("/")) {
			const newUrl = location.replace("http://localhost", "");
			return localFetch({
				path: newUrl,
				baseUrl,
				options,
				maxRedirects: maxRedirects - 1,
				warn,
				fetch,
			});
		} else {
			warn(`Skipping redirect to external location: ${location}`);
		}
	}

	return response;
}

export function getRouteFilename({
	path,
	htmlContentType,
	format,
}: {
	path: string;
	htmlContentType: boolean;
	format: Format;
}): string {
	// No magic for non-HTML files
	if (!htmlContentType && !path.endsWith(".html")) {
		return path;
	}

	if (path.endsWith("/")) {
		return `${path}index.html`;
	}

	if (format === "file") {
		if (path.endsWith(".html")) {
			return path;
		}
		return `${path}.html`;
	}

	if (path.endsWith("/index.html")) {
		return path;
	}
	if (path.endsWith(".html")) {
		return `${path.slice(0, -5)}/index.html`;
	}
	return `${path}/index.html`;
}
