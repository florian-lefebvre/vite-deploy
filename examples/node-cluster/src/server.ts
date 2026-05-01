import cluster from "node:cluster";
import * as http from "node:http";
import os from "node:os";
import { fileURLToPath } from "node:url";
import sirv from "sirv";
import { toNodeHandler } from "srvx/node";
import mod from "./handler";

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
