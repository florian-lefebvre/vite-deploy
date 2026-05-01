import cloudflare from "@vite-deploy/cloudflare";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			output: "static",
			prerender: {
				entrypoint: "./src/prerender.ts",
			},
		}),
	],
});
