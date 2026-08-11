import { createSign } from "node:crypto";
import { readFile } from "node:fs/promises";

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function encode(value: object): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

async function responseJson(response: Response, context: string): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!response.ok) throw new Error(`${context} failed (${response.status}): ${text}`);
  return text ? JSON.parse(text) as Record<string, unknown> : {};
}

async function requestJson(
  url: string,
  init: RequestInit,
  context: string,
): Promise<Record<string, unknown>> {
  return await responseJson(
    await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) }),
    context,
  );
}

const serviceAccount = JSON.parse(
  requireEnvironment("CHROME_SERVICE_ACCOUNT_JSON"),
) as ServiceAccount;
const publisherId = requireEnvironment("CHROME_PUBLISHER_ID");
const extensionId = requireEnvironment("CHROME_EXTENSION_ID");
const now = Math.floor(Date.now() / 1000);
const unsignedToken = `${encode({ alg: "RS256", typ: "JWT" })}.${
  encode({
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/chromewebstore",
    aud: serviceAccount.token_uri ?? "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })
}`;
const signer = createSign("RSA-SHA256");
signer.update(unsignedToken);
const assertion = `${unsignedToken}.${signer.sign(serviceAccount.private_key, "base64url")}`;

const token = await requestJson(
  serviceAccount.token_uri ?? "https://oauth2.googleapis.com/token",
  {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  },
  "Chrome authentication",
);
if (typeof token.access_token !== "string") {
  throw new Error("Chrome authentication returned no token.");
}

const authorization = { Authorization: `Bearer ${token.access_token}` };
const itemPath = `publishers/${encodeURIComponent(publisherId)}/items/${
  encodeURIComponent(extensionId)
}`;
const packageBytes = await readFile("artifacts/tab-once.zip");
const uploadResult = await requestJson(
  `https://chromewebstore.googleapis.com/upload/v2/${itemPath}:upload`,
  {
    method: "POST",
    headers: { ...authorization, "Content-Type": "application/zip" },
    body: packageBytes,
  },
  "Chrome upload",
);
let uploadState = uploadResult.uploadState;
const uploadDeadline = Date.now() + 300_000;
let pollDelay = 1_000;
while (uploadState === "IN_PROGRESS" && Date.now() < uploadDeadline) {
  await new Promise((resolve) => setTimeout(resolve, pollDelay));
  const status = await requestJson(
    `https://chromewebstore.googleapis.com/v2/${itemPath}:fetchStatus`,
    { method: "GET", headers: authorization },
    "Chrome upload status",
  );
  uploadState = status.lastAsyncUploadState;
  pollDelay = Math.min(pollDelay * 2, 10_000);
}
if (uploadState !== "SUCCEEDED") {
  throw new Error(`Chrome upload did not succeed (state: ${String(uploadState)}).`);
}

await requestJson(
  `https://chromewebstore.googleapis.com/v2/${itemPath}:publish`,
  { method: "POST", headers: authorization },
  "Chrome publication",
);
console.log(`Submitted ${extensionId} to the Chrome Web Store.`);
