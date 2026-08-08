import { getOriginPattern, type UrlRule, validateRule } from "./rules.js";
import { removeSiteAccessIfUnused, requestSiteAccess } from "./site-access.js";
import { loadRules, removeRule, upsertRule } from "./storage.js";

const rulesElement = document.querySelector<HTMLDivElement>("#rules")!;
const emptyState = document.querySelector<HTMLDivElement>("#empty-state")!;
const template = document.querySelector<HTMLTemplateElement>("#rule-template")!;
const status = document.querySelector<HTMLDivElement>("#status")!;
let rules: UrlRule[] = [];
let statusTimer: ReturnType<typeof setTimeout> | undefined;

function showStatus(message: string): void {
  status.textContent = message;
  status.classList.add("visible");
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => status.classList.remove("visible"), 1800);
}

function value(form: HTMLFormElement, name: string): string {
  return form.elements.namedItem(name) instanceof HTMLInputElement
    ? (form.elements.namedItem(name) as HTMLInputElement).value.trim()
    : "";
}

function checked(form: HTMLFormElement, name: string): boolean {
  const input = form.elements.namedItem(name);
  return input instanceof HTMLInputElement && input.checked;
}

function readRule(form: HTMLFormElement, id: string): UrlRule {
  return {
    id,
    name: value(form, "name"),
    baseUrl: value(form, "baseUrl"),
    pathPattern: value(form, "pathPattern"),
    ignoreQuery: checked(form, "ignoreQuery"),
    ignoreHash: checked(form, "ignoreHash"),
    enabled: checked(form, "enabled"),
  };
}

function fillForm(form: HTMLFormElement, rule: UrlRule): void {
  for (const name of ["name", "baseUrl", "pathPattern"] as const) {
    const input = form.elements.namedItem(name);
    if (input instanceof HTMLInputElement) input.value = rule[name];
  }
  for (const name of ["ignoreQuery", "ignoreHash", "enabled"] as const) {
    const input = form.elements.namedItem(name);
    if (input instanceof HTMLInputElement) input.checked = rule[name];
  }
}

function updateEmptyState(): void {
  emptyState.hidden = rulesElement.childElementCount > 0;
}

function appendRule(rule: UrlRule): HTMLFormElement {
  const form = template.content.firstElementChild!.cloneNode(true) as HTMLFormElement;
  const error = form.querySelector<HTMLSpanElement>(".error")!;
  fillForm(form, rule);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const updatedRule = readRule(form, rule.id);
    const validationError = validateRule(updatedRule);
    if (validationError) {
      error.textContent = validationError;
      return;
    }

    const siteAccessGranted = !updatedRule.enabled || await requestSiteAccess(updatedRule);
    const result = await upsertRule(updatedRule);
    rules = result.rules;
    const previousOrigin = result.previous
      ? getOriginPattern(result.previous.baseUrl)
      : undefined;
    const updatedOrigin = getOriginPattern(updatedRule.baseUrl);
    if (
      previousOrigin
      && previousOrigin !== updatedOrigin
    ) {
      await removeSiteAccessIfUnused(rules, previousOrigin);
    }
    await removeSiteAccessIfUnused(rules, updatedOrigin);
    error.textContent = "";
    showStatus(siteAccessGranted ? "Rule saved" : "Rule saved; site access was not granted");
  });

  form.querySelector<HTMLButtonElement>(".remove")!.addEventListener("click", async () => {
    const result = await removeRule(rule.id);
    rules = result.rules;
    if (result.removed) {
      await removeSiteAccessIfUnused(rules, getOriginPattern(result.removed.baseUrl));
    }
    form.remove();
    updateEmptyState();
    showStatus("Rule removed");
  });

  rulesElement.append(form);
  updateEmptyState();
  return form;
}

function render(): void {
  rulesElement.replaceChildren();
  for (const rule of rules) appendRule(rule);
  updateEmptyState();
}

document.querySelector<HTMLButtonElement>("#add-rule")!.addEventListener("click", () => {
  const form = appendRule({
    id: crypto.randomUUID(),
    name: "",
    baseUrl: "",
    pathPattern: "/**",
    ignoreQuery: true,
    ignoreHash: true,
    enabled: true,
  });
  form.querySelector<HTMLInputElement>("input[name=\"name\"]")?.focus();
});

void loadRules().then((storedRules) => {
  rules = storedRules;
  render();
});
