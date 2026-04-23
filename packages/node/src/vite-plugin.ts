import { createRequest, sendResponse } from "@remix-run/node-fetch-server";
import {
  createBuildPlugin,
  createPrerenderPlugin,
  normalizeEntrypoint,
  VITE_ENVIRONMENT_NAMES,
} from "@vite-deploy/internal-helpers";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { styleText } from "node:util";
import sirv from "sirv";
import {
  isRunnableDevEnvironment,
  type Connect,
  type Plugin,
  type ResolvedConfig,
} from "vite";
import packageJson from "../package.json" with { type: "json" };
import type { ExportedHandler, Options } from "./types.js";

const PACKAGE_NAME = packageJson.name;
const MAIN_INPUT = "index";
const HANDLER_INPUT = "handler";
const MAIN_ENTRYPOINT_VIRTUAL_MODULE = `virtual:${PACKAGE_NAME}/main-entrypoint`;
const HANDLER_ENTRYPOINT_VIRTUAL_MODULE = `virtual:${PACKAGE_NAME}/handler-entrypoint`;

function configPlugin(options: Options): Plugin {
  let resolvedHandlerEntrypoint: string;
  let resolvedServerEntrypoint: string | undefined;

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
    configResolved(config) {
      resolvedHandlerEntrypoint = normalizeEntrypoint(
        config.root,
        options.handlerEntrypoint,
      );
      if (options.output !== "static") {
        resolvedServerEntrypoint = normalizeEntrypoint(
          config.root,
          options.serverEntrypoint,
        );
      }
    },
    configEnvironment(name) {
      if (name === VITE_ENVIRONMENT_NAMES.client) {
        return {
          build: {
            outDir: "dist/client",
          },
        };
      }
      if (name === VITE_ENVIRONMENT_NAMES.server) {
        return {
          build: {
            outDir: "dist/server",
            rolldownOptions: {
              input: {
                [MAIN_INPUT]: MAIN_ENTRYPOINT_VIRTUAL_MODULE,
                [HANDLER_INPUT]: HANDLER_ENTRYPOINT_VIRTUAL_MODULE,
              },
            },
            manifest: true,
            copyPublicDir: false,
          },
        };
      }
    },
    resolveId: {
      filter: {
        id: new RegExp(
          `^(${MAIN_ENTRYPOINT_VIRTUAL_MODULE}|${HANDLER_ENTRYPOINT_VIRTUAL_MODULE})$`,
        ),
      },
      handler(id) {
        if (id === MAIN_ENTRYPOINT_VIRTUAL_MODULE) {
          return resolvedServerEntrypoint;
        }
        return resolvedHandlerEntrypoint;
      },
    },
  };
}

function getTimeStat(buildTime: number): string {
  return buildTime < 750
    ? `${Math.round(buildTime)}ms`
    : `${(buildTime / 1000).toFixed(2)}s`;
}

function validateMod(mod: Record<string, any>) {
  if (
    !("default" in mod && ("fetch" in mod.default || "handler" in mod.default))
  ) {
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
      const mod = validateMod(await getMod());

      if ("handler" in mod.default) {
        return mod.default.handler(req, res);
      }

      request = createRequest(req, res);

      let response = await mod.default.fetch(request);

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
  let resolvedHandlerEntrypoint: string;

  return {
    name: `${PACKAGE_NAME}:dev`,
    sharedDuringBuild: true,
    configResolved(config) {
      resolvedHandlerEntrypoint = normalizeEntrypoint(
        config.root,
        options.handlerEntrypoint,
      );
    },
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
              return await serverEnv.runner.import(resolvedHandlerEntrypoint);
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
          getMod() {
            return import(
              join(
                config.root,
                config.environments[VITE_ENVIRONMENT_NAMES.server]!.build
                  .outDir,
                `${HANDLER_INPUT}.mjs`,
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

export function node({
  handlerEntrypoint,
  ...userOptions
}: Options): Array<Plugin> {
  return [
    ...createBuildPlugin(),
    ...createPrerenderPlugin({
      userOptions,
      onBuildDone: async ({ output, serverEnvironment }) => {
        if (output !== "static") return;

        await rm(
          join(
            serverEnvironment.config.root,
            serverEnvironment.config.build.outDir,
          ),
          {
            force: true,
            recursive: true,
          },
        );
      },
    }),
    configPlugin({ handlerEntrypoint, ...userOptions }),
    devPlugin({ handlerEntrypoint }),
    previewPlugin(),
  ];
}
