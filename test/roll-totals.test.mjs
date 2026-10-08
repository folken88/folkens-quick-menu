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
import { extractRollTotals, renderAttackTotals, describeShape, isOwnMessage, shouldBeTerse } from "../scripts/chat/RollTotals.js";

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

// --- never read out someone else's roll (Josh, 2026-10-07) ---

const ME = "user-me";

t("our own message, by the v12+ author field", () =>
  assert.equal(isOwnMessage({ author: { id: ME } }, ME), true));

t("another player's message is refused", () => {
  assert.equal(isOwnMessage({ author: { id: "user-josh" } }, ME), false);
  assert.equal(isOwnMessage({ user: { id: "user-josh" } }, ME), false);
  assert.equal(isOwnMessage({ user: "user-josh" }, ME), false);
});

t("the older user field is still understood", () => {
  assert.equal(isOwnMessage({ user: { id: ME } }, ME), true);
  assert.equal(isOwnMessage({ user: ME }, ME), true);
});

t("an author given as a bare id string works too", () =>
  assert.equal(isOwnMessage({ author: ME }, ME), true));

t("an unattributable card counts as ours", () => {
  // PF1 posts some cards without an author. Refusing these would silence the
  // common case to prevent a rare wrong one.
  assert.equal(isOwnMessage({}, ME), true);
  assert.equal(isOwnMessage({ author: null }, ME), true);
  assert.equal(isOwnMessage({ author: "" }, ME), true);
});

t("a malformed message is not ours", () => {
  for (const input of [null, undefined, "x", 7]) assert.equal(isOwnMessage(input, ME), false);
});

t("an author of an unexpected type is refused rather than assumed", () =>
  assert.equal(isOwnMessage({ author: { nope: true } }, ME), false));

// --- a full attack has more than one roll on the card ---
// Shape verified against 77 real cards in Iron Gods, 2026-10-08. 10 of them
// carried more than one attack; the rest one. Josh heard only the first.

const fullAttack = {
  rolls: [],
  flags: { pf1: { metadata: { rolls: { attacks: [
    { attack: { total: 30 }, damage: [{ total: 11 }] },
    { attack: { total: 20 }, damage: [{ total: 10 }] },
  ] } } } },
};

t("every attack on the card is read, not just the first", () => {
  const r = extractRollTotals(fullAttack);
  assert.equal(r.attacks.length, 2);
  assert.deepEqual(r.attacks, [{ attack: 30, damage: 11 }, { attack: 20, damage: 10 }]);
});

t("the first attack stays available for callers that want one number", () => {
  const r = extractRollTotals(fullAttack);
  assert.equal(r.attack, 30);
  assert.equal(r.damage, 11);
});

t("in combat, a full attack is just the numbers", () =>
  assert.equal(renderAttackTotals(extractRollTotals(fullAttack), { terse: true }),
    "30 to hit, 11 damage. 20 to hit, 10 damage."));

t("out of combat they are counted and labelled", () =>
  assert.equal(renderAttackTotals(extractRollTotals(fullAttack), { terse: false }),
    "2 attacks. First, 30 to hit, 11 damage. Second, 20 to hit, 10 damage."));

t("a single attack never gets the counting preamble", () => {
  const one = extractRollTotals({ rolls: [], flags: { pf1: { metadata: { rolls: { attacks: [{ attack: { total: 26 } }] } } } } });
  assert.equal(renderAttackTotals(one, { terse: false }), "26 to hit.");
  assert.equal(renderAttackTotals(one, { terse: true }), "26 to hit.");
});

t("a five-attack routine is still labelled in order", () => {
  const five = { rolls: [], flags: { pf1: { metadata: { rolls: { attacks:
    [5, 4, 3, 2, 1].map(n => ({ attack: { total: n * 6 } })) } } } } };
  const out = renderAttackTotals(extractRollTotals(five), { terse: false });
  assert.ok(out.startsWith("5 attacks. First, 30 to hit"), out);
  assert.ok(out.includes("Fifth, 6 to hit"), out);
});

t("an unreadable entry is skipped rather than breaking the rest", () => {
  const mixed = { rolls: [], flags: { pf1: { metadata: { rolls: { attacks: [
    { attack: { total: 30 } }, { nothing: true }, { attack: { total: 15 } },
  ] } } } } };
  assert.deepEqual(extractRollTotals(mixed).attacks.map(a => a.attack), [30, 15]);
});

// --- how long the answer should be ---

t("auto is short in combat and fuller outside it", () => {
  assert.equal(shouldBeTerse("auto", true), true);
  assert.equal(shouldBeTerse("auto", false), false);
});

t("the player can override either way", () => {
  assert.equal(shouldBeTerse("short", false), true);
  assert.equal(shouldBeTerse("full", true), false);
});

t("an unknown mode behaves as auto", () => {
  assert.equal(shouldBeTerse(undefined, true), true);
  assert.equal(shouldBeTerse("nonsense", false), false);
});

// --- PF1 v11 moved this; v12 removes the old path, and f4 already runs v12 ---

t("the modern system path is read", () => {
  const card = { rolls: [], system: { rolls: { attacks: [{ attack: { total: 30 }, damage: [{ total: 11 }] }] } } };
  const r = extractRollTotals(card);
  assert.equal(r.attack, 30);
  assert.equal(r.damage, 11);
  assert.equal(r.source, "system.rolls.attacks");
});

t("the deprecated flags path still works for older cards", () => {
  const card = { rolls: [], flags: { pf1: { metadata: { rolls: { attacks: [{ attack: { total: 22 } }] } } } } };
  const r = extractRollTotals(card);
  assert.equal(r.attack, 22);
  assert.equal(r.source, "flags.pf1.metadata.rolls.attacks");
});

t("when both exist the modern one wins, so the deprecated getter is not touched", () => {
  const card = {
    rolls: [],
    system: { rolls: { attacks: [{ attack: { total: 30 } }] } },
    get flags() { throw new Error("deprecated path must not be read"); },
  };
  assert.equal(extractRollTotals(card).attack, 30);
});

console.log(`\n${pass} assertions passed.`);
