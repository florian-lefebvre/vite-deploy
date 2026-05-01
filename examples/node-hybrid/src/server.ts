import * as http from "node:http";
import { fileURLToPath } from "node:url";
import sirv from "sirv";
import { toNodeHandler } from "srvx/node";
import mod from "./handler";

const server = http.createServer((req, res) =>
	sirv(fileURLToPath(new URL("../client/", import.meta.url)), { dev: true })(
		req,
		res,
		() => {
			// @ts-expect-error
			toNodeHandler(mod.fetch)(req, res);
		},
	),
);

server.listen(3000, () => {
	console.log("Ready at http://localhost:3000");
});
