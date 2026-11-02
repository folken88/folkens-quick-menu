/**
 * The Items menu: one entry per name, and what a container holds.
 * Run: node test/menu-items.test.mjs
 */
import assert from "node:assert/strict";
import { mergeStacks, containerContents } from "../scripts/character/MenuItems.js";
import { usesLeftLine } from "../scripts/executor/UseOutcome.js";

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log("  ok -", name); };

t("two stacks of one potion are one entry with the other stack as an alternate", () => {
  // Sparkbang, 2026-11-01: Potion of True Strike, quantity 2 from September and
  // 3 from the shop. The menu listed it twice and the first said "That was the
  // last one." with three left in the other.
  const a = { id: "item_a", label: "Potion of True Strike", actionType: "item", itemId: "a", quantity: 2 };
  const b = { id: "item_b", label: "Potion of True Strike", actionType: "item", itemId: "b", quantity: 3 };
  const merged = mergeStacks([a, b]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].itemId, "a");
  assert.deepEqual(merged[0].alternates, ["b"]);
  assert.equal(merged[0].quantity, 5);
});

t("different names, or the same name doing different things, stay apart", () => {
  const merged = mergeStacks([
    { label: "Arrow", actionType: "ammo_read", itemId: "x", quantity: 20 },
    { label: "Arrow", actionType: "item", itemId: "y", quantity: 1 },
    { label: "Bolt", actionType: "ammo_read", itemId: "z", quantity: 5 },
  ]);
  assert.equal(merged.length, 3);
});

t("a container's contents come from item.items in PF1 11.11", () => {
  const die = { id: "d", name: "Six-sided Die", type: "loot" };
  const box = { type: "container", items: { contents: [die] }, system: { contents: null } };
  assert.deepEqual(containerContents(box), [die]);
  assert.deepEqual(containerContents({ type: "container", system: { items: { d: die } } }), [die]);
  assert.deepEqual(containerContents({ type: "container", system: {} }), []);
});

t("a use that spends nothing on blank uses is not 'the last one'", () => {
  // Utility Shot: max follows grit, value never set, cost 0.
  const shot = { system: { uses: { per: "charges", max: 3, value: null } } };
  assert.equal(usesLeftLine(shot), "");
  assert.equal(usesLeftLine({ system: { uses: { per: "charges", max: 3, value: 0 } } }), "That was the last one.");
  assert.equal(usesLeftLine({ system: { uses: { per: "charges", max: 3, value: 2 } } }), "2 of 3 left.");
});

console.log(`${pass} assertions passed.`);
