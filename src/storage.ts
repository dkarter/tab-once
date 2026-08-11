import { parseUrlRule, type UrlRule } from "./rules.js";
import { webExtension } from "./web-extension.js";

const STORAGE_KEY = "rules";
const STORAGE_LOCK = "tab-once-rules";

export async function loadRules(): Promise<UrlRule[]> {
  const result = await webExtension.storage.sync.get(STORAGE_KEY);
  return Array.isArray(result[STORAGE_KEY])
    ? result[STORAGE_KEY].map(parseUrlRule).filter((rule) => rule !== undefined)
    : [];
}

export async function saveRules(rules: UrlRule[]): Promise<void> {
  await webExtension.storage.sync.set({ [STORAGE_KEY]: rules });
}

export async function upsertRule(rule: UrlRule): Promise<{
  rules: UrlRule[];
  previous?: UrlRule;
}> {
  return navigator.locks.request(STORAGE_LOCK, async () => {
    const rules = await loadRules();
    const index = rules.findIndex((item) => item.id === rule.id);
    const previous = index === -1 ? undefined : rules[index];
    if (index === -1) rules.push(rule);
    else rules[index] = rule;
    await saveRules(rules);
    return { rules, previous };
  });
}

export async function removeRule(id: string): Promise<{
  rules: UrlRule[];
  removed?: UrlRule;
}> {
  return navigator.locks.request(STORAGE_LOCK, async () => {
    const rules = await loadRules();
    const removed = rules.find((rule) => rule.id === id);
    const remainingRules = rules.filter((rule) => rule.id !== id);
    if (removed) await saveRules(remainingRules);
    return { rules: remainingRules, removed };
  });
}
