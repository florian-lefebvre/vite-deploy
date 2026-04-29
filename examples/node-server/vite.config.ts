import node from "@vite-deploy/node";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    node({
      output: "server",
      handlerEntrypoint: "./src/handler.ts",
      serverEntrypoint: "./src/server.ts",
    }),
  ],
});
