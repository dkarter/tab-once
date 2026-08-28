import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const publicDirectory = "public";
const iconsDirectory = join(publicDirectory, "icons");
const manifest = JSON.parse(
  await readFile(join(publicDirectory, "manifest.json"), "utf8"),
) as { icons: Record<string, string> };

await mkdir(iconsDirectory, { recursive: true });
await Promise.all(
  Object.entries(manifest.icons).map(([size, path]) =>
    execute("resvg", [
      join(publicDirectory, "icon.svg"),
      join(publicDirectory, path),
      "--width",
      size,
    ])
  ),
);
