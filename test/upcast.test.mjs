/**
 * Up-casting for spontaneous casters.
 *
 * The arithmetic here moves real spell slots on a real character sheet, which a
 * blind player cannot glance at to check. So it is tested as numbers before it
 * is ever allowed near an actor.
 *
 * Run: node test/upcast.test.mjs
 */
import assert from "node:assert/strict";
import {
  slotsAt, findUpcastLevel, canOfferUpcast, ordinal,
  upcastPrompt, upcastConfirmation, noSlotsMessage, parseYesNo, planUpcast,
} from "../scripts/spells/Upcast.js";

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log("  ok -", name); };

// Olbryn's situation: out of 6th, 7th still available.
const book = (slots, spontaneous = true) => ({
  spontaneous,
  spells: Object.fromEntries(Object.entries(slots).map(([k, v]) => [`spell${k}`, { value: v, max: v }])),
});

const olbryn = book({ 0: 99, 1: 4, 2: 3, 3: 2, 4: 2, 5: 1, 6: 0, 7: 2, 8: 0, 9: 1 });

// --- which slot gets spent ---

t("out of 6th takes the 7th, as asked", () =>
  assert.equal(findUpcastLevel(olbryn, 6), 7));

t("the lowest available higher slot is used, not the highest", () => {
  // 7th and 9th are free. Spending the 9th to cast a 6th-level spell would be
  // throwing away the more valuable slot.
  assert.equal(findUpcastLevel(olbryn, 6), 7);
});

t("it steps past an empty level to the next one with a slot", () =>
  assert.equal(findUpcastLevel(olbryn, 7), 9));

t("nothing higher left returns nothing", () =>
  assert.equal(findUpcastLevel(book({ 8: 0, 9: 0 }), 8), null));

t("a 9th level spell can never be up-cast", () =>
  assert.equal(findUpcastLevel(olbryn, 9), null));

// --- when to offer at all ---

t("offered when a spontaneous caster is out at that level", () =>
  assert.equal(canOfferUpcast(olbryn, 6), true));

t("never offered to a prepared caster", () =>
  assert.equal(canOfferUpcast(book({ 6: 0, 7: 2 }, false), 6), false));

t("not offered while slots remain at the spell's own level", () =>
  assert.equal(canOfferUpcast(olbryn, 5), false));

t("not offered for cantrips, which do not run out", () =>
  assert.equal(canOfferUpcast(olbryn, 0), false));

t("not offered when nothing higher is free either", () =>
  assert.equal(canOfferUpcast(book({ 6: 0, 7: 0, 8: 0, 9: 0 }), 6), false));

t("a missing or malformed book never offers", () => {
  assert.equal(canOfferUpcast(undefined, 6), false);
  assert.equal(canOfferUpcast({}, 6), false);
  assert.equal(canOfferUpcast(olbryn, "six"), false);
});

t("a missing slot entry counts as zero, not as an error", () =>
  assert.equal(slotsAt(book({ 1: 2 }), 5), 0));

// --- the arithmetic that touches his sheet ---

t("one slot is lent at the spell's level and one taken from above", () => {
  const plan = planUpcast("primary", 6, 7, olbryn);
  assert.equal(plan.updates["system.attributes.spells.spellbooks.primary.spells.spell6.value"], 1);
  assert.equal(plan.updates["system.attributes.spells.spellbooks.primary.spells.spell7.value"], 1);
});

t("after the cast the spell's own level is back where it started", () => {
  const plan = planUpcast("primary", 6, 7, olbryn);
  assert.equal(plan.expectedAfterCast["system.attributes.spells.spellbooks.primary.spells.spell6.value"], 0);
});

t("the net effect is exactly one higher slot spent", () => {
  const before6 = slotsAt(olbryn, 6), before7 = slotsAt(olbryn, 7);
  const plan = planUpcast("primary", 6, 7, olbryn);
  const lent6 = plan.updates["system.attributes.spells.spellbooks.primary.spells.spell6.value"];
  const after7 = plan.updates["system.attributes.spells.spellbooks.primary.spells.spell7.value"];
  assert.equal(lent6 - 1, before6, "the lent slot must be given back by the cast");
  assert.equal(after7, before7 - 1, "exactly one higher slot spent");
});

t("both changes are in one update, so the sheet is never half-changed", () =>
  assert.equal(Object.keys(planUpcast("primary", 6, 7, olbryn).updates).length, 2));

t("a non-default spellbook key is respected", () => {
  const plan = planUpcast("spelllike", 3, 4, book({ 3: 0, 4: 1 }));
  assert.ok("system.attributes.spells.spellbooks.spelllike.spells.spell3.value" in plan.updates);
});

// --- what he hears ---

t("the prompt is short and ends on the question", () => {
  const p = upcastPrompt("Disintegrate", 6, 7);
  assert.equal(p, "Out of 6th. Cast Disintegrate with a 7th?");
  assert.ok(p.endsWith("?"));
});

t("the confirmation says which slot was actually spent", () =>
  assert.equal(upcastConfirmation("Disintegrate", 7), "Disintegrate, cast with a 7th slot."));

t("running out entirely says so rather than offering nothing", () =>
  assert.equal(noSlotsMessage(6), "Out of 6th, and nothing higher left."));

t("ordinals read properly", () => {
  assert.equal(ordinal(1), "1st");
  assert.equal(ordinal(2), "2nd");
  assert.equal(ordinal(3), "3rd");
  assert.equal(ordinal(6), "6th");
});

// --- the answer ---

t("Y and N, in any case, with or without a slash", () => {
  for (const yes of ["y", "Y", "yes", "YES", "/y", " y "]) assert.equal(parseYesNo(yes), true, yes);
  for (const no of ["n", "N", "no", "NO", "/n"]) assert.equal(parseYesNo(no), false, no);
});

t("anything else is not an answer and must fall through to chat", () => {
  for (const other of ["", "maybe", "yep", "nope", "ya", "6dis", "1", null, undefined]) {
    assert.equal(parseYesNo(other), null, String(other));
  }
});

console.log(`\n${pass} assertions passed.`);
