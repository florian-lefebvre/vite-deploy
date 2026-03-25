import netlify from "@vite-deploy/netlify";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    netlify({
      output: "server",
      prerender: {
        entrypoint: new URL("./src/prerender.ts", import.meta.url),
        format: "directory",
      },
      serverEntrypoint: new URL("./src/server.ts", import.meta.url),
    }),
  ],
});
