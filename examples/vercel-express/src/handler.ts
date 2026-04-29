import type { ExportedHandler } from "@vite-deploy/vercel";
import express from "express";
import { toFetchHandler } from "srvx/node";

const app = express();

if (import.meta.env.DEV || import.meta.env.PRERENDER) {
  app.get("/", (_req, res) => {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html");
    res.end("<div>foo</div>");
  });
}

app.get("/*splat", (req, res) =>
  res.end(`Running ${req.url} in ${navigator.userAgent}!`),
);

export default {
  fetch: toFetchHandler(app),
} satisfies ExportedHandler;
