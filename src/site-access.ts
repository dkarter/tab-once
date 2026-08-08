import { getOriginPattern, type UrlRule } from "./rules.js";
import { webExtension } from "./web-extension.js";

export async function requestSiteAccess(rule: UrlRule): Promise<boolean> {
  try {
    return await webExtension.permissions.request({ origins: [getOriginPattern(rule.baseUrl)] });
  } catch {
    return false;
  }
}

export async function hasSiteAccess(rule: UrlRule): Promise<boolean> {
  return webExtension.permissions.contains({ origins: [getOriginPattern(rule.baseUrl)] });
}

export async function removeSiteAccess(pattern: string): Promise<void> {
  await webExtension.permissions.remove({ origins: [pattern] });
}

export async function removeSiteAccessIfUnused(
  rules: UrlRule[],
  pattern: string,
): Promise<void> {
  const inUse = rules.some((rule) => {
    return rule.enabled && getOriginPattern(rule.baseUrl) === pattern;
  });
  if (!inUse) await removeSiteAccess(pattern);
}
