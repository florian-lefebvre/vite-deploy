import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { preview, type Plugin } from "vite";
import { cloudflare as cloudflarePlugin } from "@cloudflare/vite-plugin";
import type { InternalOptions, Options, PrerenderEntrypoint } from "./types.js";
import { fileURLToPath } from "node:url";

const PACKAGE_NAME = "@vite-deploy/cloudflare";
const DIST_DIR = "dist";
const VITE_ENVIRONMENT_NAMES = {
  server: "ssr",
  client: "client",
};

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
          },
        };
      }
    },
  };
}

function prerenderPlugin(options: InternalOptions): Plugin {
  let prerender = true;

  return {
    name: `${PACKAGE_NAME}:prerender`,
    enforce: "post",
    sharedDuringBuild: true,
    configEnvironment(name, config) {
      if (
        options.output !== "server" &&
        name === VITE_ENVIRONMENT_NAMES.server
      ) {
        return {
          build: {
            rolldownOptions: {
              input: {
                // TODO: normalize
                ...(config.build?.rolldownOptions?.input as any),
                prerender: fileURLToPath(options.prerenderEntrypoint),
              },
            },
            // Clean the prerender specific files
            emptyOutDir: true,
          },
        };
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
        const serverEnv = builder.environments[VITE_ENVIRONMENT_NAMES.server];
        const clientEnv = builder.environments[VITE_ENVIRONMENT_NAMES.client];
        if (!serverEnv || !clientEnv) {
          throw new Error("Missing environments");
        }

        serverEnv.logger.info("Starting prerendering...");
        const mod: { default: PrerenderEntrypoint } = await import(
          // TODO: more robust way to get this using writeBundle?
          join(
            serverEnv.config.root,
            serverEnv.config.build.outDir,
            "prerender.js",
          )
        );
        // TODO: normalize
        const paths = await mod.default.getStaticPaths();

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

        for (const path of paths) {
          const url = new URL(path, baseUrl);
          const response = await fetch(url);
          const contents = await response.text();
          // TODO: better check
          // TODO: options, eg directory/file
          const targetPath = join(
            clientEnv.config.root,
            clientEnv.config.build.outDir,
            `${path}.html`,
          );
          await mkdir(dirname(targetPath), { recursive: true });
          await writeFile(targetPath, contents);
        }

        await previewServer.close();
        serverEnv.logger.info("Finished prerendering in Xms");

        // TODO: normalize
        // @ts-expect-error to be normalized
        delete serverEnv.config.build.rolldownOptions.input.prerender;

        prerender = false;

        await builder.build(serverEnv);
      },
    },
  };
}

// TODO: if server, skip prerendering
// TODO: if hybrid, keep current logic
// TODO: if static, no need for another ssr build + clean server dir + move client to root

export function cloudflare({ config, ...options }: Options): Array<Plugin> {
  const plugins: Array<Plugin> = [
    ...cloudflarePlugin({
      ...config,
      viteEnvironment: { name: VITE_ENVIRONMENT_NAMES.server },
    }),
    cleanOutdirPlugin(),
    configPlugin(),
    // TODO: only include as needed
    prerenderPlugin(options),
  ];

  return plugins;
}
