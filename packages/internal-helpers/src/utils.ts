import { createRequire } from "node:module";
import type { Entrypoint } from "./types.js";
import { fileURLToPath } from "node:url";
import { isAbsolute, resolve } from "node:path";

export function normalizeEntrypoint(
  root: string | URL,
  entrypoint: Entrypoint,
): string {
  const rootPath = root instanceof URL ? fileURLToPath(root) : root;

  if (typeof entrypoint === "string") {
    if (isAbsolute(entrypoint) || entrypoint.startsWith(".")) {
      return resolve(rootPath, entrypoint);
    }

    return createRequire(resolve(rootPath, "package.json")).resolve(entrypoint);
  }

  return fileURLToPath(entrypoint);
}
