import { createRequest, sendResponse } from "@remix-run/node-fetch-server";
import {
  createBuildPlugin,
  createPrerenderPlugin,
  normalizeEntrypoint,
  VITE_ENVIRONMENT_NAMES,
} from "@vite-deploy/internal-helpers";
import { rm, writeFile } from "node:fs/promises";
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
const ENTRYPOINT_VIRTUAL_MODULE = `virtual:${PACKAGE_NAME}/entrypoint`;

function configPlugin(options: Pick<Options, "handlerEntrypoint">): Plugin {
  let resolvedEntrypoint: string;

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
      resolvedEntrypoint = normalizeEntrypoint(
        config.root,
        options.handlerEntrypoint,
      );
    },
    configEnvironment(name) {
      if (name === VITE_ENVIRONMENT_NAMES.client) {
        return {
          build: {
            outDir: ".vercel/output/static",
          },
        };
      }
      if (name === VITE_ENVIRONMENT_NAMES.server) {
        return {
          build: {
            outDir: ".vercel/output/render.func",
            rolldownOptions: {
              input: {
                [MAIN_INPUT]: ENTRYPOINT_VIRTUAL_MODULE,
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
        id: new RegExp(`^(${ENTRYPOINT_VIRTUAL_MODULE})$`),
      },
      handler() {
        return resolvedEntrypoint;
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
      // TODO: https://vercel.com/docs/headers/request-headers?framework=other

      const mod = validateMod(await getMod());

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
  let resolvedEntrypoint: string;

  return {
    name: `${PACKAGE_NAME}:dev`,
    sharedDuringBuild: true,
    configResolved(config) {
      resolvedEntrypoint = normalizeEntrypoint(
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
              return await serverEnv.runner.import(resolvedEntrypoint);
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

export function vercel({
  handlerEntrypoint,
  ...userOptions
}: Options): Array<Plugin> {
  return [
    ...createBuildPlugin(),
    createPrerenderPlugin({
      userOptions,
      onBuildDone: async ({ output, serverEnvironment }) => {
        const serverOutDir = join(
          serverEnvironment.config.root,
          serverEnvironment.config.build.outDir,
        );

        await writeFile(
          join(serverOutDir, "../config.json"),
          JSON.stringify({ version: 3 }),
          "utf-8",
        );

        if (output === "static") {
          await rm(serverOutDir, {
            force: true,
            recursive: true,
          });
          return;
        }

        await Promise.all([
          writeFile(
            join(serverOutDir, "package.json"),
            JSON.stringify({ type: "module" }),
            "utf-8",
          ),
          writeFile(
            join(serverOutDir, ".vc-config.json"),
            JSON.stringify({
              runtime: "nodejs",
              handler: `${MAIN_INPUT}.mjs`,
              launcherType: "Nodejs",
              supportsResponseStreaming: true,
            }),
            "utf-8",
          ),
        ]);
      },
    }),
    configPlugin({ handlerEntrypoint }),
    devPlugin({ handlerEntrypoint }),
    previewPlugin(),
  ];
}
