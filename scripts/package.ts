import JSZip from "jszip";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";

const artifactsDirectory = "artifacts";
interface StoreManifest {
  background: {
    scripts?: string[];
    service_worker?: string;
    [key: string]: unknown;
  };
  browser_specific_settings?: unknown;
  [key: string]: unknown;
}

const sourceEntries = [
  ".github",
  ".gitignore",
  ".release-please-manifest.json",
  "CHANGELOG.md",
  "README.md",
  "aube-lock.yaml",
  "committed.toml",
  "dprint.json",
  "docs",
  "lefthook.yml",
  "mise.toml",
  "package.json",
  "public",
  "release-please-config.json",
  "scripts",
  "src",
  "test",
  "tsconfig.json",
];

async function addPath(zip: JSZip, root: string, path: string): Promise<void> {
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries.toSorted((left, right) => left.name.localeCompare(right.name))) {
    const entryPath = join(path, entry.name);
    if (entry.isDirectory()) await addPath(zip, root, entryPath);
    else if (entry.isFile()) zip.file(relative(root, entryPath), await readFile(entryPath));
  }
}

async function createArchive(
  output: string,
  entries: string[],
  root = ".",
  overrides: Record<string, string> = {},
): Promise<void> {
  const zip = new JSZip();
  for (const entry of entries) {
    const path = join(root, entry);
    const pathStats = await stat(path);
    if (pathStats.isDirectory()) await addPath(zip, root, path);
    else zip.file(root === "." ? basename(path) : relative(root, path), await readFile(path));
  }
  for (const [path, content] of Object.entries(overrides)) zip.file(path, content);
  await writeFile(output, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}

await rm(artifactsDirectory, { recursive: true, force: true });
await mkdir(artifactsDirectory, { recursive: true });
const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8")) as StoreManifest;
const chromeManifest = structuredClone(manifest);
delete chromeManifest.background.scripts;
delete chromeManifest.browser_specific_settings;
const firefoxManifest = structuredClone(manifest);
delete firefoxManifest.background.service_worker;
const distEntries = await readdir("dist");

await Promise.all([
  createArchive(join(artifactsDirectory, "tab-once-chrome.zip"), distEntries, "dist", {
    "manifest.json": `${JSON.stringify(chromeManifest, null, 2)}\n`,
  }),
  createArchive(join(artifactsDirectory, "tab-once-firefox.zip"), distEntries, "dist", {
    "manifest.json": `${JSON.stringify(firefoxManifest, null, 2)}\n`,
  }),
  createArchive(join(artifactsDirectory, "tab-once-source.zip"), sourceEntries),
]);
