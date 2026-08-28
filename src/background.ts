import { type FocusExistingTabResponse, isFocusExistingTabRequest } from "./messages.js";
import { getOriginPattern, getUrlKey, type UrlRule } from "./rules.js";
import { loadRules } from "./storage.js";
import { shouldStopTrackingNewTab } from "./tab-lifecycle.js";
import { webExtension } from "./web-extension.js";

const CLICK_INTERCEPTOR_ID = "tab-once-click-interceptor";
const newlyCreatedTabs = new Set<number>();
const pendingUrls = new Map<number, string>();
const processingUrls = new Map<number, string>();
let rulesPromise: Promise<Awaited<ReturnType<typeof loadRules>>> | undefined;
let interceptorSync = Promise.resolve();

function getRules(): ReturnType<typeof loadRules> {
  rulesPromise ??= loadRules().catch((error) => {
    rulesPromise = undefined;
    throw error;
  });
  return rulesPromise;
}

async function focusTab(tab: chrome.tabs.Tab): Promise<void> {
  if (tab.id === undefined || tab.windowId === undefined) return;
  await webExtension.windows.update(tab.windowId, { focused: true });
  await webExtension.tabs.update(tab.id, { active: true });
}

async function focusExistingTab(
  url: string,
  sourceTabId?: number,
  sourceUrl?: string,
): Promise<boolean> {
  const rules = await getRules();
  const key = getUrlKey(url, rules);
  if (!key) return false;
  if (sourceUrl) {
    const sourcePattern = getOriginPattern(new URL(sourceUrl).origin);
    const allowed = await webExtension.permissions.contains({ origins: [sourcePattern] });
    if (!allowed) return false;
  }

  const tabs = await webExtension.tabs.query({});
  const existing = tabs.find((tab) => {
    return tab.id !== undefined
      && tab.id !== sourceTabId
      && tab.url !== undefined
      && getUrlKey(tab.url, rules) === key;
  });
  if (!existing) return false;

  const current = await webExtension.tabs.get(existing.id!);
  const currentUrl = current.pendingUrl ?? current.url;
  if (!currentUrl || getUrlKey(currentUrl, rules) !== key) return false;
  await focusTab(current);
  return true;
}

async function getGrantedPatterns(rules: UrlRule[]): Promise<string[]> {
  const patterns = [
    ...new Set(
      rules.filter((rule) => rule.enabled).map((rule) => {
        return getOriginPattern(rule.baseUrl);
      }),
    ),
  ];
  const grants = await Promise.all(patterns.map(async (pattern) => {
    const granted = await webExtension.permissions.contains({ origins: [pattern] });
    return granted ? pattern : undefined;
  }));
  return grants.filter((pattern) => pattern !== undefined);
}

async function synchronizeClickInterceptor(): Promise<void> {
  const patterns = await getGrantedPatterns(await getRules());
  const registered = await webExtension.scripting.getRegisteredContentScripts({
    ids: [CLICK_INTERCEPTOR_ID],
  });
  const currentPatterns = registered[0]?.matches?.toSorted() ?? [];
  const nextPatterns = patterns.toSorted();

  if (currentPatterns.join("\n") !== nextPatterns.join("\n")) {
    await webExtension.scripting.unregisterContentScripts({ ids: [CLICK_INTERCEPTOR_ID] }).catch(
      () => undefined,
    );
    if (patterns.length > 0) {
      await webExtension.scripting.registerContentScripts([{
        id: CLICK_INTERCEPTOR_ID,
        js: ["content.js"],
        matches: patterns,
        runAt: "document_start",
      }]);

      const matchingTabs = await webExtension.tabs.query({ url: patterns });
      await Promise.all(matchingTabs.map(async (tab) => {
        if (tab.id === undefined) return;
        await webExtension.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["content.js"],
        }).catch(() => undefined);
      }));
    }
  }

  const updateMessage = { type: "update-click-interceptor", patterns } as const;
  const tabs = await webExtension.tabs.query({});
  await Promise.all(tabs.map(async (tab) => {
    if (tab.id === undefined) return;
    await webExtension.tabs.sendMessage(tab.id, updateMessage).catch(() => undefined);
  }));
}

