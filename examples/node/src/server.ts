import mod from "./handler";
import { createRequestListener } from "@remix-run/node-fetch-server";
import * as http from "node:http";
import sirv from "sirv";
import { fileURLToPath } from "node:url";

const server = http.createServer((req, res) =>
  sirv(fileURLToPath(new URL("../client/", import.meta.url)), { dev: true })(
    req,
    res,
    () => {
      createRequestListener(mod.fetch)(req, res);
    },
  ),
);

server.listen(3000, () => {
  console.log("Ready at http://localhost:3000");
});
