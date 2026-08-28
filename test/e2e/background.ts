import { saveRules } from "../../src/storage.js";

declare const __E2E_BASE_URL__: string;

void saveRules([{
  id: "e2e-github-pr",
  name: "E2E GitHub pull requests",
  baseUrl: __E2E_BASE_URL__,
  pathPattern: "/:owner/:repo/pull/:number/**",
  ignoreQuery: true,
  ignoreHash: true,
  enabled: true,
}]).then(async () => {
  await import("../../src/background.js");
  await fetch(`${__E2E_BASE_URL__}/__tab_once_ready`);
});
