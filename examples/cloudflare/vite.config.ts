import cloudflare from "@vite-deploy/cloudflare";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    cloudflare({
      output: "static",
      prerender: {
        entrypoint: new URL("./src/prerender.ts", import.meta.url),
        format: "directory",
      },
    }),
  ],
});
