import { createRequire } from "node:module";
import type { Entrypoint } from "./types.js";
import { fileURLToPath } from "node:url";

export function normalizeEntrypoint(
  root: string | URL,
  entrypoint: Entrypoint,
): string {
  if (typeof entrypoint === "string") {
    return createRequire(root).resolve(entrypoint);
  }
  return fileURLToPath(entrypoint);
}
