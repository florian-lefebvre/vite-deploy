import node from "@vite-deploy/node";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		node({
			output: "static",
			prerender: {
				entrypoint: "./src/prerender.ts",
			},
			handlerEntrypoint: "./src/handler.ts",
		}),
	],
});
