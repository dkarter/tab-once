import {
  type FocusExistingTabRequest,
  type FocusExistingTabResponse,
  isUpdateClickInterceptorMessage,
} from "./messages.js";
import { getOriginPattern, getUrlKey, type UrlRule } from "./rules.js";
import { loadRules } from "./storage.js";
import { webExtension } from "./web-extension.js";

const scope = globalThis as typeof globalThis & { __oneTabClickInterceptor?: boolean };

if (!scope.__oneTabClickInterceptor) {
  scope.__oneTabClickInterceptor = true;
  installClickInterceptor();
}

function installClickInterceptor(): void {
  let rules: UrlRule[] = [];
  let active = true;
  const replayedAnchors = new WeakSet<HTMLAnchorElement>();
  void loadRules().then((storedRules) => rules = storedRules);

  webExtension.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === "sync" && changes.rules) {
      void loadRules().then((storedRules) => rules = storedRules);
    }
  });

  webExtension.runtime.onMessage.addListener((message) => {
    if (!isUpdateClickInterceptorMessage(message)) return;
    active = message.patterns.includes(getOriginPattern(window.location.origin));
  });

  document.addEventListener("click", (event) => {
    if (
      !(event instanceof MouseEvent)
      || event.button !== 0
      || event.metaKey
      || event.ctrlKey
      || event.shiftKey
      || event.altKey
      || event.defaultPrevented
    ) {
      return;
    }

    const anchor = event.composedPath().find((node) => node instanceof HTMLAnchorElement);
    if (!(anchor instanceof HTMLAnchorElement) || anchor.download) return;
    if (replayedAnchors.delete(anchor)) return;
    if (!active) return;
    if (anchor.target && anchor.target.toLowerCase() !== "_self") return;
    const originRules = rules.filter((rule) => {
      return new URL(rule.baseUrl).origin === window.location.origin;
    });
    if (!getUrlKey(anchor.href, originRules)) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    void focusExistingTab(anchor, replayedAnchors);
  }, true);
}

async function focusExistingTab(
  anchor: HTMLAnchorElement,
  replayedAnchors: WeakSet<HTMLAnchorElement>,
): Promise<void> {
  const url = anchor.href;
  const request: FocusExistingTabRequest = { type: "focus-existing-tab", url };

  try {
    const response = await webExtension.runtime.sendMessage(request) as FocusExistingTabResponse;
    if (response.focused) return;
  } catch {
    // Preserve normal navigation if the background context is unavailable.
  }

  if (anchor.isConnected) {
    replayedAnchors.add(anchor);
    anchor.click();
  } else {
    window.location.assign(url);
  }
}
