import { defineConfig } from "vite";
import cloudflare from "@vite-deploy/cloudflare";

export default defineConfig({
  plugins: [
    cloudflare({
      output: "hybrid",
      prerenderEntrypoint: new URL("./src/prerender.ts", import.meta.url),
    }),
  ],
});
