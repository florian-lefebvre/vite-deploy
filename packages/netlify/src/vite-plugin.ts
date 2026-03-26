import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  isRunnableDevEnvironment,
  preview,
  type Connect,
  type Logger,
  type Manifest,
  type Plugin,
  type ResolvedConfig,
} from "vite";
import netlifyPlugin from "@netlify/vite-plugin";
import type {
  ExportedHandler,
  Format,
  InternalOptions,
  Options,
} from "./types.js";
import { fileURLToPath } from "node:url";
import { styleText } from "node:util";
import { createRequest, sendResponse } from "@remix-run/node-fetch-server";
import { existsSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import sirv from "sirv";

const PACKAGE_NAME = "@vite-deploy/netlify";
const DIST_DIR = "dist";
const VITE_ENVIRONMENT_NAMES = {
  server: "ssr",
  client: "client",
} as const;
const MAIN_INPUT = "index";
const PRERENDER_INPUT = "prerender";
const CLIENT_FALLBACK_ENTRY_VIRTUAL_MODULE = `virtual:${PACKAGE_NAME}/client-fallback-entry`;
const RESOLVED_CLIENT_FALLBACK_ENTRY_VIRTUAL_MODULE =
  "\0" + CLIENT_FALLBACK_ENTRY_VIRTUAL_MODULE;
const CLIENT_FALLBACK_ENTRY_NAME = "__netlify_fallback_entry__";

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

function configPlugin(options: Pick<Options, "handlerEntrypoint">): Plugin {
  return {
    name: `${PACKAGE_NAME}:config`,
    sharedDuringBuild: true,
    config() {
      return {
        environments: {
          [VITE_ENVIRONMENT_NAMES.server]: {},
        },
      };
    },
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
              input: {
                // TODO: virtual module that emits the handler
                [MAIN_INPUT]: fileURLToPath(options.handlerEntrypoint),
              },
              output: {
                entryFileNames: "[name].mjs",
              },
            },
            manifest: true,
          },
        };
      }
    },
  };
}

