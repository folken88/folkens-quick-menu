/**
 * Feedback the player can hear: earcons, honest outcomes, uses left, slot
 * readouts, typed up-casts, and codes read letter by letter.
 *
 * Every case is from Josh's 0.14.0 report (2026-10-09) or the silent-failure
 * audit. Run: node test/feedback.test.mjs
 */
import assert from "node:assert/strict";
import { EARCONS, EARCON_GAIN, earconPlan } from "../scripts/tts/Earcons.js";
import { useOutcome, usesLeftLine, PF1_USE_REFUSALS } from "../scripts/executor/UseOutcome.js";
import { parseTypedUpcast, slotReportLine, parseSlotReportCommand } from "../scripts/spells/Upcast.js";
import { spellOut, generateAbbreviation } from "../scripts/chat/AbbreviationGenerator.js";
import { extractRollTotals, renderAttackTotals } from "../scripts/chat/RollTotals.js";
import { loneControl, isStopSpeechKey, STOP_GRACE_MS } from "../scripts/input/MenuKeys.js";

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log("  ok -", name); };

// --- the error sound is the Poker Dungeon's, exactly ---

t("error is two low pulses at 220 Hz, matching poker", () => {
  const tones = EARCONS.error;
  assert.equal(tones.length, 2);
  for (const tone of tones) { assert.equal(tone.from, 220); assert.equal(tone.dur, 0.10); }
  assert.equal(tones[1].at, 0.13);
});

t("ack is one high blip at 1200 Hz, matching poker", () =>
  assert.deepEqual(EARCONS.ack, [{ at: 0, dur: 0.08, from: 1200 }]));

t("close falls and open rises, matching poker", () => {
  assert.deepEqual(EARCONS.close, [{ at: 0, dur: 0.10, from: 900, to: 600 }]);
  assert.deepEqual(EARCONS.open, [{ at: 0, dur: 0.10, from: 600, to: 900 }]);
});

t("volume changes loudness, never pitch or rhythm", () => {
  const loud = earconPlan("error", 1), quiet = earconPlan("error", 0.6);
  assert.equal(loud[0].gain, EARCON_GAIN);
  assert.ok(Math.abs(quiet[0].gain - EARCON_GAIN * 0.6) < 1e-9);
  assert.equal(quiet[0].from, loud[0].from);
  assert.equal(quiet[1].at, loud[1].at);
});

t("an unknown earcon plays nothing rather than throwing", () =>
  assert.deepEqual(earconPlan("nonsense"), []));

t("a silly volume is clamped", () => {
  assert.equal(earconPlan("ack", 5)[0].gain, EARCON_GAIN);
  assert.equal(earconPlan("ack", -1)[0].gain, 0);
});

// --- PF1 refusals must never be reported as success ---

t("out of potions is a refusal, not 'sent to chat'", () =>
  assert.deepEqual(useOutcome(3), { ok: false, reason: "None left." }));

t("out of charges is a refusal", () =>
  assert.deepEqual(useOutcome(4), { ok: false, reason: "No charges." }));

t("both ammo codes say No ammo", () => {
  assert.equal(useOutcome(5).reason, "No ammo.");
  assert.equal(useOutcome(6).reason, "No ammo.");
});

t("every PF1 refusal code has words", () => {
  for (let code = 1; code <= 7; code++) assert.ok(PF1_USE_REFUSALS[code], `code ${code}`);
});

t("a hook cancelling the use is a refusal", () =>
  assert.equal(useOutcome(false).ok, false));

t("a chat message, an object or undefined all count as success", () => {
  assert.equal(useOutcome({ id: "msg" }).ok, true);
  assert.equal(useOutcome(undefined).ok, true);
  assert.equal(useOutcome(null).ok, true);
});

t("an unknown number is not mistaken for a refusal", () =>
  assert.equal(useOutcome(99).ok, true));

// --- uses left after a use (Josh: "2 of 3 left") ---

t("a 3-per-day rod after one use", () =>
  assert.equal(usesLeftLine({ system: { uses: { per: "day", value: 2, max: 3 } } }), "2 of 3 left."));

t("a wand counts its charges", () =>
  assert.equal(usesLeftLine({ system: { uses: { per: "charges", value: 37, max: 50 } } }), "37 of 50 left."));

t("a potion counts its quantity", () =>
  assert.equal(usesLeftLine({ isSingleUse: true, system: { quantity: 2, uses: { per: "single" } } }), "2 left."));

t("a passive item has nothing to count", () =>
  assert.equal(usesLeftLine({ system: { uses: { max: 1 } } }), ""));

t("no item at all is not an error", () =>
  assert.equal(usesLeftLine(undefined), ""));

// --- spell slots readout (/sr0 to /sr9) ---

t("a spontaneous level with slots left", () =>
  assert.equal(slotReportLine({ level: 7, spontaneous: true, left: 3, total: 5 }), "3 of 5 7th-level spells left."));

t("a level he has no slots in at all", () =>
  assert.equal(slotReportLine({ level: 8, spontaneous: true, left: 0, total: 0 }), "No 8th-level spells."));

t("used up but still a known level", () =>
  assert.equal(slotReportLine({ level: 6, spontaneous: true, left: 0, total: 7 }), "0 of 7 6th-level spells left."));

