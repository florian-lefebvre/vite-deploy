import type { ExportedHandler } from "@vite-deploy/node";

export default {
  fetch(request) {
    const url = new URL(request.url);
    if (
      (import.meta.env.DEV || import.meta.env.PRERENDER) &&
      url.pathname === "/"
    ) {
      return new Response("<div>foo</div>", {
        status: 200,
        headers: {
          "Content-Type": "text/html",
        },
      });
    }
    return new Response(`Running ${url.pathname} in ${navigator.userAgent}!`);
  },
  // handler: (req, res) => {
  //   console.log(req.url);
  //   if (
  //     (import.meta.env.DEV || import.meta.env.PRERENDER) &&
  //     req.url === "/"
  //   ) {
  //     res.statusCode = 200;
  //     res.setHeader("Content-Type", "text/html");
  //     res.end("<div>foo</div>");
  //     return;
  //   }
  //   res.end(`Running ${req.url} in ${navigator.userAgent}!`);
  //   return;
  // },
} satisfies ExportedHandler;
