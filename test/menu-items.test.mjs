/**
 * The Items menu: one entry per name, and what a container holds.
 * Run: node test/menu-items.test.mjs
 */
import assert from "node:assert/strict";
import { mergeStacks, containerContents, quantityOf, infoEntry } from "../scripts/character/MenuItems.js";
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

t("quantity 0 is 0, missing is 1, a numeric string is a number", () => {
  assert.equal(quantityOf({ quantity: 0 }), 0);
  assert.equal(quantityOf({}), 1);
  assert.equal(quantityOf(undefined), 1);
  assert.equal(quantityOf({ quantity: "3" }), 3);
});
t("an empty stack merged with a full one counts one, not two", () => {
  const a = { id: "item_e", label: "Potion of Cure Light Wounds", actionType: "item", itemId: "e", quantity: quantityOf({ quantity: 0 }) };
  const b = { id: "item_f", label: "Potion of Cure Light Wounds", actionType: "item", itemId: "f", quantity: quantityOf({ quantity: 1 }) };
  assert.equal(mergeStacks([a, b])[0].quantity, 1);
});

t("charged wands never merge, even with the same name (10.3)", () => {
  const a = { id: "item_a", label: "Wand of Cure Light Wounds", actionType: "item", itemId: "a", quantity: 1, uses: { per: "charges", value: 33, max: 50 } };
  const b = { id: "item_b", label: "Wand of Cure Light Wounds", actionType: "item", itemId: "b", quantity: 1, uses: { per: "charges", value: 5, max: 50 } };
  const out = mergeStacks([a, b]);
  assert.equal(out.length, 2);
  assert.equal(out[0].alternates, undefined);
});
t("single-use potions still merge", () => {
  const a = { id: "item_a", label: "Potion of Bull's Strength", actionType: "item", itemId: "a", quantity: 1, uses: { per: "single" } };
  const b = { id: "item_b", label: "Potion of Bull's Strength", actionType: "item", itemId: "b", quantity: 2, uses: { per: "single" } };
  const out = mergeStacks([a, b]);
  assert.equal(out.length, 1);
  assert.equal(out[0].quantity, 3);
});

t("PF1 master format: contents are actor items flagged with the container id", () => {
  const out = containerContents({ id: "bag" }, [
    { id: "p", flags: { pf1: { container: "bag" } } },
    { id: "x", flags: {} },
    null,
  ]);
  assert.deepEqual(out.map(i => i.id), ["p"]);
});
t("system.items and items.contents formats still read without actorItems", () => {
  assert.equal(containerContents({ id: "b", system: { items: { a: { id: "a" } } } }).length, 1);
  assert.equal(containerContents({ id: "b", items: { contents: [{ id: "a" }, { id: "c" }] } }).length, 2);
});
t("both formats together dedupe by id", () => {
  const box = { id: "bag", items: { contents: [{ id: "p" }] } };
  const out = containerContents(box, [{ id: "p", flags: { pf1: { container: "bag" } } }, { id: "q", flags: { pf1: { container: "bag" } } }]);
  assert.deepEqual(out.map(i => i.id), ["p", "q"]);
});

t("a non-usable box content becomes an info entry with a spoken count", () => {
  const e = infoEntry({ id: "t1", name: "Torch", system: { quantity: 2 } });
  assert.equal(e.type, "info");
  assert.equal(e.actionType, "item_info");
  assert.equal(e.label, "Torch");
  assert.equal(e.menuLabel, "Torch, 2");
  assert.equal(e.itemId, "t1");
  assert.equal(e.quantity, 2);
});
t("merged info stacks announce the summed count", () => {
  const out = mergeStacks([infoEntry({ id: "a", name: "Torch", system: { quantity: 1 } }), infoEntry({ id: "b", name: "Torch", system: { quantity: 2 } })]);
  assert.equal(out.length, 1);
  assert.equal(out[0].quantity, 3);
  assert.equal(out[0].menuLabel, "Torch, 3");
});

console.log(`${pass} assertions passed.`);