t("cantrips", () =>
  assert.equal(slotReportLine({ level: 0 }), "Cantrips are at will."));

t("a prepared caster counts what is still prepared", () =>
  assert.equal(slotReportLine({ level: 3, spontaneous: false, left: 2, total: 4 }), "2 of 4 3rd-level prepared left."));

t("a prepared caster with nothing at that level", () =>
  assert.equal(slotReportLine({ level: 4, spontaneous: false, left: 0, total: 0 }), "No 4th-level spells prepared."));

t("/sr0 to /sr9 parse, and nothing else does", () => {
  assert.equal(parseSlotReportCommand("sr7"), 7);
  assert.equal(parseSlotReportCommand("SR0"), 0);
  for (const bad of ["sr", "sr10", "srx", "6sr", "per"]) assert.equal(parseSlotReportCommand(bad), null, bad);
});

// --- typed up-cast (/6cl7) ---

t("/6cl7 is Chain Lightning from a 7th-level slot", () =>
  assert.deepEqual(parseTypedUpcast("6cl7"), { base: "6cl", slot: 7 }));

t("a longer spell code still splits off the slot", () =>
  assert.deepEqual(parseTypedUpcast("3hast5"), { base: "3hast", slot: 5 }));

t("commands that merely end in a digit are not typed up-casts", () => {
  // clc2 and conc2 are real commands; they do not start with a spell level.
  for (const code of ["clc2", "conc2", "6cl", "per", "sr7", "67"]) {
    assert.equal(parseTypedUpcast(code), null, code);
  }
});

// --- codes read letter by letter (Josh: "2 m i" became "2 meters") ---

t("spelled-out codes use commas so the voice cannot read units", () => {
  assert.equal(spellOut("2mi"), "2, m, i");
  assert.equal(spellOut("3h"), "3, h");
});

t("no item can ever be handed /sr0 to /sr9", () => {
  // "Sr7" as an item name would otherwise abbreviate to the slots readout.
  for (let n = 0; n <= 9; n++) assert.notEqual(generateAbbreviation(`Sr${n}`), `sr${n}`);
});

// --- damage-only spells (Fireball, Lightning Bolt) ---

t("a damage-only card reads its damage instead of nothing", () => {
  const card = { rolls: [], system: { rolls: { attacks: [{ attack: null, damage: [{ total: 31 }] }] } } };
  assert.equal(renderAttackTotals(extractRollTotals(card)), "31 damage.");
});

t("a card with neither attack nor damage stays quiet", () => {
  const card = { rolls: [], system: { rolls: { attacks: [{ attack: null, damage: [] }] } } };
  assert.equal(renderAttackTotals(extractRollTotals(card)), "");
});

t("attacks still read as before", () => {
  const card = { rolls: [], system: { rolls: { attacks: [{ attack: { total: 30 }, damage: [{ total: 11 }] }] } } };
  assert.equal(renderAttackTotals(extractRollTotals(card)), "30 to hit, 11 damage.");
});

// --- stopping the voice ---

const down = (key, extra = {}) => ({ type: "keydown", key, code: key === "Control" ? "ControlLeft" : `Key${key.toUpperCase()}`, ...extra });
const up = (key) => ({ type: "keyup", key, code: key === "Control" ? "ControlLeft" : `Key${key.toUpperCase()}` });

t("Control pressed and released alone stops the voice", () => {
  let s = loneControl(undefined, down("Control"));
  s = loneControl(s, up("Control"));
  assert.equal(s.stop, true);
});

t("Ctrl+V does not stop the voice", () => {
  let s = loneControl(undefined, down("Control"));
  s = loneControl(s, down("v", { ctrlKey: true }));
  s = loneControl(s, up("Control"));
  assert.equal(s.stop, false);
});

t("holding Control (auto-repeat) still counts as alone", () => {
  let s = loneControl(undefined, down("Control"));
  s = loneControl(s, down("Control", { repeat: true }));
  s = loneControl(s, up("Control"));
  assert.equal(s.stop, true);
});

t("Shift+Control is not a lone Control", () => {
  let s = loneControl(undefined, down("Control", { shiftKey: true }));
  s = loneControl(s, up("Control"));
  assert.equal(s.stop, false);
});

t("S stops the voice only while it is talking", () => {
  const s = { code: "KeyS" };
  assert.equal(isStopSpeechKey(s, { speaking: true }), true);
  assert.equal(isStopSpeechKey(s, { speaking: false, msSinceSpeech: 60000 }), false);
});

t("S just after the voice stops is still caught, so it cannot move a token", () =>
  assert.equal(isStopSpeechKey({ code: "KeyS" }, { speaking: false, msSinceSpeech: STOP_GRACE_MS - 1 }), true));

t("S while typing is a letter", () =>
  assert.equal(isStopSpeechKey({ code: "KeyS" }, { speaking: true, typing: true }), false));

t("Ctrl+S and other keys are not the stop key", () => {
  assert.equal(isStopSpeechKey({ code: "KeyS", ctrlKey: true }, { speaking: true }), false);
  assert.equal(isStopSpeechKey({ code: "KeyD" }, { speaking: true }), false);
});

console.log(`\n${pass} assertions passed.`);
