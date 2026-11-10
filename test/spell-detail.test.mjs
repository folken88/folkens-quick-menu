/**
 * What a spell's line adds at full detail, and "Plus notes" at every level.
 * Run: node test/spell-detail.test.mjs
 */
import assert from "node:assert/strict";
import { spellDetailLine, rangeText, durationText, hasNotes } from "../scripts/chat/SpellDetail.js";

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log("  ok -", name); };

const fireball = {
  name: "Fireball",
  system: { sr: true, actions: [{ range: { value: "", units: "long" }, area: "20-ft.-radius spread", duration: { value: "", units: "inst" }, effectNotes: [] }] },
};
const haste = {
  name: "Haste",
  system: { sr: true, actions: [{ range: { value: "", units: "close" }, area: "", duration: { value: "@cl", units: "round" }, effectNotes: ["One extra attack at full bonus. Not on Dead Shot."] }] },
};

t("full detail reads range, area, duration and spell resistance", () => {
  assert.equal(spellDetailLine(fireball, { terse: false }),
    "Range long. Area 20-ft.-radius spread. Duration instantaneous. Spell resistance applies.");
});

t("short detail says nothing about a spell without notes", () => {
  assert.equal(spellDetailLine(fireball, { terse: true }), "");
});

t("notes are no longer announced as \"Plus notes\"; their rolled results are read from the card", () => {
  assert.equal(spellDetailLine(haste, { terse: true }), "");
  assert.equal(spellDetailLine(haste, { terse: false }),
    "Range close. Duration caster level rounds. Spell resistance applies.");
});

t("range and duration units read as words", () => {
  assert.equal(rangeText({ value: "30", units: "ft" }), "30 feet");
  assert.equal(rangeText({ value: "", units: "touch" }), "touch");
  assert.equal(rangeText({ value: "1 mile per level", units: "spec" }), "1 mile per level");
  assert.equal(durationText({ value: "1", units: "minute" }), "1 minute");
  assert.equal(durationText({ value: "10", units: "minute" }), "10 minutes");
  assert.equal(durationText({ value: "@cl * 10", units: "minute" }), "caster level times 10 minutes");
  assert.equal(durationText({ value: "", units: "perm" }), "permanent");
  assert.equal(durationText({ value: "", units: "turn" }), "until your next turn");
});

t("notes are found on the live action, the raw action or the item", () => {
  assert.equal(hasNotes({ defaultAction: { effectNotes: ["x"] } }), true);
  assert.equal(hasNotes({ system: { actions: [{ notes: { effect: ["x"] } }] } }), true);
  assert.equal(hasNotes({ system: { attackNotes: ["Add 4 for a single shot."] } }), true);
  assert.equal(hasNotes({ system: { actions: [{ effectNotes: ["", "  "] }] } }), false);
  assert.equal(hasNotes(null), false);
});

t("nothing to say for nothing", () => {
  assert.equal(spellDetailLine(null), "");
  assert.equal(spellDetailLine({ name: "Rock" }, { terse: false }), "");
});

console.log(`${pass} assertions passed.`);
