import JSZip from "jszip";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";

const artifactsDirectory = "artifacts";
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

async function createArchive(output: string, entries: string[], root = "."): Promise<void> {
  const zip = new JSZip();
  for (const entry of entries) {
    const path = join(root, entry);
    const pathStats = await stat(path);
    if (pathStats.isDirectory()) await addPath(zip, root, path);
    else zip.file(root === "." ? basename(path) : relative(root, path), await readFile(path));
  }
  await writeFile(output, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
}

await rm(artifactsDirectory, { recursive: true, force: true });
await mkdir(artifactsDirectory, { recursive: true });
await createArchive(join(artifactsDirectory, "tab-once.zip"), await readdir("dist"), "dist");
await createArchive(join(artifactsDirectory, "tab-once-source.zip"), sourceEntries);
