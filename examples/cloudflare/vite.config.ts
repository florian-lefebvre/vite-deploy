import { cloudflare } from "@cloudflare/vite-plugin";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { defineConfig, Plugin, preview } from "vite";

interface Options {
  prerenderEntrypoint: URL;
}

function plugin(options: Options): Array<Plugin> {
  return [
    ...cloudflare({
      viteEnvironment: { name: "ssr" },
    }),
    {
      name: "clean",
      enforce: "pre",
      buildApp: {
        order: "pre",
        async handler(builder) {
          await rm(
            new URL(
              "./dist/",
              pathToFileURL(builder.environments.ssr.config.root + "/"),
            ),
            {
              force: true,
              recursive: true,
            },
          );
        },
      },
    },
    {
      name: "prerender",
      enforce: "post",
      configEnvironment(name, config) {
        if (name === "client") {
          return {
            build: {
              outDir: "./dist/client/",
            },
          };
        }
        if (name === "ssr") {
          return {
            build: {
              rolldownOptions: {
                input: {
                  ...(config.build?.rolldownOptions?.input as any),
                  prerender: fileURLToPath(options.prerenderEntrypoint),
                },
              },
              outDir: "./dist/server/",
              emptyOutDir: true,
            },
            define: {
              ...config.define,
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
          if (this.environment.name === "ssr") {
            return code.replaceAll(
              "import.meta.env.PRERENDER",
              JSON.stringify(!this.environment.__ssrOnly),
            );
          }
        },
      },
      buildApp: {
        order: "post",
        async handler(builder) {
          builder.environments.ssr.logger.info("Starting prerendering...");
          // TODO: more robust way to get this using writeBundle
          const prerenderUrl = new URL(
            `${builder.environments.ssr.config.build.outDir}prerender.js`,
            pathToFileURL(builder.environments.ssr.config.root + "/"),
          );
          const mod = await import(fileURLToPath(prerenderUrl));
          const paths: Array<string> = await mod.default.getStaticPaths();

          const previewServer = await preview({
            configFile: builder.environments.ssr.config.configFile,
            preview: {
              port: 0,
              open: false,
            },
          });
          const baseUrl = new URL(previewServer.resolvedUrls?.local[0] ?? "");

          for (const path of paths) {
            const url = new URL(path, baseUrl);
            const response = await fetch(url);
            const contents = await response.text();
            const targetUrl = new URL(
              `.${path}.html`,
              new URL(
                builder.environments.client.config.build.outDir,
                pathToFileURL(builder.environments.client.config.root + "/"),
              ),
            );
            await mkdir(dirname(fileURLToPath(targetUrl)), { recursive: true });
            await writeFile(targetUrl, contents);
          }

          await previewServer.close();
          builder.environments.ssr.logger.info("Finished prerendering in Xms");

          delete builder.environments.ssr.config.build.rolldownOptions.input
            .prerender;

          builder.environments.ssr.__ssrOnly = true;

          await builder.build(builder.environments.ssr);
        },
      },
    },
  ];
}

export default defineConfig({
  plugins: [
    plugin({
      prerenderEntrypoint: new URL("./src/prerender.ts", import.meta.url),
    }),
    {
      name: "test",
      resolveId(id) {
        if (id === "virtual:test") {
          return "\0virtual:test";
        }
      },
      load(id) {
        if (id === "\0virtual:test") {
          return `export default ['a', 'b']`;
        }
      },
    },
  ],
});
