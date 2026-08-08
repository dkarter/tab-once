import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseUrlRule } from "../src/rules.js";

const rule = {
  id: "github-pr",
  name: "GitHub pull requests",
  baseUrl: "https://github.com",
  pathPattern: "/:owner/:repo/pull/:number/**",
  ignoreQuery: true,
  ignoreHash: true,
};

describe("parseUrlRule", () => {
  it("accepts a valid rule", () => {
    assert.deepEqual(parseUrlRule(rule), { ...rule, enabled: true });
  });

  it("enables rules saved before the enabled setting existed", () => {
    assert.equal(parseUrlRule(rule)?.enabled, true);
  });

  it("preserves disabled rules", () => {
    assert.equal(parseUrlRule({ ...rule, enabled: false })?.enabled, false);
  });

  it("rejects incomplete and invalid synced values", () => {
    assert.equal(parseUrlRule({ ...rule, pathPattern: undefined }), undefined);
    assert.equal(parseUrlRule({ ...rule, baseUrl: "chrome://settings" }), undefined);
    assert.equal(parseUrlRule("not a rule"), undefined);
  });
});
