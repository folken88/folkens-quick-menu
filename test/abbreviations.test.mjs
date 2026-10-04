/**
 * Abbreviation rules. Every case here came from Josh's 2026-10-04 field report
 * on Olbryn in Iron Gods. Run: node test/abbreviations.test.mjs
 */
import assert from "node:assert/strict";
import { generateAbbreviation, LEGACY_ALIASES } from "../scripts/chat/AbbreviationGenerator.js";

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log("  ok -", name); };

// --- ratified 2026-08-27: saves are three letters ---
t("Fortitude is /for, not /fort", () =>
  assert.equal(generateAbbreviation("Fortitude Save", { saveType: "fort" }), "for"));

t("Will is /wil, not /will", () =>
  assert.equal(generateAbbreviation("Will Save", { saveType: "will" }), "wil"));

t("Reflex stays /ref", () =>
  assert.equal(generateAbbreviation("Reflex Save", { saveType: "ref" }), "ref"));

t("old save forms are kept as aliases", () => {
  assert.deepEqual(LEGACY_ALIASES.for, ["fort"]);
  assert.deepEqual(LEGACY_ALIASES.wil, ["will"]);
});

// --- the /int collision: PF1 names the Intimidate skill "int" ---
t("Intimidate moves to /itm", () =>
  assert.equal(generateAbbreviation("Intimidate", { skillKey: "int" }), "itm"));

t("Intelligence keeps /int", () =>
  assert.equal(generateAbbreviation("Intelligence Check", { abilityKey: "int" }), "int"));

t("Intimidate keeps its old forms as aliases", () =>
  assert.ok(LEGACY_ALIASES.itm.includes("inti")));

// --- the /st bug: multi-word names skipped the reserved-word check ---
t("Scroll of Technomancy does not take the status command", () => {
  const a = generateAbbreviation("Scroll of Technomancy");
  assert.notEqual(a, "st");
  assert.equal(a, "stx");
});

t("a multi-word name that is not reserved is untouched", () =>
  assert.equal(generateAbbreviation("Wand of Cure Light Wounds"), "wclw"));

t("single-word reserved names are still guarded", () =>
  assert.equal(generateAbbreviation("Status"), "statx"));

// --- subskills ---
t("Profession (Sailor) abbreviates from the parenthetical", () =>
  assert.equal(generateAbbreviation("Profession (Sailor)",
    { skillKey: "pro.subSkills.pro1", abbrevHint: "Sailor" }), "sail"));

t("two professions do not collapse onto the same command", () => {
  const a = generateAbbreviation("Profession (Sailor)", { skillKey: "pro.subSkills.pro1", abbrevHint: "Sailor" });
  const b = generateAbbreviation("Profession (Pirate)", { skillKey: "pro.subSkills.pro2", abbrevHint: "Pirate" });
  assert.notEqual(a, b);
});

// --- Heal: the skill map used "hel" but PF1's key is "hea" ---
t("Heal resolves to /hea", () =>
  assert.equal(generateAbbreviation("Heal", { skillKey: "hea" }), "hea"));

console.log(`\n${pass} assertions passed.`);
