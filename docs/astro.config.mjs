// @ts-check
import { defineConfig, fontProviders } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightCatppuccin from "@catppuccin/starlight";

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: "Vite Deploy",
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/florian-lefebvre/vite-deploy",
        },
      ],
      sidebar: [
        {
          label: "Getting started",
          items: ["quick-start", "philosophy", "how-it-works", "comparison"],
        },
        {
          label: "Adapters",
          autogenerate: { directory: "adapters" },
        },
        {
          label: "Deployment guides",
          autogenerate: { directory: "deploy" },
        },
        {
          label: "How-to guides",
          autogenerate: { directory: "how-to" },
        },
        {
          label: "Integration guides",
          autogenerate: { directory: "integrate-with" },
        },
      ],
      customCss: ["./src/styles/custom.css"],
      components: {
        Head: "./src/components/overrides/Head.astro",
      },
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
