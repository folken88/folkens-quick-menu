/**
 * Reading a roll total back out of a chat card.
 *
 * /cmb rolled but said nothing, because the reader only ever looked at
 * message.rolls, which PF1 leaves empty on an attack card. I could not find a
 * real attack card to confirm the shape against - 330 messages out of Iron Gods
 * contained none - so every plausible shape is covered here, and the no-match
 * case is covered too, because announcing a wrong number to someone who cannot
 * see the card is worse than announcing none.
 *
 * Run: node test/roll-totals.test.mjs
 */
import assert from "node:assert/strict";
import { extractRollTotals, renderAttackTotals, describeShape } from "../scripts/chat/RollTotals.js";

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log("  ok -", name); };

// --- shape 1: ordinary d20 cards, which already worked ---

t("a skill card total comes from message.rolls", () => {
  const r = extractRollTotals({ rolls: [{ total: 34 }] });
  assert.equal(r.attack, 34);
  assert.equal(r.source, "message.rolls");
});

t("extra rolls on a plain card are summed as damage", () => {
  const r = extractRollTotals({ rolls: [{ total: 22 }, { total: 4 }, { total: 3 }] });
  assert.equal(r.attack, 22);
  assert.equal(r.damage, 7);
});

// --- shape 2: PF1 attack and maneuver cards ---

t("an attack card with a bare roll in the attacks array", () => {
  const r = extractRollTotals({ rolls: [], flags: { pf1: { metadata: { rolls: { attacks: [{ total: 22 }] } } } } });
  assert.equal(r.attack, 22);
  assert.equal(r.source, "flags.pf1.metadata.rolls.attacks");
});

t("an attack card that wraps the roll under .attack", () => {
  const r = extractRollTotals({ rolls: [], flags: { pf1: { metadata: { rolls: { attacks: [{ attack: { total: 35 } }] } } } } });
  assert.equal(r.attack, 35);
});

t("an attack card whose rolls are serialized JSON strings", () => {
  const r = extractRollTotals({
    rolls: [],
    flags: { pf1: { metadata: { rolls: { attacks: [JSON.stringify({ total: 18 })] } } } },
  });
  assert.equal(r.attack, 18);
});

t("damage alongside the attack is summed", () => {
  const r = extractRollTotals({
    rolls: [],
    flags: { pf1: { metadata: { rolls: { attacks: [{ attack: { total: 22 }, damage: [{ total: 6 }, { total: 2 }] }] } } } },
  });
  assert.equal(r.attack, 22);
  assert.equal(r.damage, 8);
});

t("a singular attack key is also found", () => {
  const r = extractRollTotals({ rolls: [], flags: { pf1: { metadata: { rolls: { attack: { total: 15 } } } } } });
  assert.equal(r.attack, 15);
  assert.equal(r.source, "flags.pf1.metadata.rolls.attack");
});

// --- the no-match case, which must never invent a number ---

t("an unrecognised card yields nothing rather than a guess", () => {
  const r = extractRollTotals({ rolls: [], flags: { pf1: { somethingElse: true } } });
  assert.equal(r.attack, null);
  assert.equal(r.source, null);
});

t("nothing at all is safe", () => {
  for (const input of [null, undefined, {}, "x", 7]) {
    const r = extractRollTotals(input);
    assert.equal(r.attack, null, String(input));
  }
});

t("an empty attacks array is not treated as a hit", () =>
  assert.equal(extractRollTotals({ rolls: [], flags: { pf1: { metadata: { rolls: { attacks: [] } } } } }).attack, null));

t("a non-numeric total is rejected", () => {
  assert.equal(extractRollTotals({ rolls: [{ total: "twenty" }] }).attack, null);
  assert.equal(extractRollTotals({ rolls: [{ total: NaN }] }).attack, null);
});

// --- what gets said ---

t("attack and damage read as one short line", () =>
  assert.equal(renderAttackTotals({ attack: 22, damage: 7 }), "22 to hit, 7 damage."));

t("no damage is simply left out", () =>
  assert.equal(renderAttackTotals({ attack: 22, damage: null }), "22 to hit."));

t("zero damage is left out rather than read as zero", () =>
  assert.equal(renderAttackTotals({ attack: 22, damage: 0 }), "22 to hit."));

t("a roll of zero is still announced", () =>
  assert.equal(renderAttackTotals({ attack: 0 }), "0 to hit."));

t("nothing found means nothing said, so the caller can say something true", () => {
  assert.equal(renderAttackTotals({ attack: null }), "");
  assert.equal(renderAttackTotals({}), "");
});

// --- the diagnostic ---

t("the shape description names where it looked", () => {
  const d = describeShape({ rolls: [], flags: { pf1: { metadata: { rolls: { attacks: [] } } } } });
  assert.ok(d.includes("rolls=0"), d);
  assert.ok(d.includes("metadata"), d);
});

t("the diagnostic survives a malformed card", () => {
  assert.equal(describeShape(null), "not an object");
  assert.ok(describeShape({}).includes("none"));
});

console.log(`\n${pass} assertions passed.`);
