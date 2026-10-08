/**
 * Abbreviation rules. Every case here came from Josh's 2026-10-04 field report
 * on Olbryn in Iron Gods. Run: node test/abbreviations.test.mjs
 */
import assert from "node:assert/strict";
import { generateAbbreviation, expandAbbreviation, expandAbbreviationHead, LEGACY_ALIASES,
         spellAbbreviation, spellAbbreviationHead, isLevelledSpell } from "../scripts/chat/AbbreviationGenerator.js";

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

t("a shared last word is separated from the front instead", () => {
  // Detect Magic / Dispel Magic: extending "Magic" never separates them.
  assert.equal(expandAbbreviation("Detect Magic", 2), expandAbbreviation("Dispel Magic", 2));
  assert.notEqual(expandAbbreviationHead("Detect Magic", 1), expandAbbreviationHead("Dispel Magic", 1));
  assert.equal(expandAbbreviationHead("Detect Magic", 1), "dem");
  assert.equal(expandAbbreviationHead("Dispel Magic", 1), "dim");
});

// --- the old macro set is the reference for these, not the system key ---
t("Initiative is /ini, as the old macros documented", () =>
  assert.equal(generateAbbreviation("Initiative"), "ini"));

t("an explicit abbreviation wins outright", () =>
  assert.equal(generateAbbreviation("Concentration Check (Spelllike)", { forceAbbrev: "conc2" }), "conc2"));

t("the primary spellbook keeps the documented conc", () =>
  assert.equal(generateAbbreviation("Concentration Check", { forceAbbrev: "conc" }), "conc"));

t("an explicit abbreviation is still guarded against reserved commands", () =>
  assert.equal(generateAbbreviation("Anything", { forceAbbrev: "st" }), "stx"));

// --- level-first spells. Josh's spec, 2026-10-04, example for example ---

const spell = (name, level) => generateAbbreviation(name, { actionType: "spell", level });

t("a one-word spell takes four letters after the level", () => {
  assert.equal(spell("Haste", 3), "3hast");
  assert.equal(spell("Slow", 3), "3slow");
  assert.equal(spell("Teleport", 5), "5tele");
});

t("a multi-word spell takes the initials after the level", () => {
  assert.equal(spell("Magic Missile", 1), "1mm");
  assert.equal(spell("Dispel Magic", 3), "3dm");
  assert.equal(spell("Telekinetic Charge", 4), "4tc");
});

t("cantrips are level 0, and Detect Magic is /0dm not /0", () =>
  assert.equal(spell("Detect Magic", 0), "0dm"));

t("Teleport, Greater is /7tg as PF1 names it", () =>
  assert.equal(spell("Teleport, Greater", 7), "7tg"));

t("only 'of' is dropped, so the command still falls out of the name", () => {
  assert.equal(spell("Protection from Evil", 1), "1pfe");
  assert.equal(spell("Shield of Faith", 1), "1sf");
});

t("an apostrophe does not become its own word", () =>
  assert.equal(spell("Mage's Faithful Hound", 5), "5mfh"));

t("the level form replaces the old spell codes entirely", () => {
  assert.notEqual(spell("Haste", 3), "hast");
  assert.notEqual(spell("True Strike", 1), "tst");
  assert.equal(spell("True Strike", 1), "1ts");
});

t("two same-level spells separate by extending the last word", () => {
  const fire = spellAbbreviation("Faerie Fire", 1, 1);
  const fall = spellAbbreviation("Feather Fall", 1, 1);
  assert.equal(fire, "1ffi");
  assert.equal(fall, "1ffa");
  assert.notEqual(fire, fall);
});

t("extra = 0 is the plain form, so a tiebreak never moves what works", () =>
  assert.equal(spellAbbreviation("Magic Missile", 1, 0), spell("Magic Missile", 1)));

t("spells at different levels never collide in the first place", () =>
  assert.notEqual(spell("Detect Magic", 0), spell("Dispel Magic", 3)));

t("a shared last word falls back to extending the front, keeping the level", () => {
  assert.equal(spellAbbreviationHead("Detect Magic", 2, 1), "2dem");
  assert.equal(spellAbbreviationHead("Dispel Magic", 2, 1), "2dim");
});

t("scrolls and wands are untouched by the spell scheme", () => {
  assert.equal(isLevelledSpell({ actionType: "item", level: 1 }), false);
  assert.equal(generateAbbreviation("Scroll of Technomancy", { actionType: "item" }), "stx");
  assert.equal(generateAbbreviation("Wand of Cure Light Wounds", { actionType: "item" }), "wclw");
});

t("a spell with no level recorded still gets a command", () => {
  assert.equal(isLevelledSpell({ actionType: "spell", level: undefined }), false);
  assert.equal(generateAbbreviation("Haste", { actionType: "spell" }), "hast");
});

// --- a command must be typeable: the interceptor only matches letters and digits ---

t("a plus sign in an item name does not reach the command", () => {
  // Josh, 2026-10-07: these two came out /c+t and /o+ and could never fire.
  assert.equal(generateAbbreviation("Charisma +6 Tattoo"), "c6t");
  assert.equal(generateAbbreviation("The Operative +6"), "o6");
});

t("the digit survives rather than the punctuation", () =>
  assert.equal(generateAbbreviation("Belt of Giant Strength +4"), "bgs4"));

t("no generated command can contain anything but letters and digits", () => {
  const names = [
    "Charisma +6 Tattoo", "The Operative +6", "Ring of Protection +2",
    "Cloak of Resistance +5", "Mage's Faithful Hound", "Wand of Cure Light Wounds",
    "Handy Haversack (Masterwork)", "Potion: Cure Light Wounds", "+1 Flaming Longsword",
  ];
  for (const n of names) {
    const a = generateAbbreviation(n);
    assert.match(a, /^[a-z0-9]*$/, `${n} -> ${a}`);
  }
});

t("a hand-set alias is sanitised too, so /fqm rename cannot create a dead command", () =>
  assert.equal(generateAbbreviation("anything", { forceAbbrev: "c+t" }), "ct"));

t("a subskill hint is sanitised as well", () =>
  assert.match(generateAbbreviation("Profession (Sailor-ish)",
    { skillKey: "pro.subSkills.pro1", abbrevHint: "Sail-or" }), /^[a-z0-9]+$/));

console.log(`\n${pass} assertions passed.`);
