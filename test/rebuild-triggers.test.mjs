/**
 * Which item updates rebuild the command list (8.40, 1.1).
 * Run: node test/rebuild-triggers.test.mjs
 */
import assert from "node:assert/strict";
import { itemChangeNeedsRebuild } from "../scripts/chat/RebuildTriggers.js";

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log("  ok -", name); };

t("a rename rebuilds", () => assert.equal(itemChangeNeedsRebuild({ name: "Gree" }), true));
t("identification rebuilds", () => assert.equal(itemChangeNeedsRebuild({ system: { identified: true } }), true));
t("an unidentified-name change rebuilds", () => assert.equal(itemChangeNeedsRebuild({ system: { unidentified: { name: "Wand" } } }), true));
t("a quantity change does not", () => assert.equal(itemChangeNeedsRebuild({ system: { quantity: 2 } }), false));
t("uses and active changes do not", () => {
  assert.equal(itemChangeNeedsRebuild({ system: { uses: { value: 1 } } }), false);
  assert.equal(itemChangeNeedsRebuild({ system: { active: true } }), false);
});
t("an empty or missing change does not", () => {
  assert.equal(itemChangeNeedsRebuild({}), false);
  assert.equal(itemChangeNeedsRebuild(undefined), false);
});

console.log(`\n${pass} assertions passed.`);
