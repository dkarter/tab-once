import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getOriginPattern,
  getRuleKey,
  getUrlKey,
  type UrlRule,
  validateRule,
} from "../src/rules.js";

const githubRule: UrlRule = {
  id: "github-pr",
  name: "GitHub pull requests",
  baseUrl: "https://github.com",
  pathPattern: "/:owner/:repo/pull/:number/**",
  ignoreQuery: true,
  ignoreHash: true,
  enabled: true,
};

describe("getRuleKey", () => {
  it("treats a pull request and its deeper comment URL as the same resource", () => {
    const pullRequest = getRuleKey("https://github.com/dkarter/dotfiles/pull/1", githubRule);
    const comment = getRuleKey(
      "https://github.com/dkarter/dotfiles/pull/1/files#r123",
      githubRule,
    );

    assert.equal(pullRequest, comment);
  });

  it("keeps named segment values in the identity", () => {
    const first = getRuleKey("https://github.com/dkarter/dotfiles/pull/1", githubRule);
    const second = getRuleKey("https://github.com/dkarter/dotfiles/pull/2", githubRule);

    assert.notEqual(first, second);
  });

  it("does not match another origin or route", () => {
    assert.equal(getRuleKey("https://example.com/dkarter/dotfiles/pull/1", githubRule), undefined);
    assert.equal(getRuleKey("https://github.com/dkarter/dotfiles/issues/1", githubRule), undefined);
  });

  it("can retain query strings and fragments", () => {
    const strictRule = { ...githubRule, ignoreQuery: false, ignoreHash: false };
    const first = getRuleKey("https://github.com/dkarter/dotfiles/pull/1?view=a#top", strictRule);
    const second = getRuleKey("https://github.com/dkarter/dotfiles/pull/1?view=b#top", strictRule);

    assert.notEqual(first, second);
  });

  it("supports a path in the base URL", () => {
    const rule = {
      ...githubRule,
      baseUrl: "https://grafana.example.com/dashboards",
      pathPattern: "/:dashboard/**",
    };

    assert.equal(
      getRuleKey("https://grafana.example.com/dashboards/api-latency/edit", rule),
      "github-pr:https://grafana.example.com/dashboards/api-latency",
    );
  });
});

describe("getUrlKey", () => {
  it("leaves URLs unmatched when no rule opts in", () => {
    assert.equal(getUrlKey("https://example.com/anything", [githubRule]), undefined);
  });

  it("skips disabled rules", () => {
    assert.equal(
      getUrlKey("https://github.com/dkarter/dotfiles/pull/1", [{
        ...githubRule,
        enabled: false,
      }]),
      undefined,
    );
  });
});

describe("getOriginPattern", () => {
  it("limits site access to the rule origin", () => {
    assert.equal(getOriginPattern("https://github.com/dkarter"), "https://github.com/*");
  });
});

describe("validateRule", () => {
  it("rejects unsupported base URLs", () => {
    assert.equal(
      validateRule({ ...githubRule, baseUrl: "chrome://settings" }),
      "Base URL must use http or https.",
    );
  });

  it("only permits /** at the end", () => {
    assert.equal(
      validateRule({ ...githubRule, pathPattern: "/:owner/**/pull/:number" }),
      "/** is only allowed at the end of a pattern.",
    );
  });

  it("returns a validation error instead of throwing for malformed escapes", () => {
    assert.equal(validateRule({ ...githubRule, pathPattern: "/%/**" }), undefined);
    assert.doesNotThrow(() => getRuleKey("https://github.com/%", githubRule));
  });
});
