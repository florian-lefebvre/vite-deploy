import * as http from "node:http";
import { fileURLToPath } from "node:url";
import sirv from "sirv";
import mod from "./handler";

const server = http.createServer((req, res) =>
	sirv(fileURLToPath(new URL("../client/", import.meta.url)), { dev: true })(
		req,
		res,
		() => {
			mod.handler(req, res);
		},
	),
);

server.listen(3000, () => {
	console.log("Ready at http://localhost:3000");
});
