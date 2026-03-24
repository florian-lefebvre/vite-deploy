import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { preview, type Plugin } from "vite";
import { cloudflare as cloudflarePlugin } from "@cloudflare/vite-plugin";
import type { InternalOptions, Options, PrerenderEntrypoint } from "./types.js";
import { fileURLToPath } from "node:url";
import { styleText } from "node:util";

const PACKAGE_NAME = "@vite-deploy/cloudflare";
const DIST_DIR = "dist";
const VITE_ENVIRONMENT_NAMES = {
  server: "ssr",
  client: "client",
};
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
            index: config.build.rolldownOptions.input,
          };
        } else if (Array.isArray(config.build.rolldownOptions.input)) {
          config.build.rolldownOptions.input = Object.fromEntries(
            config.build.rolldownOptions.input.map((v, i) => [`index_${i}`, v]),
          );
        }

        config.build.rolldownOptions.input ??= {};
        config.build.rolldownOptions.input[PRERENDER_INPUT] = fileURLToPath(
          options.prerenderEntrypoint,
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

        const mod: { default: PrerenderEntrypoint } = await import(
          join(
            serverEnv.config.root,
            serverEnv.config.build.outDir,
            `${PRERENDER_INPUT}.mjs`,
          )
        );
        // TODO: normalize and dedupe
        const paths = await mod.default.getStaticPaths();
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
          const url = new URL(path, baseUrl);
          const response = await fetch(url);
          const contents = await response.text();
          // TODO: better check
          // TODO: options, eg directory/file
          const targetPath = join(clientOutDir, `${path}.html`);
          await mkdir(dirname(targetPath), { recursive: true });
          await writeFile(targetPath, contents);
        }

        await previewServer.close();
        serverEnv.logger.info(
          styleText(
            "green",
            `\n✓ prerendered in ${getTimeStat(now, performance.now())}\n`,
          ),
        );

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

export function cloudflare({ config, ...options }: Options): Array<Plugin> {
  const plugins: Array<Plugin> = [
    ...cloudflarePlugin({
      ...config,
      viteEnvironment: { name: VITE_ENVIRONMENT_NAMES.server },
    }),
    cleanOutdirPlugin(),
    configPlugin(),
    prerenderPlugin(options),
  ];

  return plugins;
}
