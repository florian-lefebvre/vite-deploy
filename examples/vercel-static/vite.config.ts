import vercel from "@vite-deploy/vercel";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    vercel({
      output: "static",
      prerender: {
        entrypoint: "./src/prerender.ts",
      },
      handlerEntrypoint: "./src/handler.ts",
    }),
  ],
});
