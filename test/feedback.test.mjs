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
import { loneControl, isStopSpeechKey, STOP_GRACE_MS, loneModifier, isChosenStopKey } from "../scripts/input/MenuKeys.js";
import { hasRollingAction, isUsefulFeature } from "../scripts/character/ItemUse.js";
import { LAST_ONE } from "../scripts/executor/UseOutcome.js";
import { bookSlotLine } from "../scripts/spells/Upcast.js";
import { renderPools, poolCommandsFor, poolReadLine, isPoolName } from "../scripts/chat/StateSpeech.js";

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

t("PF1 11.11's wrapped refusal { err, code } is a refusal (live shape, f1)", () => {
  assert.deepEqual(useOutcome({ err: new Error("x"), code: 3 }), { ok: false, reason: "None left." });
  assert.equal(useOutcome({ err: {}, code: 4 }).reason, "No charges.");
});

t("f4's PF1 v14 refusal { error, get code() } is a refusal (read from f4's pf1.mjs)", () => {
  const refusal = { error: 3, get code() { return this.error; } };
  assert.deepEqual(useOutcome(refusal), { ok: false, reason: "None left." });
  assert.equal(useOutcome({ error: 6, get code() { return this.error; } }).reason, "No ammo.");
  assert.equal(useOutcome({ error: 4 }).reason, "No charges.");
});

t("an object with a code but no err is not mistaken for a refusal", () =>
  assert.equal(useOutcome({ code: 3, id: "msg" }).ok, true));

t("a stack of single-use items counts quantity, not PF1's default 1 per single (live, f1)", () =>
  assert.equal(usesLeftLine({ isSingleUse: true, system: { quantity: 143, uses: { per: "single", max: 1, value: null } } }), "143 left."));

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

// --- 0.16.0: Ser's sheet, raw data exactly as stored in Shackles on f1 ---

const sneakAttack = { type: "feat", system: { subType: "classFeat", uses: { value: 0, per: "" },
  actions: [{ name: "Use", actionType: "other", damage: { parts: [{ types: ["precision"], formula: "(ceil(@class.level / 2))d6" }] }, activation: { type: "free" } }] } };
const lightSteps = { type: "feat", system: { subType: "classFeat", uses: { value: null, per: "" },
  actions: [{ name: "Use", actionType: "other", activation: { type: "full" } }] } };
const kiPool = { type: "feat", system: { subType: "classFeat", uses: { value: 8, per: "day" },
  actions: [{ name: "Use", actionType: "other", activation: { type: "special" } }] } };

t("Sneak Attack, an action that rolls damage, gets a command (Josh, 2026-10-15)", () =>
  assert.equal(isUsefulFeature(sneakAttack), true));

t("Light Steps, an action that rolls nothing and has no uses, does not", () =>
  assert.equal(isUsefulFeature(lightSteps), false));

t("Ki Pool, daily uses, gets a command", () =>
  assert.equal(isUsefulFeature(kiPool), true));

t("a feature drawing on a pool through a charge link counts as charged", () =>
  assert.equal(isUsefulFeature({ isCharged: true, system: { actions: [{ actionType: "other" }] } }), true));

t("a passive feature with no actions gets no command", () =>
  assert.equal(isUsefulFeature({ isCharged: false, system: { actions: [] } }), false));

t("PF1's live action getters are read when present", () => {
  assert.equal(hasRollingAction({ actions: { contents: [{ hasAttack: false, hasDamage: true }] } }), true);
  assert.equal(hasRollingAction({ actions: { contents: [{ hasAttack: false, hasDamage: false, hasSave: false, actionType: "other" }] } }), false);
});

t("attacks and saves count as rolling; an empty damage formula does not", () => {
  assert.equal(hasRollingAction({ system: { actions: [{ actionType: "mwak" }] } }), true);
  assert.equal(hasRollingAction({ system: { actions: [{ actionType: "other", save: { type: "fort" } }] } }), true);
  assert.equal(hasRollingAction({ system: { actions: [{ actionType: "other", damage: { parts: [{ formula: "  " }] } }] } }), false);
});

t("running out says so in words, for daily uses and charges too", () => {
  assert.equal(usesLeftLine({ system: { uses: { per: "day", value: 0, max: 3 } } }), LAST_ONE);
  assert.equal(usesLeftLine({ system: { uses: { per: "charges", value: 0, max: 50 } } }), LAST_ONE);
  assert.equal(usesLeftLine({ isSingleUse: true, system: { quantity: 0, uses: { per: "single" } } }), LAST_ONE);
});

t("healing is read as healing, not damage (Josh: cure potions said '14 damage')", () => {
  const card = { rolls: [], system: { rolls: { attacks: [{ attack: null, damage: [{ total: 14 }] }] } } };
  assert.equal(renderAttackTotals(extractRollTotals(card), { healing: true }), "14 healing.");
  assert.equal(renderAttackTotals(extractRollTotals(card)), "14 damage.");
});