function queueInterceptorSync(): void {
  interceptorSync = interceptorSync
    .catch(() => undefined)
    .then(synchronizeClickInterceptor)
    .catch((error) => console.warn("TabOnce could not update click interception.", error));
}

async function deduplicateTab(tabId: number, url: string): Promise<void> {
  const rules = await getRules();
  const key = getUrlKey(url, rules);
  if (!key) return;

  const tabs = await webExtension.tabs.query({});
  let existing: chrome.tabs.Tab | undefined;
  for (const tab of tabs) {
    if (tab.id === undefined || !tab.url || getUrlKey(tab.url, rules) !== key) continue;
    if (!existing || tab.id < existing.id!) existing = tab;
  }

  if (!existing || existing.id === tabId) return;

  const current = await webExtension.tabs.get(tabId);
  const currentUrl = current.pendingUrl ?? current.url;
  if (!currentUrl || getUrlKey(currentUrl, rules) !== key) return;
  await focusTab(existing);
  if (pendingUrls.has(tabId)) return;
  const focused = await webExtension.tabs.get(tabId);
  const focusedUrl = focused.pendingUrl ?? focused.url;
  if (!focusedUrl || getUrlKey(focusedUrl, rules) !== key) return;
  const destination = await webExtension.tabs.get(existing.id!);
  const destinationUrl = destination.pendingUrl ?? destination.url;
  if (!destinationUrl || getUrlKey(destinationUrl, rules) !== key) return;
  await webExtension.tabs.remove(tabId);
}

async function processTab(tabId: number): Promise<void> {
  if (processingUrls.has(tabId)) return;

  try {
    while (pendingUrls.has(tabId)) {
      const url = pendingUrls.get(tabId)!;
      pendingUrls.delete(tabId);
      processingUrls.set(tabId, url);
      await deduplicateTab(tabId, url);
      processingUrls.delete(tabId);
    }
  } catch (error) {
    console.warn("TabOnce could not process a tab update.", error);
  } finally {
    processingUrls.delete(tabId);
    if (pendingUrls.has(tabId)) void processTab(tabId);
  }
}

function queueTab(tabId: number, url: string): void {
  if (pendingUrls.get(tabId) === url || processingUrls.get(tabId) === url) return;
  pendingUrls.set(tabId, url);
  void processTab(tabId);
}

webExtension.tabs.onCreated.addListener((tab) => {
  if (tab.id === undefined) return;
  newlyCreatedTabs.add(tab.id);
  const url = tab.pendingUrl ?? tab.url;
  if (url) queueTab(tab.id, url);
});

webExtension.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!newlyCreatedTabs.has(tabId)) return;
  if (changeInfo.url) queueTab(tabId, changeInfo.url);
  const currentUrl = tab.pendingUrl ?? tab.url;
  if (shouldStopTrackingNewTab(changeInfo.status, currentUrl)) {
    newlyCreatedTabs.delete(tabId);
  }
});

webExtension.tabs.onRemoved.addListener((tabId) => {
  newlyCreatedTabs.delete(tabId);
  pendingUrls.delete(tabId);
  processingUrls.delete(tabId);
});

webExtension.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "sync" && changes.rules) {
    rulesPromise = undefined;
    queueInterceptorSync();
  }
});

webExtension.permissions.onAdded.addListener(queueInterceptorSync);
webExtension.permissions.onRemoved.addListener(queueInterceptorSync);
webExtension.runtime.onInstalled.addListener(queueInterceptorSync);
webExtension.runtime.onStartup.addListener(queueInterceptorSync);
webExtension.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isFocusExistingTabRequest(message)) return false;

  void focusExistingTab(message.url, sender.tab?.id, sender.url ?? sender.tab?.url).then(
    (focused) => sendResponse({ focused } satisfies FocusExistingTabResponse),
    () => sendResponse({ focused: false } satisfies FocusExistingTabResponse),
  );
  return true;
});

queueInterceptorSync();
