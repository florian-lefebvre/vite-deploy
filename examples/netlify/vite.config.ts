import netlify from "@vite-deploy/netlify";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    netlify({
      output: "hybrid",
      prerender: {
        entrypoint: "./src/prerender.ts",
        format: "directory",
      },
      handlerEntrypoint: "./src/handler.ts",
    }),
  ],
});
