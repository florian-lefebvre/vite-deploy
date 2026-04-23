import node from "@vite-deploy/node";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    node({
      output: "hybrid",
      prerender: {
        entrypoint: "./src/prerender.ts",
        format: "directory",
      },
      handlerEntrypoint: "./src/handler.ts",
      serverEntrypoint: "./src/server.ts",
    }),
  ],
});
