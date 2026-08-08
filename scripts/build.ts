import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });
await cp("public", "dist", { recursive: true });

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