function getTimeStat(buildTime: number): string {
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

function buildPlugin(): Plugin {
  return {
    name: `${PACKAGE_NAME}:build`,
    sharedDuringBuild: true,
    config() {
      return {
        builder: {
          async buildApp(builder) {
            const serverEnv =
              builder.environments[VITE_ENVIRONMENT_NAMES.server];
            const clientEnv =
              builder.environments[VITE_ENVIRONMENT_NAMES.client];
            if (!serverEnv || !clientEnv) {
              throw new Error("Missing environments");
            }

            await builder.build(serverEnv);

            const defaultHtmlPath = join(builder.config.root, "index.html");
            const hasClientEntry =
              clientEnv.config.build.rolldownOptions.input ||
              existsSync(defaultHtmlPath);
            const entryWorkerBuildDirectory = join(
              builder.config.root,
              serverEnv.config.build.outDir,
            );
            const entryWorkerManifest = loadViteManifest(
              entryWorkerBuildDirectory,
            );
            const importedAssetPaths =
              getImportedAssetPaths(entryWorkerManifest);

            if (hasClientEntry) {
              await builder.build(clientEnv);
            } else if (
              importedAssetPaths.size ||
              getHasPublicAssets(builder.config)
            ) {
              // TODO: https://github.com/vitejs/vite/issues/22033
              clientEnv.config.build.rollupOptions = {
                input: CLIENT_FALLBACK_ENTRY_VIRTUAL_MODULE,
                logLevel: "silent",
                output: {
                  entryFileNames: CLIENT_FALLBACK_ENTRY_NAME,
                },
              };

              await builder.build(clientEnv);

              const fallbackEntryPath = join(
                builder.config.root,
                clientEnv.config.build.outDir,
                CLIENT_FALLBACK_ENTRY_NAME,
              );

              unlinkSync(fallbackEntryPath);
            }
          },
        },
      };
    },
  };
}

function getHasPublicAssets({
  publicDir,
}: Pick<ResolvedConfig, "publicDir">): boolean {
  let hasPublicAssets = false;

  if (publicDir) {
    try {
      const files = readdirSync(publicDir);

      if (files.length) {
        hasPublicAssets = true;
      }
    } catch {}
  }

  return hasPublicAssets;
}

function getImportedAssetPaths(viteManifest: Manifest): Set<string> {
  const assetPaths = Object.values(viteManifest).flatMap(
    (chunk) => chunk.assets ?? [],
  );

  return new Set(assetPaths);
}

function loadViteManifest(directory: string) {
  const contents = readFileSync(
    join(directory, ".vite", "manifest.json"),
    "utf-8",
  );

  return JSON.parse(contents) as Manifest;
}

function virtualClientFallbackPlugin(): Plugin {
  return {
    name: `${PACKAGE_NAME}:virtual-client-fallback`,
    applyToEnvironment(environment) {
      return environment.name === VITE_ENVIRONMENT_NAMES.client;
    },
    resolveId: {
      filter: {
        id: new RegExp(`^(${CLIENT_FALLBACK_ENTRY_VIRTUAL_MODULE})$`),
      },
      handler() {
        return RESOLVED_CLIENT_FALLBACK_ENTRY_VIRTUAL_MODULE;
      },
    },
    load: {
      filter: {
        id: new RegExp(`^(${RESOLVED_CLIENT_FALLBACK_ENTRY_VIRTUAL_MODULE})$`),
      },
      handler() {
        return "";
      },
    },
  };
}

function prerenderPlugin(options: InternalOptions): Plugin {
  // In server mode, it's always false and not updated later
  let prerender = options.output !== "server";

  return {
    name: `${PACKAGE_NAME}:prerender`,
    enforce: "post",
    sharedDuringBuild: true,
    configEnvironment(name, config) {
      if (
        options.output !== "server" &&
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
            [MAIN_INPUT]: config.build.rolldownOptions.input,
          };
        } else if (Array.isArray(config.build.rolldownOptions.input)) {
          config.build.rolldownOptions.input = Object.fromEntries(
            config.build.rolldownOptions.input.map((v, i) => [`index_${i}`, v]),
          );
        }

        config.build.rolldownOptions.input ??= {};
        config.build.rolldownOptions.input[PRERENDER_INPUT] = fileURLToPath(
          options.prerender.entrypoint,
        );
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
        if (options.output === "server") return;

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
              headers: options.prerender.headers,
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
            format: options.prerender.format ?? "file",
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
            `\n✓ prerendered in ${getTimeStat(performance.now() - now)}\n`,
          ),
        );

        // TODO: check how static projects should be structured on netlify
        if (options.output === "static") {
          const distDir = dirname(clientOutDir);
          const tempDir = `${distDir}_tmp`;
          await rename(clientOutDir, tempDir);
          await rm(distDir, { force: true, recursive: true });
          await rename(tempDir, distDir);
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

function validateMod(mod: Record<string, any>) {
  if (!("default" in mod && "fetch" in mod.default)) {
    throw new Error("Handler entrypoint returns an invalid shape");
  }
  return mod as {
    default: ExportedHandler;
  };
}

function createMiddleware({
  getMod,
  onResponse,
}: {
  getMod: () => Promise<Record<string, any>>;
  onResponse: ((response: Response, duration: number) => void) | undefined;
}): Connect.NextHandleFunction {
  return async function middleware(req, res, next) {
    let request: Request | undefined;

    try {
      const now = performance.now();
      // Built in vite middleware trims out the base path when passing in the request
      // We can restore it by using the `originalUrl` property
      // This makes sure the worker receives the correct url in both dev using vite and production
      if (req.originalUrl) {
        req.url = req.originalUrl;
      }
      request = createRequest(req, res);

      const mod = validateMod(await getMod());

      const isHttps = req.headers["x-forwarded-proto"] === "https";
      const parseBase64JSON = <T = unknown>(header: string): T | undefined => {
        if (typeof req.headers[header] === "string") {
          try {
            return JSON.parse(
              Buffer.from(req.headers[header] as string, "base64").toString(
                "utf8",
              ),
            );
          } catch {}
        }
      };
      const isRunningInNetlify = Boolean(
        process.env.NETLIFY ||
        process.env.NETLIFY_LOCAL ||
        process.env.NETLIFY_DEV,
      );

      let response = await mod.default.fetch(request, {
        get url() {
          return new URL(request!.url);
        },
        // The dev server is a long running process, so promises will run even with a noop
        waitUntil: () => {},
        account: parseBase64JSON("x-nf-account-info") ?? {
          id: "mock-netlify-account-id",
        },
        deploy: {
          context: "dev",
          id:
            typeof req.headers["x-nf-deploy-id"] === "string"
              ? req.headers["x-nf-deploy-id"]
              : "mock-netlify-deploy-id",
          published: false,
        },
        site: parseBase64JSON("x-nf-site-info") ?? {
          id: "mock-netlify-site-id",
          name: "mock-netlify-site.netlify.app",
          url: `${isHttps ? "https" : "http"}://localhost:${isRunningInNetlify ? 8888 : 4321}`,
        },
        geo: parseBase64JSON("x-nf-geo") ?? {
          city: "Mock City",
          country: { code: "mock", name: "Mock Country" },
          subdivision: { code: "SD", name: "Mock Subdivision" },
          timezone: "UTC",
          longitude: 0,
          latitude: 0,
        },
        ip:
          typeof req.headers["x-nf-client-connection-ip"] === "string"
            ? req.headers["x-nf-client-connection-ip"]
            : (req.socket.remoteAddress ?? "127.0.0.1"),
        server: {
          region: "local-dev",
        },
        requestId:
          typeof req.headers["x-nf-request-id"] === "string"
            ? req.headers["x-nf-request-id"]
            : "mock-netlify-request-id",
        get cookies(): never {
          throw new Error("Not implemented.");
        },
        json: (input) => Response.json(input),
        log: console.info,
        next() {
          throw new Error("Not implemented.");
        },
        get params(): never {
          throw new Error("Not implemented.");
        },
        rewrite() {
          throw new Error("Not implemented.");
        },
      });

      // Vite uses HTTP/2 when `server.https` or `preview.https` is enabled
      if (req.httpVersionMajor === 2) {
        // HTTP/2 disallows use of the `transfer-encoding` header
        response.headers.delete("transfer-encoding");
      }

      onResponse?.(response, performance.now() - now);

      await sendResponse(res, response);
    } catch (error) {
      if (request?.signal.aborted) {
        // If the request was aborted, ignore the error
        return;
      }

      next(error);
    }
  };
}

function devPlugin(options: Pick<Options, "handlerEntrypoint">): Plugin {
  return {
    name: `${PACKAGE_NAME}:dev`,
    sharedDuringBuild: true,
    configureServer(server) {
      return () => {
        server.middlewares.use(
          createMiddleware({
            async getMod() {
              const serverEnv =
                server.environments[VITE_ENVIRONMENT_NAMES.server];
              if (!isRunnableDevEnvironment(serverEnv)) {
                throw new Error("Non runnable server env");
              }
              return await serverEnv.runner.import(
                fileURLToPath(options.handlerEntrypoint),
              );
            },
            onResponse: undefined,
          }),
        );
      };
    },
  };
}

function previewPlugin(): Plugin {
  let config: ResolvedConfig;
  return {
    name: `${PACKAGE_NAME}:preview`,
    sharedDuringBuild: true,
    configResolved(_config) {
      config = _config;
    },
    configurePreviewServer(server) {
      server.middlewares.use(
        sirv(
          join(
            config.root,
            config.environments[VITE_ENVIRONMENT_NAMES.client]!.build.outDir,
          ),
          {
            dev: true,
          },
        ),
      );
      server.middlewares.use(
        createMiddleware({
          async getMod() {
            return await import(
              join(
                config.root,
                config.environments[VITE_ENVIRONMENT_NAMES.server]!.build
                  .outDir,
                `${MAIN_INPUT}.mjs`,
              )
            );
          },
          onResponse(response, duration) {
            console.log(
              `${styleText("bold", "GET")} ${response.url || "/"} ${styleText("bold", styleText("green", response.status.toString()))} ${response.ok ? styleText("green", "OK") : styleText("red", "NOT OK")} (${getTimeStat(duration)})`,
            );
          },
        }),
      );
    },
  };
}

export function netlify({ config, ...options }: Options): Array<Plugin> {
  return [
    ...netlifyPlugin({
      ...config,
      middleware: true,
    }),
    cleanOutdirPlugin(),
    configPlugin(options),
    prerenderPlugin(options),
    devPlugin(options),
    buildPlugin(),
    virtualClientFallbackPlugin(),
    previewPlugin(),
  ];
}
