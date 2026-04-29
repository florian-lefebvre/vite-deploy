import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  BuildEnvironment,
  preview,
  type Logger,
  type Plugin,
  type ResolvedConfig,
} from "vite";
import type { Format, PrerenderOptions } from "./types.js";
import { styleText } from "node:util";
import { VITE_ENVIRONMENT_NAMES } from "./constants.js";
import packageJson from "../package.json" with { type: "json" };

const PACKAGE_NAME = packageJson.name;
const PRERENDER_INPUT = "prerender";
const ENTRYPOINT_VIRTUAL_MODULE = `virtual:${PACKAGE_NAME}/entrypoint`;

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
  onBuildDone?: (params: {
    output: PrerenderOptions["output"];
    clientEnvironment: BuildEnvironment;
    serverEnvironment: BuildEnvironment;
  }) => void | Promise<void>;
}

export function createPrerenderPlugin({
  userOptions,
  onBuildDone,
}: Options): Plugin {
  // In server mode, it's always false and not updated later
  let prerender = userOptions.output !== "server";
  let cleaned = false;
  let config: ResolvedConfig;

  return {
    name: `${PACKAGE_NAME}:prerender`,
    enforce: "post",
    sharedDuringBuild: true,
    configEnvironment(name, config) {
      if (name === VITE_ENVIRONMENT_NAMES.server) {
        config.build ??= {};
        config.build.rolldownOptions ??= {};
        config.build.rolldownOptions.output ??= [];
        if (!Array.isArray(config.build.rolldownOptions.output)) {
          config.build.rolldownOptions.output = [
            config.build.rolldownOptions.output,
          ];
        }
        config.build.rolldownOptions.output.push({
          entryFileNames: "[name].mjs",
        });

        if (userOptions.output !== "server") {
          // Clean the prerender specific files when running the full server build
          config.build.emptyOutDir = true;

          // We normalize the rolldown input because the object is the only one
          // which allows identifying specific ones
          if (typeof config.build.rolldownOptions.input === "string") {
            config.build.rolldownOptions.input = {
              index: config.build.rolldownOptions.input,
            };
          } else if (Array.isArray(config.build.rolldownOptions.input)) {
            config.build.rolldownOptions.input = Object.fromEntries(
              config.build.rolldownOptions.input.map((v, i) => [
                `index_${i}`,
                v,
              ]),
            );
          }

          config.build.rolldownOptions.input ??= {};
          config.build.rolldownOptions.input[PRERENDER_INPUT] =
            ENTRYPOINT_VIRTUAL_MODULE;
        }
      }
    },
    configResolved(_config) {
      config = _config;
    },
    resolveId: {
      filter: {
        id: new RegExp(`^(${ENTRYPOINT_VIRTUAL_MODULE})$`),
      },
      handler(_id, ...args) {
        return userOptions.output === "server"
          ? undefined
          : this.resolve(userOptions.prerender.entrypoint.toString(), ...args);
      },
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
    async buildStart() {
      if (cleaned) return;

      for (const environment of Object.values(config.environments)) {
        const candidate = dirname(join(config.root, environment.build.outDir));
        if (candidate === config.root) {
          continue;
        }
        await rm(dirname(join(config.root, environment.build.outDir)), {
          force: true,
          recursive: true,
        });
      }

      cleaned = true;
    },
    buildApp: {
      order: "post",
      async handler(builder) {
        const serverEnvironment =
          builder.environments[VITE_ENVIRONMENT_NAMES.server];
        const clientEnvironment =
          builder.environments[VITE_ENVIRONMENT_NAMES.client];
        if (!serverEnvironment || !clientEnvironment) {
          throw new Error("Missing environments");
        }

        if (userOptions.output === "server") {
          await onBuildDone?.({
            output: "server",
            clientEnvironment,
            serverEnvironment,
          });
          return;
        }

        const prerenderEntrypointMod = await import(
          join(
            serverEnvironment.config.root,
            serverEnvironment.config.build.outDir,
            `${PRERENDER_INPUT}.mjs`,
          )
        );
        // TODO: consider allow generators so that prerendering some routes
        // can discover more routes. or a context based API like ctx.enqueue(...urls)
        const paths = normalizePaths(
          await getStaticPaths(prerenderEntrypointMod),
        );

        serverEnvironment.logger.info(
          `\nprerendering (${paths.length} route${paths.length === 1 ? "" : "s"})...\n`,
        );
        const now = performance.now();

        const previewServer = await preview({
          configFile: serverEnvironment.config.configFile,
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

        for (const path of paths) {
          const res = await localFetch({
            path,
            baseUrl,
            logger: serverEnvironment.logger,
            options: {
              headers: userOptions.prerender.headers,
            },
          });

          if (!res.ok) {
            if (isRedirectResponse(res)) {
              serverEnvironment.logger.warn(
                `Max redirects reached for ${path}`,
              );
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

          const filepath = join(
            clientEnvironment.config.root,
            clientEnvironment.config.build.outDir,
            filename,
          );

          await mkdir(dirname(filepath), { recursive: true });
          await writeFile(filepath, html);
        }

        await previewServer.close();
        serverEnvironment.logger.info(
          styleText(
            "green",
            `\n✓ prerendered in ${getTimeStat(now, performance.now())}${userOptions.output === "static" ? "" : "\n"}`,
          ),
        );

        if (userOptions.output === "static") {
          await onBuildDone?.({
            output: "static",
            clientEnvironment,
            serverEnvironment,
          });
          return;
        }

        // It is normalized by now
        delete (
          serverEnvironment.config.build.rolldownOptions.input as Record<
            string,
            string
          >
        ).prerender;
        prerender = false;

        await builder.build(serverEnvironment);

        await onBuildDone?.({
          output: "hybrid",
          clientEnvironment,
          serverEnvironment,
        });
      },
    },
  };
}
