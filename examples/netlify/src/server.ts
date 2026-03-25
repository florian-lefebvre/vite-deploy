export default {
  fetch(request) {
    const url = new URL(request.url);
    if (import.meta.env.PRERENDER && url.pathname === "/") {
      return new Response("<div>foo</div>", {
        status: 200,
        headers: {
          "Content-Type": "text/html",
        },
      });
    }
    return new Response(`Running ${url.pathname} in ${navigator.userAgent}!`);
  },
  // TODO: export type
} satisfies {
  fetch: (request: Request) => Response | Promise<Response>;
};
