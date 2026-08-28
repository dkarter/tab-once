import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { error } from "selenium-webdriver";
import * as chrome from "selenium-webdriver/chrome.js";
import * as firefox from "selenium-webdriver/firefox.js";
import {
  buildExtension,
  type ExtensionManifest,
  getBrowserManifest,
} from "../../scripts/extension-build.js";

type BrowserName = "chrome" | "firefox";
type Driver = chrome.Driver | firefox.Driver;

const requestedBrowsers = [...new Set(process.argv.slice(2))];
const browsers: BrowserName[] = requestedBrowsers.length === 0
  ? ["chrome", "firefox"]
  : requestedBrowsers.map((value) => {
    if (value !== "chrome" && value !== "firefox") {
      throw new Error(`Unsupported browser: ${value}`);
    }
    return value;
  });

const testState = { focusPaths: [] as string[], readySignals: 0 };
const server = createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  if (requestUrl.pathname === "/__tab_once_ready") {
    testState.readySignals += 1;
    response.writeHead(204).end();
    return;
  }
  if (requestUrl.pathname === "/__tab_once_focus") {
    testState.focusPaths.push(requestUrl.searchParams.get("path") ?? "");
    response.writeHead(204).end();
    return;
  }

  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(`<!doctype html>
<title>${request.url}</title>
<main>${request.url}</main>
<script>
  const reportFocus = () => fetch(
    "/__tab_once_focus?path=" + encodeURIComponent(location.pathname),
  );
  addEventListener("focus", reportFocus);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) reportFocus();
  });
</script>`);
});
let temporaryDirectory: string | undefined;

try {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Could not start the E2E server.");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  temporaryDirectory = await mkdtemp(join(tmpdir(), "tab-once-e2e-"));
  const extensionDirectories = await buildExtensions(temporaryDirectory, baseUrl);
  for (const browser of browsers) {
    await testBrowser(browser, extensionDirectories[browser], baseUrl, testState);
  }
} finally {
  if (server.listening) {
    await new Promise<void>((resolve, reject) =>
      server.close((failure) => {
        if (failure) reject(failure);
        else resolve();
      })
    );
  }
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
}

async function buildExtensions(
  root: string,
  baseUrl: string,
): Promise<Record<BrowserName, string>> {
  const commonDirectory = join(root, "common");
  await buildExtension({
    background: "test/e2e/background.ts",
    define: { __E2E_BASE_URL__: JSON.stringify(baseUrl) },
    outdir: commonDirectory,
  });

  const manifest = JSON.parse(
    await readFile(join(commonDirectory, "manifest.json"), "utf8"),
  ) as ExtensionManifest;
  const directories = {
    chrome: join(root, "chrome"),
    firefox: join(root, "firefox"),
  };
  await Promise.all(
    Object.values(directories).map((directory) => {
      return cp(commonDirectory, directory, { recursive: true });
    }),
  );

  const chromeManifest = getBrowserManifest(manifest, "chrome");
  chromeManifest.host_permissions = [`${baseUrl}/*`];
  await writeFile(
    join(directories.chrome, "manifest.json"),
    `${JSON.stringify(chromeManifest, null, 2)}\n`,
  );

  const firefoxManifest = getBrowserManifest(manifest, "firefox");
  firefoxManifest.host_permissions = [`${baseUrl}/*`];
  await writeFile(
    join(directories.firefox, "manifest.json"),
    `${JSON.stringify(firefoxManifest, null, 2)}\n`,
  );
  return directories;
}

async function testBrowser(
  browser: BrowserName,
  extensionDirectory: string,
  baseUrl: string,
  state: typeof testState,
): Promise<void> {
  process.stdout.write(`Testing ${browser}... `);
  const readyTarget = state.readySignals + 1;
  const driver = await createDriver(browser, extensionDirectory);
  try {
    if (driver instanceof firefox.Driver) {
      await driver.installAddon(extensionDirectory, true);
    }
    await waitFor(
      () => state.readySignals >= readyTarget,
      `${browser} extension background did not become ready`,
    );

    const existingPath = "/dkarter/tab-once/pull/3/files";
    const existingUrl = `${baseUrl}/dkarter/tab-once/pull/3/files`;
    const duplicateUrl = `${baseUrl}/dkarter/tab-once/pull/3`;
    await driver.get(existingUrl);
    const existingHandle = await driver.getWindowHandle();

    await driver.switchTo().newWindow("tab");
    await driver.get(`${baseUrl}/control`);
    const controlHandle = await driver.getWindowHandle();

    await driver.switchTo().newWindow("tab");
    const duplicateHandle = await driver.getWindowHandle();
    assert.notEqual(duplicateHandle, existingHandle);
    assert.notEqual(duplicateHandle, controlHandle);
    await driver.get("about:blank");
    await waitFor(
      async () => await driver.executeScript("return document.readyState") === "complete",
      `${browser} placeholder tab did not finish loading`,
    );

    state.focusPaths.length = 0;
    try {
      await driver.get(duplicateUrl);
    } catch (caught) {
      if (!(caught instanceof error.NoSuchWindowError)) throw caught;
    }

    const handles = await waitForWindowCount(driver, 2);
    assert.deepEqual(new Set(handles), new Set([existingHandle, controlHandle]));
    await waitFor(
      () => state.focusPaths.includes(existingPath),
      "the existing tab did not report regaining focus",
    );
    await driver.switchTo().window(existingHandle);
    assert.equal(await driver.getCurrentUrl(), existingUrl);
    process.stdout.write("passed\n");
  } finally {
    await driver.quit();
  }
}

async function createDriver(browser: BrowserName, extensionDirectory: string): Promise<Driver> {
  if (browser === "chrome") {
    const options = new chrome.Options().addArguments(
      "--headless=new",
      `--disable-extensions-except=${resolve(extensionDirectory)}`,
      `--load-extension=${resolve(extensionDirectory)}`,
    );
    options.setBrowserVersion("stable");
    return chrome.Driver.createSession(options);
  }

  const options = new firefox.Options().addArguments("-headless");
  options.setBrowserVersion("stable");
  return firefox.Driver.createSession(options);
}

async function waitForWindowCount(driver: Driver, count: number): Promise<string[]> {
  let handles: string[] = [];
  await waitFor(async () => {
    handles = await driver.getAllWindowHandles();
    return handles.length === count;
  }, `Expected ${count} tabs; found ${handles.length}`);
  return handles;
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(check: () => boolean | Promise<boolean>, message: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await delay(50);
  }
  throw new Error(message);
}
