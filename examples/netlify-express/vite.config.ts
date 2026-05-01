import netlify from "@vite-deploy/netlify";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		netlify({
			output: "server",
			handlerEntrypoint: "./src/handler.ts",
		}),
	],
});
