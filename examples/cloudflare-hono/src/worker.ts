import { Hono } from "hono";

const app = new Hono();

if (import.meta.env.DEV || import.meta.env.PRERENDER) {
	app.get("/", (c) => c.html("<div>foo</div>"));
}

app.get(
	"*",
	(c) =>
		new Response(
			`Running ${new URL(c.req.url).pathname} in ${navigator.userAgent}!`,
		),
);

export default app satisfies ExportedHandler<Env>;
