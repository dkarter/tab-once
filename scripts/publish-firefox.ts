import { createHmac, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function createAuthorization(issuer: string, secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: "HS256", typ: "JWT" })}.${
    encode({
      iss: issuer,
      jti: randomUUID(),
      iat: now,
      exp: now + 300,
    })
  }`;
  const signature = createHmac("sha256", secret).update(unsigned).digest("base64url");
  return `JWT ${unsigned}.${signature}`;
}

async function requestJson(
  url: string,
  authorization: () => string,
  init: RequestInit,
  context: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: authorization(), Accept: "application/json", ...init.headers },
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${context} failed (${response.status}): ${text}`);
  return text ? JSON.parse(text) as Record<string, unknown> : {};
}

const issuer = requireEnvironment("AMO_JWT_ISSUER");
const secret = requireEnvironment("AMO_JWT_SECRET");
const manifest = JSON.parse(await readFile("dist/manifest.json", "utf8")) as {
  browser_specific_settings?: { gecko?: { id?: string } };
};
const addonId = manifest.browser_specific_settings?.gecko?.id;
if (!addonId) throw new Error("The Firefox add-on ID is missing from dist/manifest.json.");
const api = "https://addons.mozilla.org/api/v5/addons/";
const authorization = () => createAuthorization(issuer, secret);
const archive = await readFile("artifacts/tab-once-firefox.zip");
const uploadForm = new FormData();
uploadForm.set("channel", "listed");
uploadForm.set(
  "upload",
  new File([archive], "tab-once-firefox.zip", {
    type: "application/zip",
  }),
);
const upload = await requestJson(
  `${api}upload/`,
  authorization,
  { method: "POST", body: uploadForm },
  "Firefox upload",
);
if (typeof upload.uuid !== "string") throw new Error("Firefox upload returned no UUID.");

let validation = upload;
const validationDeadline = Date.now() + 300_000;
let pollDelay = 1_000;
while (!validation.processed && Date.now() < validationDeadline) {
  await new Promise((resolve) => setTimeout(resolve, pollDelay));
  validation = await requestJson(
    `${api}upload/${upload.uuid}/`,
    authorization,
    { method: "GET" },
    "Firefox validation",
  );
  pollDelay = Math.min(pollDelay * 2, 10_000);
}
if (!validation.processed) throw new Error("Firefox validation timed out.");
if (!validation.valid) throw new Error(`Firefox validation failed: ${JSON.stringify(validation)}`);

const source = await readFile("artifacts/tab-once-source.zip");
const versionForm = new FormData();
versionForm.set("upload", upload.uuid);
versionForm.set("source", new File([source], "tab-once-source.zip", { type: "application/zip" }));
const version = await requestJson(
  `${api}addon/${encodeURIComponent(addonId)}/versions/`,
  authorization,
  {
    method: "POST",
    body: versionForm,
  },
  "Firefox submission",
);
if (typeof version.id !== "number") throw new Error("Firefox submission returned no version ID.");
console.log(`Submitted ${addonId} to Firefox Add-ons: ${String(version.edit_url ?? "")}`);
