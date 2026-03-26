import netlify from "@vite-deploy/netlify";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    netlify({
      output: "hybrid",
      prerender: {
        entrypoint: new URL("./src/prerender.ts", import.meta.url),
        format: "directory",
      },
      handlerEntrypoint: new URL("./src/handler.ts", import.meta.url),
    }),
  ],
});
