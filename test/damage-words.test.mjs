/**
 * What the voice says about a roll: ability damage, nonlethal, the save DC,
 * and PF1's +100 "always hits". From Josh's 2026-10-29 report, with the card
 * shapes read from real Shackles messages the same day.
 * Run: node test/damage-words.test.mjs
 */
import assert from "node:assert/strict";
import { extractRollTotals, renderAttackTotals, damageWord, saveName } from "../scripts/chat/RollTotals.js";

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log("  ok -", name); };

/** A PF1 attack card as it sits in the messages DB. */
const card = ({ attacks, save = undefined }) => ({ rolls: [], system: { rolls: { attacks }, ...(save ? { save } : {}) } });
const dmg = (total, damageType) => ({ total, options: { damageType, type: "normal" } });

// --- the Shackles Rum Ration: 1 Constitution damage, Fort DC 5 negates ---

t("ability damage is named, and the save the target faces is read", () => {
  const totals = extractRollTotals(card({ attacks: [{ attack: null, damage: [dmg(1, ["Constitution"])] }], save: { dc: 5, type: "fort" } }));
  assert.deepEqual(totals.attacks[0].types, ["Constitution"]);
  assert.deepEqual(totals.save, { dc: 5, type: "fort" });
  assert.equal(renderAttackTotals(totals), "1 Constitution damage. Fort DC 5.");
});

// --- Wack Juce: 2 nonlethal ---

t("nonlethal says so", () => {
  const totals = extractRollTotals(card({ attacks: [{ attack: null, damage: [dmg(2, ["nonlethal"])] }] }));
  assert.equal(renderAttackTotals(totals), "2 nonlethal.");
});

// --- Scroll of Magic Missile: attack bonus +100 ---

t("a to-hit of 100 or more is read as hits", () => {
  const totals = extractRollTotals(card({ attacks: [{ attack: { total: 123 }, damage: [dmg(3, ["force"])] }] }));
  assert.equal(renderAttackTotals(totals), "hits, 3 damage.");
});

t("ordinary damage types are not read out", () => {
  const totals = extractRollTotals(card({ attacks: [{ attack: { total: 34 }, damage: [dmg(16, ["bludgeoning", "piercing"])] }] }));
  assert.equal(renderAttackTotals(totals), "34 to hit, 16 damage.");
});

t("damage rolls stored as JSON strings are read the same way", () => {
  const totals = extractRollTotals(card({ attacks: [{ attack: null, damage: [JSON.stringify(dmg(4, ["nonlethal"]))] }] }));
  assert.equal(renderAttackTotals(totals), "4 nonlethal.");
});

t("a healing card does not read its harmless save", () => {
  const totals = extractRollTotals(card({ attacks: [{ attack: null, damage: [dmg(9, ["positive"])] }], save: { dc: 11, type: "will" } }));
  assert.equal(renderAttackTotals(totals, { healing: true }), "9 healing.");
});

t("a full attack with a save reads the DC once, at the end", () => {
  const totals = extractRollTotals(card({ attacks: [
    { attack: { total: 34 }, damage: [dmg(16, ["slashing"])] },
    { attack: { total: 29 }, damage: [dmg(12, ["slashing"])] },
  ], save: { dc: 20, type: "fort" } }));
  assert.equal(renderAttackTotals(totals, { terse: true }), "34 to hit, 16 damage. 29 to hit, 12 damage. Fort DC 20.");
  assert.equal(renderAttackTotals(totals, { terse: false }), "2 attacks. First, 34 to hit, 16 damage. Second, 29 to hit, 12 damage. Fort DC 20.");
});

t("a save with no DC is ignored", () => {
  const totals = extractRollTotals(card({ attacks: [{ attack: { total: 20 }, damage: [] }], save: { dc: 0, type: "will" } }));
  assert.equal(totals.save, null);
  assert.equal(renderAttackTotals(totals), "20 to hit.");
});

// --- the words themselves ---

t("every ability is recognised by full name or abbreviation, and drain is drain", () => {
  assert.equal(damageWord(["Constitution"]), "Constitution damage");
  assert.equal(damageWord(["Str"]), "Strength damage");
  assert.equal(damageWord(["dex damage"]), "Dexterity damage");
  assert.equal(damageWord(["Wisdom drain"]), "Wisdom drain");
  assert.equal(damageWord(["Cha"]), "Charisma damage");
  assert.equal(damageWord(["Intelligence"]), "Intelligence damage");
});

t("a type that merely starts with the same letters is not an ability", () => {
  assert.equal(damageWord(["cold"]), "damage");        // not Constitution
  assert.equal(damageWord(["chaotic"]), "damage");     // not Charisma
  assert.equal(damageWord(["strike"]), "damage");      // not Strength
});

t("healing wins over any type", () => assert.equal(damageWord(["positive"], true), "healing"));

t("save names are short, the way Josh says them", () => {
  assert.equal(saveName("fort"), "Fort");
  assert.equal(saveName("ref"), "Ref");
  assert.equal(saveName("will"), "Will");
});

console.log(`${pass} assertions passed.`);
