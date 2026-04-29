import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { defineConfig } from 'vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import netlify from "@vite-deploy/netlify"

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
    netlify({
      output: "hybrid",
      prerender: {
        entrypoint: "./src/prerender.ts",
      },
      handlerEntrypoint: "@tanstack/react-start/server-entry",
    }),
  ],
});
