import { buildExtension } from "./extension-build.js";

await buildExtension({ outdir: "dist", sourcemap: true });
