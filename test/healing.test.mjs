/**
 * Temporary hit points are not healing (8.43): False Life reads "temporary hit points".
 * Run: node test/healing.test.mjs
 */
import assert from "node:assert/strict";
import { healingOf } from "../scripts/executor/Healing.js";
import { damageWord, renderAttackTotals } from "../scripts/chat/RollTotals.js";

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log("  ok -", name); };

const heal = (desc, action = {}) => ({ system: { description: { value: desc }, actions: { a: { actionType: "heal", ...action } } } });

t("False Life is temporary hit points", () =>
  assert.equal(healingOf(heal("<p>You gain 1d10 temporary hit points +1 per level.</p>")), "temp"));
t("tags around the phrase are stripped", () =>
  assert.equal(healingOf(heal("<p>gain <b>temporary hit</b> points</p>")), "temp"));
t("the action's effect notes can say it", () =>
  assert.equal(healingOf(heal("", { effectNotes: ["Gain 5 Temporary Hit Point"] })), "temp"));
t("effect notes as a string", () =>
  assert.equal(healingOf(heal("", { notes: { effect: "temporary hit points" } })), "temp"));
t("a cure potion is healing", () =>
  assert.equal(healingOf(heal("<p>Cures 1d8 points of damage.</p>")), true));
t("a fireball is not healing", () =>
  assert.equal(healingOf({ system: { actions: { a: { actionType: "save" } } } }), false));
t("temporary hit points text on a non-heal is not a heal", () =>
  assert.equal(healingOf({ system: { description: { value: "temporary hit points" }, actions: { a: { actionType: "save" } } } }), false));
t("a live document that says isHealing", () =>
  assert.equal(healingOf({ isHealing: true, system: { description: { value: "x" } } }), true));
t("a live defaultAction is read", () =>
  assert.equal(healingOf({ defaultAction: { actionType: "heal" }, system: { description: { value: "temporary hit points" } } }), "temp"));
t("no item is not healing", () => assert.equal(healingOf(null), false));

t("the word for temp HP", () => assert.equal(damageWord([], "temp"), "temporary hit points"));
t("the word for healing", () => assert.equal(damageWord([], true), "healing"));
t("the word for fire", () => assert.equal(damageWord(["fire"], false), "damage"));
t("the word for nonlethal", () => assert.equal(damageWord(["nonlethal"], false), "nonlethal"));
t("renderAttackTotals passes temp through", () =>
  assert.match(renderAttackTotals({ attack: 100, damage: 7 }, { healing: "temp" }), /7 temporary hit points/));

console.log(`${pass} assertions passed.`);
