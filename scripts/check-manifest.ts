import { readFile } from "node:fs/promises";

const [packageContent, manifestContent, releaseManifestContent] = await Promise.all([
  readFile("package.json", "utf8"),
  readFile("public/manifest.json", "utf8"),
  readFile(".release-please-manifest.json", "utf8"),
]);
const packageJson = JSON.parse(packageContent) as { version: string };
const manifest = JSON.parse(manifestContent) as {
  manifest_version: number;
  version: string;
  background?: { scripts?: string[]; service_worker?: string };
};
const releaseManifest = JSON.parse(releaseManifestContent) as Record<string, string>;

if (manifest.manifest_version !== 3) throw new Error("Extension manifest must use Manifest V3.");
if (manifest.version !== packageJson.version) {
  throw new Error("package.json and public/manifest.json versions must match.");
}
if (releaseManifest["."] !== packageJson.version) {
  throw new Error("Release Please and package.json versions must match.");
}
if (
  manifest.background?.service_worker !== "background.js"
  || !manifest.background.scripts?.includes("background.js")
) {
  throw new Error("Both Chromium and Firefox background declarations are required.");
}
