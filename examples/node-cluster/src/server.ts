import mod from "./handler";
import { toNodeHandler } from "srvx/node";
import * as http from "node:http";
import sirv from "sirv";
import { fileURLToPath } from "node:url";
import cluster from "node:cluster";
import os from "node:os";

if (cluster.isPrimary) {
  console.log(`Primary ${process.pid} is running`);
  const numberOfWorkers = os.cpus().length || 1;
  for (let i = 0; i < numberOfWorkers; i++) {
    cluster.fork({
      WORKER_ID: i + 1,
    });
  }

  cluster.on("exit", (worker, _code, _signal) => {
    console.log(`worker ${worker.process.pid} died`);
  });
} else {
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

  console.log(`Worker ${process.pid} started`);
}
