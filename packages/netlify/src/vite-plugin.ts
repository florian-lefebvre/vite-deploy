import netlifyPlugin from "@netlify/vite-plugin";
import { createRequest, sendResponse } from "@remix-run/node-fetch-server";
import {
  createPrerenderPlugin,
  VITE_ENVIRONMENT_NAMES,
  normalizeEntrypoint,
} from "@vite-deploy/internal-helpers";
import { existsSync, readdirSync, readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { styleText } from "node:util";
import sirv from "sirv";
import {
  isRunnableDevEnvironment,
  type Connect,
  type Manifest,
  type Plugin,
  type ResolvedConfig,
} from "vite";
import type { ExportedHandler, Options } from "./types.js";
import packageJson from "../package.json" with { type: "json" };

const PACKAGE_NAME = packageJson.name;
const MAIN_INPUT = "index";
const CLIENT_FALLBACK_ENTRY_VIRTUAL_MODULE = `virtual:${PACKAGE_NAME}/client-fallback-entry`;
const RESOLVED_CLIENT_FALLBACK_ENTRY_VIRTUAL_MODULE =
  "\0" + CLIENT_FALLBACK_ENTRY_VIRTUAL_MODULE;
const CLIENT_FALLBACK_ENTRY_NAME = "__netlify_fallback_entry__";
const PRODUCTION_HANDLER_VIRTUAL_MODULE = `virtual:${PACKAGE_NAME}/production-handler`;
const RESOLVED_PRODUCTION_HANDLER_VIRTUAL_MODULE =
  "\0" + PRODUCTION_HANDLER_VIRTUAL_MODULE;

function configPlugin(): Plugin {
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
            outDir: "dist",
          },
        };
      }
      if (name === VITE_ENVIRONMENT_NAMES.server) {
        return {
          build: {
            outDir: ".netlify/v1/functions",
            rolldownOptions: {
              input: {
                [MAIN_INPUT]: PRODUCTION_HANDLER_VIRTUAL_MODULE,
              },
            },
            manifest: true,
            copyPublicDir: false,
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
              clientEnv.config.build.rolldownOptions.input =
                CLIENT_FALLBACK_ENTRY_VIRTUAL_MODULE;
              clientEnv.config.build.rolldownOptions.logLevel = "silent";
              clientEnv.config.build.rolldownOptions.output = {
                entryFileNames: CLIENT_FALLBACK_ENTRY_NAME,
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

function productionHandlerPlugin(
  options: Pick<Options, "handlerEntrypoint">,
): Plugin {
  let resolvedEntrypoint: string;

  return {
    name: `${PACKAGE_NAME}:production-handler`,
    sharedDuringBuild: true,
    applyToEnvironment(environment) {
      return environment.name === VITE_ENVIRONMENT_NAMES.server;
    },
    configResolved(config) {
      resolvedEntrypoint = normalizeEntrypoint(
        config.root,
        options.handlerEntrypoint,
      );
    },
    resolveId: {
      filter: {
        id: new RegExp(`^(${PRODUCTION_HANDLER_VIRTUAL_MODULE})$`),
      },
      handler() {
        return RESOLVED_PRODUCTION_HANDLER_VIRTUAL_MODULE;
      },
    },
    load: {
      filter: {
        id: new RegExp(`^(${RESOLVED_PRODUCTION_HANDLER_VIRTUAL_MODULE})$`),
      },
      handler() {
        return `
import handlerEntrypoint from "${resolvedEntrypoint}";

export default handlerEntrypoint.fetch;

export const config = {
  name: "${PACKAGE_NAME} server handler",
  generator: "${PACKAGE_NAME}@${packageJson.version}",
  path: "/*",
  preferStatic: true,
};
`;
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
            const mod = await import(
              join(
                config.root,
                config.environments[VITE_ENVIRONMENT_NAMES.server]!.build
                  .outDir,
                `${MAIN_INPUT}.mjs`,
              )
            );
            return {
              default: {
                fetch: mod.default,
              },
            };
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

export function netlify({
  config,
  handlerEntrypoint,
  ...userOptions
}: Options): Array<Plugin> {
  return [
    ...netlifyPlugin({
      ...config,
      middleware: true,
    }),
    ...createPrerenderPlugin({
      userOptions,
    }),
    configPlugin(),
    devPlugin({ handlerEntrypoint }),
    buildPlugin(),
    virtualClientFallbackPlugin(),
    previewPlugin(),
    productionHandlerPlugin({ handlerEntrypoint }),
  ];
}
