import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import node from "@vite-deploy/node";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

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
			router: {
				quoteStyle: "double",
				semicolons: true,
			},
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
