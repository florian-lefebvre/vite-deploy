// @ts-check

import starlight from "@astrojs/starlight";
import starlightCatppuccin from "@catppuccin/starlight";
import { defineConfig, fontProviders } from "astro/config";
import starlightLinksValidator from "starlight-links-validator";

/* https://docs.netlify.com/configure-builds/environment-variables/#read-only-variables */
const NETLIFY_PREVIEW_SITE =
	process.env.CONTEXT !== "production" && process.env.DEPLOY_PRIME_URL;

const site = NETLIFY_PREVIEW_SITE || "https://vite-deploy.web-runes.dev/";

// https://astro.build/config
export default defineConfig({
	site,
	trailingSlash: "always",
	integrations: [
		starlight({
			title: "Vite Deploy",
			description: "Deploy your Vite project anywhere",
			logo: {
				light: "./src/assets/vite-deploy.svg",
				dark: "./src/assets/vite-deploy-dark.svg",
				replacesTitle: true,
			},
			social: [
				{
					icon: "github",
					label: "GitHub",
					href: "https://github.com/web-runes/vite-deploy",
				},
			],
			sidebar: [
				{
					label: "Getting started",
					items: [
						"quick-start",
						"philosophy",
						"comparison",
						"outputs",
						"framework-authors",
					],
				},
				{
					label: "Adapters reference",
					autogenerate: { directory: "adapters" },
				},
				// {
				//   label: "How-to guides",
				//   autogenerate: { directory: "how-to" },
				// },
				{
					label: "Deployment guides",
					autogenerate: { directory: "deploy" },
				},
				{
					label: "Integration guides",
					autogenerate: { directory: "integrate-with" },
				},
			],
			customCss: ["./src/styles/custom.css"],
			components: {
				Head: "./src/components/starlight/Head.astro",
				PageTitle: "./src/components/starlight/PageTitle.astro",
			},
			credits: true,
			editLink: {
				baseUrl: "https://github.com/web-runes/vite-deploy/tree/main/docs",
			},
			lastUpdated: true,
			plugins: [
				starlightCatppuccin({
					light: {
						accent: "sky",
					},
					dark: {
						flavor: "mocha",
						accent: "sky",
					},
				}),
				starlightLinksValidator(),
			],
		}),
	],
	fonts: [
		{
			name: "Rubik",
			cssVariable: "--font-rubik",
			provider: fontProviders.fontsource(),
			weights: ["300 900"],
			styles: ["normal"],
			subsets: ["latin"],
			fallbacks: ["sans-serif"],
		},
		{
			name: "JetBrains Mono",
			cssVariable: "--font-jetbrains-mono",
			provider: fontProviders.fontsource(),
			weights: ["400"],
			styles: ["normal"],
			subsets: ["latin"],
			fallbacks: ["monospace"],
		},
	],
});
