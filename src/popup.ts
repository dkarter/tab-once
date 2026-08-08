import { getOriginPattern, type UrlRule } from "./rules.js";
import { hasSiteAccess, removeSiteAccessIfUnused, requestSiteAccess } from "./site-access.js";
import { loadRules, upsertRule } from "./storage.js";
import { webExtension } from "./web-extension.js";

const rulesElement = document.querySelector<HTMLDivElement>("#popup-rules")!;
const emptyState = document.querySelector<HTMLParagraphElement>("#popup-empty")!;
const status = document.querySelector<HTMLParagraphElement>("#popup-status")!;
let rules: UrlRule[] = [];

function render(): void {
  rulesElement.replaceChildren();
  emptyState.hidden = rules.length > 0;

  for (const rule of rules) {
    const row = document.createElement("div");
    row.className = "popup-rule";

    const copy = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = rule.name;
    const origin = document.createElement("small");
    origin.textContent = new URL(rule.baseUrl).host;
    copy.append(name, origin);

    if (rule.enabled) {
      void hasSiteAccess(rule).then((granted) => {
        if (granted || !copy.isConnected) return;
        const allow = document.createElement("button");
        allow.className = "access-button";
        allow.type = "button";
        allow.textContent = "Allow click focus";
        allow.addEventListener("click", async () => {
          const permitted = await requestSiteAccess(rule);
          status.textContent = permitted ? "Click focus enabled" : "Site access not granted";
          if (permitted) allow.remove();
        });
        copy.append(allow);
      });
    }

    const toggleLabel = document.createElement("label");
    const toggle = document.createElement("input");
    toggle.type = "checkbox";
    toggle.checked = rule.enabled;
    toggle.setAttribute("aria-label", `${rule.enabled ? "Disable" : "Enable"} ${rule.name}`);
    toggle.addEventListener("change", async () => {
      const updatedRule = { ...rule, enabled: toggle.checked };
      const granted = !updatedRule.enabled || await requestSiteAccess(updatedRule);
      rules = (await upsertRule(updatedRule)).rules;
      await removeSiteAccessIfUnused(rules, getOriginPattern(updatedRule.baseUrl));
      status.textContent = granted ? "Rules updated" : "Enabled without click access";
      render();
    });
    toggleLabel.append(toggle);

    row.append(copy, toggleLabel);
    rulesElement.append(row);
  }
}

document.querySelector<HTMLButtonElement>("#open-options")!.addEventListener("click", async () => {
  await webExtension.runtime.openOptionsPage();
  window.close();
});

void loadRules().then((storedRules) => {
  rules = storedRules;
  render();
});
