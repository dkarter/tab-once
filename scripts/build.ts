import { build } from "esbuild";
import { execFile } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import { promisify } from "node:util";

const execute = promisify(execFile);

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await cp("public", "dist", { recursive: true });

await mkdir("dist/icons", { recursive: true });
await Promise.all(
  [16, 32, 48, 128].map((size) =>
    execute("resvg", [
      "public/icon.svg",
      `dist/icons/icon-${size}.png`,
      "--width",
      String(size),
    ])
  ),
);
await rm("dist/icon.svg");

await build({
  entryPoints: {
    background: "src/background.ts",
    content: "src/content.ts",
    options: "src/options.ts",
    popup: "src/popup.ts",
  },
  bundle: true,
  format: "iife",
  outdir: "dist",
  platform: "browser",
  sourcemap: true,
  target: "chrome121",
});
