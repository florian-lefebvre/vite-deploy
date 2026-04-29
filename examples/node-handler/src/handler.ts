import type { ExportedHandler } from "@vite-deploy/node";

export default {
  handler: (req, res) => {
    console.log(req.url);
    if ((import.meta.env.DEV || import.meta.env.PRERENDER) && req.url === "/") {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html");
      res.end("<div>foo</div>");
      return;
    }
    res.end(`Running ${req.url} in ${navigator.userAgent}!`);
    return;
  },
} satisfies ExportedHandler;
