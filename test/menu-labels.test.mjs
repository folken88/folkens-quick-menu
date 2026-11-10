/**
 * What the menu says about how many of a thing are left.
 * Run: node test/menu-labels.test.mjs
 */
import assert from "node:assert/strict";
import { entryCountText } from "../scripts/character/MenuItems.js";

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log("  ok -", name); };

t("a plain stack says how many are left", () =>
  assert.equal(entryCountText({ quantity: 3 }), "3 left"));
t("an empty single-use stack says 0 left", () =>
  assert.equal(entryCountText({ quantity: 0, uses: { per: "single" } }), "0 left"));
t("a charged item says charges of max", () =>
  assert.equal(entryCountText({ uses: { per: "charges", value: 33, max: 50 } }), "33 of 50"));
t("a real PF1 plain stack (empty per) keeps its quantity", () => {
  assert.equal(entryCountText({ quantity: 1, uses: { per: "", value: 0, max: 0 } }), "1 left");
  assert.equal(entryCountText({ quantity: 20, uses: { per: null, value: 0, max: 0 } }), "20 left");
});
t("charges win over quantity", () =>
  assert.equal(entryCountText({ quantity: 1, uses: { per: "charges", value: 33, max: 50 } }), "33 of 50"));
t("max 0 is not charged", () =>
  assert.equal(entryCountText({ quantity: 1, uses: { per: "day", value: 0, max: 0 } }), "1 left"));
t("an entry with nothing to count says nothing", () =>
  assert.equal(entryCountText({}), ""));
t("charged uses without figures or quantity say nothing", () =>
  assert.equal(entryCountText({ uses: { per: "day" } }), ""));

console.log(`\n${pass} assertions passed.`);