t("/pool reads one pool the way Josh asked", () =>
  assert.equal(renderPools([{ name: "Ki Pool", value: 7, max: 8 }]), "Ki Pool, 7 of 8 left."));

t("/pool with more than one gives the count first, like /bf", () =>
  assert.equal(renderPools([{ name: "Ki Pool", value: 7, max: 8 }, { name: "Grit", value: 2, max: 3 }]),
    "2 pools. Ki Pool, 7 of 8 left. Grit, 2 of 3 left."));

t("/pool with none, or only empty ones, says No pools.", () => {
  assert.equal(renderPools([]), "No pools.");
  assert.equal(renderPools([{ name: "Weapon Finesse", value: 0, max: 0 }]), "No pools.");
});

t("/sr on the spell-likes book says uses, not prepared", () =>
  assert.equal(bookSlotLine({ label: "Spell-likes", spellLike: true, level: 1, left: 2, total: 2 }), "Spell-likes: 2 of 2 1st-level uses left."));

t("/sr on the spell-likes book with nothing at that level", () =>
  assert.equal(bookSlotLine({ label: "Spell-likes", spellLike: true, level: 3, left: 0, total: 0 }), "Spell-likes, none."));

t("/sr keeps the book name when there are several books", () => {
  assert.equal(bookSlotLine({ label: "Sorcerer", showLabel: true, level: 7, spontaneous: true, left: 5, total: 5 }), "Sorcerer: 5 of 5 7th-level spells left.");
  assert.equal(bookSlotLine({ label: "Sorcerer", showLabel: false, level: 7, spontaneous: true, left: 5, total: 5 }), "5 of 5 7th-level spells left.");
});

t("any modifier alone can be the stop key (Josh: Control is also VoiceOver's)", () => {
  let s = loneModifier(undefined, { type: "keydown", key: "Alt", code: "AltLeft" }, "Alt");
  s = loneModifier(s, { type: "keyup", key: "Alt", code: "AltLeft" }, "Alt");
  assert.equal(s.stop, true);
  let c = loneModifier(undefined, { type: "keydown", key: "Control", code: "ControlLeft" }, "Alt");
  c = loneModifier(c, { type: "keyup", key: "Control", code: "ControlLeft" }, "Alt");
  assert.equal(c.stop, false);
});

t("Option+Tab-style chords do not count as a lone Option", () => {
  let s = loneModifier(undefined, { type: "keydown", key: "Alt", code: "AltLeft" }, "Alt");
  s = loneModifier(s, { type: "keydown", key: "Tab", code: "Tab", altKey: true }, "Alt");
  s = loneModifier(s, { type: "keyup", key: "Alt", code: "AltLeft" }, "Alt");
  assert.equal(s.stop, false);
});

t("a non-modifier stop key fires on its own keydown, unmodified only", () => {
  assert.equal(isChosenStopKey({ code: "F8" }, "F8"), true);
  assert.equal(isChosenStopKey({ code: "F8", shiftKey: true }, "F8"), false);
  assert.equal(isChosenStopKey({ code: "F8" }, "Control"), false);
});

// --- 0.16.0: one read command per pool (Josh's correction, 2026-10-15) ---

t("Ser's Ki Pool becomes /ki, and says only her ki", () => {
  const [ki] = poolCommandsFor([{ id: "k", name: "Ki Pool", max: 8 }]);
  assert.equal(ki.command, "ki");
  assert.equal(poolReadLine(ki.noun, 7, 8), "7 of 8 ki left.");
});

t("Sparkbang's Grit becomes /grit", () =>
  assert.equal(poolCommandsFor([{ id: "g", name: "Grit", max: 3 }])[0].command, "grit"));

t("an arcane pool becomes /arcane", () =>
  assert.equal(poolCommandsFor([{ id: "a", name: "Arcane Pool", max: 6 }])[0].command, "arcane"));

t("a second pool of the same kind gets a 2, like /clc2", () =>
  assert.deepEqual(poolCommandsFor([{ id: "a", name: "Ki Pool", max: 8 }, { id: "b", name: "Ki Pool (Monk)", max: 4 }]).map(p => p.command), ["ki", "ki2"]));

t("ordinary daily uses are not pools - no /stunning", () => {
  assert.equal(isPoolName("Stunning Fist"), false);
  assert.equal(poolCommandsFor([{ id: "s", name: "Stunning Fist", max: 9 }]).length, 0);
});

t("a pool with no maximum gets no command", () =>
  assert.equal(poolCommandsFor([{ id: "k", name: "Ki Pool", max: 0 }]).length, 0));

t("an empty pool still answers", () =>
  assert.equal(poolReadLine("ki", 0, 8), "0 of 8 ki left."));

t("Ctrl+S and other keys are not the stop key", () => {
  assert.equal(isStopSpeechKey({ code: "KeyS", ctrlKey: true }, { speaking: true }), false);
  assert.equal(isStopSpeechKey({ code: "KeyD" }, { speaking: true }), false);
});

console.log(`\n${pass} assertions passed.`);
