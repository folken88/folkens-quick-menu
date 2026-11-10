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
t("an entry with nothing to count says nothing", () =>
  assert.equal(entryCountText({}), ""));
t("charged uses without figures say nothing", () =>
  assert.equal(entryCountText({ uses: { per: "day" } }), ""));

console.log(`\n${pass} assertions passed.`);
