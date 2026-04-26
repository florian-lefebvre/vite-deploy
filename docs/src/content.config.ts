import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { z } from "astro/zod";

const baseSchema = z.object({
  type: z.literal("base").optional().default("base"),
});

const packageSchema = z.object({
  type: z.literal("package"),
  title: z
    .string()
    .refine(
      (title) => title.startsWith("@vite-deploy/"),
      '"title" must start with "@vite-deploy/" for package docs.',
    ),
  githubURL: z.url(),
});

export const collections = {
  docs: defineCollection({
    loader: docsLoader(),
    schema: docsSchema({
      extend: z.union([baseSchema, packageSchema]),
    }),
  }),
  // Latest versions of official npm packages.
  packages: defineCollection({
    loader: async () => {
      const packages = [
        "@vite-deploy/cloudflare",
        "@vite-deploy/netlify",
        "@vite-deploy/node",
        "@vite-deploy/vercel",
      ];
      // TODO:
      // See https://github.com/antfu/fast-npm-meta
      // const url = `https://npm.antfu.dev/${encodeURIComponent(packages.join("+"))}`;
      // const data = await fetch(url).then((res) => res.json());
      // return data.map((pkg: any) => ({ id: pkg.name, version: pkg.version }));
      return packages.map((pkg) => ({ id: pkg, version: "0.0.0" }));
    },
    schema: z.object({ version: z.string() }),
  }),
};
