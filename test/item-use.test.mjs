/**
 * Which items earn a chat command.
 * Run: node test/item-use.test.mjs
 */
import assert from "node:assert/strict";
import { isTriggerable } from "../scripts/character/ItemUse.js";

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log("  ok -", name); };

// --- the case that prompted this (Josh / Tobias, 2026-10-07) ---

t("a worn passive item gets no command", () => {
  // Charisma +6 Tattoo: equipped, no actions, no charges. It had /c6t, and all
  // that did was post its own card to chat.
  const tattoo = { hasAction: false, system: { equipped: true, uses: {}, activation: {} } };
  assert.equal(isTriggerable(tattoo), false);
});

t("being equipped is not on its own a reason for a command", () => {
  const cloak = { hasAction: false, system: { equipped: true } };
  assert.equal(isTriggerable(cloak), false);
});

// --- things that must keep their commands ---

t("an item with an action keeps its command", () =>
  assert.equal(isTriggerable({ hasAction: true, system: {} }), true));

t("a charged item keeps its command even with no action", () =>
  assert.equal(isTriggerable({ hasAction: false, system: { uses: { per: "charges", max: 50, value: 12 } } }), true));

t("PF1's default uses.max of 1, with no period, is NOT a charge", () => {
  // Josh, 2026-10-09: this is how the workbook, Ring of Wizardry, Spell Prism
  // and the Wayfinder all got commands that only posted their card.
  assert.equal(isTriggerable({ hasAction: false, system: { uses: { max: 1, value: 1 } } }), false);
});

t("PF1's own isCharged getter is preferred when present", () => {
  assert.equal(isTriggerable({ hasAction: false, isCharged: false, system: { uses: { max: 1 } } }), false);
  assert.equal(isTriggerable({ hasAction: false, isCharged: true, system: {} }), true);
});

t("a 3-per-day rod keeps its command", () =>
  assert.equal(isTriggerable({ hasAction: false, system: { uses: { per: "day", max: 3, value: 3 } } }), true));

t("an item with a declared activation keeps its command", () =>
  assert.equal(isTriggerable({ hasAction: false, system: { activation: { type: "standard" } } }), true));

t("a wand with both is fine", () =>
  assert.equal(isTriggerable({ hasAction: true, system: { uses: { max: 50 } } }), true));

// --- falling back to the raw data model ---

t("without PF1's getter, the actions array is read directly", () => {
  assert.equal(isTriggerable({ system: { actions: [{ name: "Strike" }] } }), true);
  assert.equal(isTriggerable({ system: { actions: [] } }), false);
});

t("a hasAction of false does not stop the charge fallback", () => {
  // PF1 may report no action while the item is still usable by charges.
  assert.equal(isTriggerable({ hasAction: false, system: { uses: { per: "day", max: 3 } } }), true);
});

// --- robustness ---

t("missing or malformed items are not triggerable", () => {
  for (const input of [null, undefined, {}, { system: {} }, { system: null }]) {
    assert.equal(isTriggerable(input), false, JSON.stringify(input));
  }
});

t("uses.max of zero is not a charge", () =>
  assert.equal(isTriggerable({ hasAction: false, system: { uses: { max: 0 } } }), false));

t("an empty activation type is not an activation", () =>
  assert.equal(isTriggerable({ hasAction: false, system: { activation: { type: "" } } }), false));

console.log(`\n${pass} assertions passed.`);
