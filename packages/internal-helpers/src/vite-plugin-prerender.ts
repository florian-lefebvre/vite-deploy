import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { preview, type Logger, type Plugin } from "vite";
import type { Format, PrerenderOptions } from "./types.js";
import { styleText } from "node:util";
import { VITE_ENVIRONMENT_NAMES } from "./constants.js";
import { normalizeEntrypoint } from "./utils.js";
import packageJson from "../package.json" with { type: "json" };

const PACKAGE_NAME = packageJson.name;
const DIST_DIR = "dist";
const PRERENDER_INPUT = "prerender";

function cleanOutdirPlugin(): Plugin {
  let ran = false;

  return {
    name: `${PACKAGE_NAME}:clean-outdir`,
    sharedDuringBuild: true,
    enforce: "pre",
    async buildStart() {
      if (ran) return;

      await rm(join(this.environment.config.root, DIST_DIR), {
        force: true,
        recursive: true,
      });
      ran = true;
    },
  };
}

async function getStaticPaths(
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

function normalizePaths(input: Array<string>): Array<string> {
  return [
    ...new Set(
      input.map((path) => {
        if (path[0] !== "/") {
          path = "/" + path;
        }
        return path;
      }),
    ),
  ];
}

function configPlugin(): Plugin {
  return {
    name: `${PACKAGE_NAME}:config`,
    sharedDuringBuild: true,
    configEnvironment(name) {
      if (name === VITE_ENVIRONMENT_NAMES.client) {
        return {
          build: {
            outDir: `${DIST_DIR}/client`,
          },
        };
      }
      if (name === VITE_ENVIRONMENT_NAMES.server) {
        return {
          build: {
            outDir: `${DIST_DIR}/server`,
            rolldownOptions: {
              output: {
                entryFileNames: "[name].mjs",
              },
            },
          },
        };
      }
    },
  };
}

function getTimeStat(timeStart: number, timeEnd: number): string {
  const buildTime = timeEnd - timeStart;
  return buildTime < 750
    ? `${Math.round(buildTime)}ms`
    : `${(buildTime / 1000).toFixed(2)}s`;
}

function isRedirectResponse(res: Response): boolean {
  return res.status >= 300 && res.status < 400 && res.headers.has("location");
}

async function localFetch({
  path,
  baseUrl,
  options,
  maxRedirects = 5,
  logger,
}: {
  path: string;
  baseUrl: URL;
  options?: RequestInit;
  maxRedirects?: number;
  logger: Logger;
}): Promise<Response> {
  const url = new URL(path, baseUrl);
  const request = new Request(url, options);
  const response = await fetch(request);

  if (isRedirectResponse(response) && maxRedirects > 0) {
    const location = response.headers.get("location")!;
    if (location.startsWith("http://localhost") || location.startsWith("/")) {
      const newUrl = location.replace("http://localhost", "");
      return localFetch({
        path: newUrl,
        baseUrl,
        options,
        maxRedirects: maxRedirects - 1,
        logger,
      });
    } else {
      logger.warn(`Skipping redirect to external location: ${location}`);
    }
  }

  return response;
}

function getRouteFilename({
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
    return path + "index.html";
  }

  if (format === "file") {
    if (path.endsWith(".html")) {
      return path;
    }
    return path + ".html";
  }

  if (path.endsWith("/index.html")) {
    return path;
  }
  if (path.endsWith(".html")) {
    return path.slice(0, -5) + "/index.html";
  }
  return path + "/index.html";
}

interface Options {
  userOptions: PrerenderOptions;
  onStaticBuildDone: (params: { clientOutDir: string }) => void | Promise<void>;
}

function prerenderPlugin({ userOptions, onStaticBuildDone }: Options): Plugin {
  // In server mode, it's always false and not updated later
  let prerender = userOptions.output !== "server";
  let root: string;

  return {
    name: `${PACKAGE_NAME}:prerender`,
    enforce: "post",
    sharedDuringBuild: true,
    config(config) {
      root = config.root ?? process.cwd();
    },
    configEnvironment(name, config) {
      if (
        userOptions.output !== "server" &&
        name === VITE_ENVIRONMENT_NAMES.server
      ) {
        config.build ??= {};
        // Clean the prerender specific files when running the full server build
        config.build.emptyOutDir = true;
        config.build.rolldownOptions ??= {};

        // We normalize the rolldown input because the object is the only one
        // which allows identifying specific ones
        if (typeof config.build.rolldownOptions.input === "string") {
          config.build.rolldownOptions.input = {
            index: config.build.rolldownOptions.input,
          };
        } else if (Array.isArray(config.build.rolldownOptions.input)) {
          config.build.rolldownOptions.input = Object.fromEntries(
            config.build.rolldownOptions.input.map((v, i) => [`index_${i}`, v]),
          );
        }

        config.build.rolldownOptions.input ??= {};
        config.build.rolldownOptions.input[PRERENDER_INPUT] =
          normalizeEntrypoint(root, userOptions.prerender.entrypoint);
      }
    },
    transform: {
      order: "pre",
      filter: {
        code: {
          include: "import.meta.env.PRERENDER",
        },
      },
      handler(code) {
        if (this.environment.name === VITE_ENVIRONMENT_NAMES.server) {
          return code.replaceAll(
            "import.meta.env.PRERENDER",
            JSON.stringify(prerender),
          );
        }
      },
    },
    buildApp: {
      order: "post",
      async handler(builder) {
        if (userOptions.output === "server") return;

        const serverEnv = builder.environments[VITE_ENVIRONMENT_NAMES.server];
        const clientEnv = builder.environments[VITE_ENVIRONMENT_NAMES.client];
        if (!serverEnv || !clientEnv) {
          throw new Error("Missing environments");
        }

        const prerenderEntrypointMod = await import(
          join(
            serverEnv.config.root,
            serverEnv.config.build.outDir,
            `${PRERENDER_INPUT}.mjs`,
          )
        );
        const paths = normalizePaths(
          await getStaticPaths(prerenderEntrypointMod),
        );

        serverEnv.logger.info(
          `\nprerendering (${paths.length} route${paths.length === 1 ? "" : "s"})...\n`,
        );
        const now = performance.now();

        const previewServer = await preview({
          configFile: serverEnv.config.configFile,
          preview: {
            port: 0,
            open: false,
          },
        });
        const localUrl = previewServer.resolvedUrls?.local.at(0);
        if (!localUrl) {
          throw new Error("Could not find url");
        }
        const baseUrl = new URL(localUrl);

        const clientOutDir = join(
          clientEnv.config.root,
          clientEnv.config.build.outDir,
        );

        for (const path of paths) {
          const res = await localFetch({
            path,
            baseUrl,
            logger: serverEnv.logger,
            options: {
              headers: userOptions.prerender.headers,
            },
          });

          if (!res.ok) {
            if (isRedirectResponse(res)) {
              serverEnv.logger.warn(`Max redirects reached for ${path}`);
            }
            throw new Error(`Failed to fetch ${path}: ${res.statusText}`, {
              cause: res,
            });
          }

          const cleanPagePath = path.split(/[?#]/)[0]!;

          const filename = getRouteFilename({
            path: cleanPagePath,
            format: userOptions.prerender.format ?? "file",
            htmlContentType: !!res.headers
              .get("content-type")
              ?.includes("html"),
          });

          const html = await res.text();

          const filepath = join(clientOutDir, filename);

          await mkdir(dirname(filepath), { recursive: true });
          await writeFile(filepath, html);
        }

        await previewServer.close();
        serverEnv.logger.info(
          styleText(
            "green",
            `\n✓ prerendered in ${getTimeStat(now, performance.now())}\n`,
          ),
        );

        if (userOptions.output === "static") {
          await onStaticBuildDone({ clientOutDir });
          return;
        }

        // It is normalized by now
        delete (
          serverEnv.config.build.rolldownOptions.input as Record<string, string>
        ).prerender;
        prerender = false;

        await builder.build(serverEnv);
      },
    },
  };
}

export function createPrerenderPlugin(options: Options): Array<Plugin> {
  return [cleanOutdirPlugin(), configPlugin(), prerenderPlugin(options)];
}
