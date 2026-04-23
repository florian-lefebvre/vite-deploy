import vercel from "@vite-deploy/vercel";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    vercel({
      output: "hybrid",
      prerender: {
        entrypoint: "./src/prerender.ts",
        format: "directory",
      },
      handlerEntrypoint: "./src/handler.ts",
    }),
  ],
});
