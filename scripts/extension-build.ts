import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";

export interface ExtensionManifest {
  background: {
    scripts?: string[];
    service_worker?: string;
    [key: string]: unknown;
  };
  browser_specific_settings?: unknown;
  [key: string]: unknown;
}

interface BuildExtensionOptions {
  background?: string;
  define?: Record<string, string>;
  outdir: string;
  sourcemap?: boolean;
}

export async function buildExtension(options: BuildExtensionOptions): Promise<void> {
  await rm(options.outdir, { recursive: true, force: true });
  await mkdir(options.outdir, { recursive: true });
  await cp("public", options.outdir, { recursive: true });
  await rm(`${options.outdir}/icon.svg`);

  await build({
    entryPoints: {
      background: options.background ?? "src/background.ts",
      content: "src/content.ts",
      options: "src/options.ts",
      popup: "src/popup.ts",
    },
    bundle: true,
    define: options.define,
    format: "iife",
    outdir: options.outdir,
    platform: "browser",
    sourcemap: options.sourcemap,
    target: "chrome121",
  });
}

export function getBrowserManifest(
  manifest: ExtensionManifest,
  browser: "chrome" | "firefox",
): ExtensionManifest {
  const browserManifest = structuredClone(manifest);
  if (browser === "chrome") {
    delete browserManifest.background.scripts;
    delete browserManifest.browser_specific_settings;
  } else {
    delete browserManifest.background.service_worker;
  }
  return browserManifest;
}
