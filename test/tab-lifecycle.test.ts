import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldStopTrackingNewTab } from "../src/tab-lifecycle.js";

describe("shouldStopTrackingNewTab", () => {
  it("keeps tracking initial Firefox and Chromium new-tab pages", () => {
    assert.equal(shouldStopTrackingNewTab("complete", undefined), false);
    assert.equal(shouldStopTrackingNewTab("complete", "about:blank"), false);
    assert.equal(shouldStopTrackingNewTab("complete", "about:newtab"), false);
    assert.equal(shouldStopTrackingNewTab("complete", "chrome://newtab/"), false);
  });

  it("waits for a real page to finish loading", () => {
    const url = "https://github.com/dkarter/tab-once/pull/3";
    assert.equal(shouldStopTrackingNewTab("loading", url), false);
    assert.equal(shouldStopTrackingNewTab("complete", url), true);
  });
});
