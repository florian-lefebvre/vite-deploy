import vercel from "@vite-deploy/vercel";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    vercel({
      output: "server",
      handlerEntrypoint: "./src/handler.ts",
    }),
  ],
});
