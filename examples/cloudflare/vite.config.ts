import cloudflare from "@vite-deploy/cloudflare";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    cloudflare({
      output: "hybrid",
      prerender: {
        entrypoint: new URL("./src/prerender.ts", import.meta.url),
        format: "directory",
      },
    }),
  ],
});
