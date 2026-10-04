/**
 * Abbreviation rules. Every case here came from Josh's 2026-10-04 field report
 * on Olbryn in Iron Gods. Run: node test/abbreviations.test.mjs
 */
import assert from "node:assert/strict";
import { generateAbbreviation, expandAbbreviation, LEGACY_ALIASES } from "../scripts/chat/AbbreviationGenerator.js";

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log("  ok -", name); };

// --- ratified 2026-08-27: saves are three letters ---
t("Fortitude is /for, not /fort", () =>
  assert.equal(generateAbbreviation("Fortitude Save", { saveType: "fort" }), "for"));

t("Will is /wil, not /will", () =>
  assert.equal(generateAbbreviation("Will Save", { saveType: "will" }), "wil"));

t("Reflex stays /ref", () =>
  assert.equal(generateAbbreviation("Reflex Save", { saveType: "ref" }), "ref"));

t("no aliases - one command per thing", () =>
  assert.deepEqual(LEGACY_ALIASES, {}));

// --- the /int collision: PF1 names the Intimidate skill "int" ---
t("Intimidate moves to /itm", () =>
  assert.equal(generateAbbreviation("Intimidate", { skillKey: "int" }), "itm"));

t("Intelligence keeps /int", () =>
  assert.equal(generateAbbreviation("Intelligence Check", { abilityKey: "int" }), "int"));


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

// --- separating two things that land on the same code ---
t("extra = 0 reproduces the normal abbreviation", () => {
  assert.equal(expandAbbreviation("Wand of Cure Light Wounds", 0), "wclw");
  assert.equal(expandAbbreviation("Haste", 0), "hast");
});

t("the two scrolls separate by extending the last word", () => {
  const tech = expandAbbreviation("Scroll of Technomancy", 2);
  const tele = expandAbbreviation("Scroll of Teleport", 2);
  assert.notEqual(tech, tele);
  assert.equal(tech, "stec");
  assert.equal(tele, "stel");
});

t("extending further keeps them distinct", () => {
  assert.equal(expandAbbreviation("Scroll of Technomancy", 3), "stech");
  assert.equal(expandAbbreviation("Scroll of Teleport", 3), "stele");
});

t("the skipped word stays skipped while extending", () =>
  assert.equal(expandAbbreviation("Wand of Cure Light Wounds", 2), "wclwou"));

t("a reserved result is still guarded when extending", () =>
  assert.equal(expandAbbreviation("Status", 0), "statx"));

console.log(`\n${pass} assertions passed.`);
