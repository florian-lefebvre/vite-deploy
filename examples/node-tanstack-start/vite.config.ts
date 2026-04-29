import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import node from "@vite-deploy/node"

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: [
    tailwindcss(),
    tanstackStart({
      srcDirectory: "src",
    }),
    viteReact(),
    node({
      output: "hybrid",
      prerender: {
        entrypoint: "./src/prerender.ts",
      },
      handlerEntrypoint: "@tanstack/react-start/server-entry",
      serverEntrypoint: "./src/server.ts",
    }),
  ],
});
