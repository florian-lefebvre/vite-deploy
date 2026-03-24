
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
ssr: {
    dev: {
        createEnvironment(name, config) {
            return createFetchableDevEnvironment(name, config, {
                hot: true,
                transport: createServerHotChannel(),
                async handleRequest(request) {
                    if (!runner)
                        throw new Error('The module runner should have been created by now');

                    try {
                        /**
                         * @type {{
                         *   respond: (request: Request, remote_address: string | undefined, kit: import('types').ValidatedKitConfig) => Promise<Response>
                         * }}
                         */
                        const { respond } = await runner.import('__sveltekit/server-entry');
                        return await respond(request, dev_environment?.remote_address, kit);
                    } catch (error) {
                        console.error(error);
                        throw error;
                    }
                }
            });
        }
    }
}
```