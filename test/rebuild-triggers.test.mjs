/**
 * Which item updates rebuild the command list (8.40, 1.1).
 * Run: node test/rebuild-triggers.test.mjs
 */
import assert from "node:assert/strict";
import { itemChangeNeedsRebuild, renameAnnouncement } from "../scripts/chat/RebuildTriggers.js";
import { spellOut } from "../scripts/chat/AbbreviationGenerator.js";

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

t("a rename that changed the code is announced", () => {
  assert.equal(renameAnnouncement({ name: "Greenchaw", before: "ggp", after: "gree", alreadySpoken: false }),
    `Greenchaw is now slash ${spellOut("gree")}.`);
});
t("a rename that kept the code says nothing", () => {
  assert.equal(renameAnnouncement({ name: "Greenchaw", before: "gree", after: "gree", alreadySpoken: false }), null);
});
t("a change the rebuild already spoke is not repeated", () => {
  assert.equal(renameAnnouncement({ name: "Greenchaw", before: "ggp", after: "gree", alreadySpoken: true }), null);
});
t("no code after the rebuild says nothing", () => {
  assert.equal(renameAnnouncement({ name: "Greenchaw", before: "ggp", after: null, alreadySpoken: false }), null);
});

console.log(`\n${pass} assertions passed.`);
