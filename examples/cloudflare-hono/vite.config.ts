import cloudflare from "@vite-deploy/cloudflare";
import { defineConfig } from "vite";

export default defineConfig({
	plugins: [
		cloudflare({
			output: "hybrid",
			prerender: {
				entrypoint: "./src/prerender.ts",
			},
		}),
	],
});
