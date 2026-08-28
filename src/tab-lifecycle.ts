const NEW_TAB_PLACEHOLDER_URLS = new Set([
  "about:blank",
  "about:newtab",
  "chrome://newtab/",
]);

function isNewTabPlaceholder(url: string | undefined): boolean {
  return url === undefined || NEW_TAB_PLACEHOLDER_URLS.has(url);
}

export function shouldStopTrackingNewTab(
  status: "loading" | "complete" | "unloaded" | undefined,
  url: string | undefined,
): boolean {
  return status === "complete" && !isNewTabPlaceholder(url);
}
