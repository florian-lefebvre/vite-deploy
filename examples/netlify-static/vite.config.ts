import netlify from "@vite-deploy/netlify";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		netlify({
			output: "static",
			prerender: {
				entrypoint: "./src/prerender.ts",
			},
			handlerEntrypoint: "./src/handler.ts",
		}),
	],
});
