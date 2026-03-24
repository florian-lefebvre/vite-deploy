
{
    output: "server",
} | {
    output: "static" | "hybrid",
    prerenderEntrypoint: new URL(),
}

export default {
    async getStaticPaths() {
        return ["/", "/about", "/blog/a", "/blog/b"]
    }
} satisfies PrerenderEntrypoint

cloudflare({
    output: "server",
    prerenderEntrypoint: new URL(),
})

@vite-deploy/cloudflare
- worker.ts
@vite-deploy/netlify
- handler.production.ts
- handler.ts
@vite-deploy/node
- handler.ts
- server.ts
@vite-deploy/vercel
- handler.ts
- handler.production.ts

```ts
  environments: {
    ssr: {
      dev: {
        createEnvironment(name, config) {
          const environment = createFetchableDevEnvironment(name, config, {
            hot: true,
            async handleRequest(request) {
              const mod = await runner.import("...");
              return await mod.fetch(request);
            },
          });
          const runner = createServerModuleRunner(environment);
          return environment;
        },
      },
    },
  },
```