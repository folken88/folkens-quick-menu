/**
 * Which voice reads the menu.
 *
 * Josh, 2026-10-08: the module spoke as "Google UK English Female" and he could
 * not make out "Climb" in the Skills list - it arrived as "ply". He switched to
 * Samantha by hand and the skill names were clear.
 *
 * Run: node test/voice-choice.test.mjs
 */
import assert from "node:assert/strict";
import { pickVoice, voiceChoices } from "../scripts/tts/VoiceChoice.js";

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log("  ok -", name); };

// His actual list, near enough.
const voices = [
  { name: "Google UK English Female", lang: "en-GB", localService: false },
  { name: "Google US English", lang: "en-US", localService: false },
  { name: "Samantha", lang: "en-US", localService: true },
  { name: "Daniel", lang: "en-GB", localService: true },
  { name: "Amelie", lang: "fr-CA", localService: true },
];

t("a local voice beats the online one that caused the mishearing", () => {
  const v = pickVoice(voices, "");
  assert.equal(v.name, "Samantha");
  assert.notEqual(v.name, "Google UK English Female");
});

t("the old rule - first English voice with female in the name - is gone", () => {
  // That rule is exactly what selected Google UK English Female.
  assert.notEqual(pickVoice(voices).name, "Google UK English Female");
});

t("an explicit choice is honoured", () =>
  assert.equal(pickVoice(voices, "Daniel").name, "Daniel"));

t("the choice is matched regardless of capitals", () =>
  assert.equal(pickVoice(voices, "samantha").name, "Samantha"));

t("a voice that is no longer installed falls back instead of going silent", () =>
  assert.equal(pickVoice(voices, "Karen").name, "Samantha"));

t("whitespace around a chosen name does not break it", () =>
  assert.equal(pickVoice(voices, "  Daniel  ").name, "Daniel"));

t("with only online voices, one of those is used rather than none", () => {
  const online = voices.filter(v => v.localService === false);
  assert.equal(pickVoice(online, "").name, "Google UK English Female");
});

t("with no English voice at all, something still speaks", () =>
  assert.equal(pickVoice([{ name: "Amelie", lang: "fr-CA", localService: true }], "").name, "Amelie"));

t("an unknown localService is treated as local", () => {
  const list = [{ name: "Remote", lang: "en-US", localService: false }, { name: "Unknown", lang: "en-US" }];
  assert.equal(pickVoice(list, "").name, "Unknown");
});

t("no voices yet is not an error", () => {
  assert.equal(pickVoice([], ""), null);
  assert.equal(pickVoice(undefined, ""), null);
  assert.equal(pickVoice(null), null);
});

t("a list with holes in it does not throw", () =>
  assert.equal(pickVoice([null, undefined, { name: "Samantha", lang: "en-US", localService: true }], "").name, "Samantha"));

// --- the settings dropdown ---

t("the dropdown offers automatic first, then English voices", () => {
  const c = voiceChoices(voices);
  const keys = Object.keys(c);
  assert.equal(keys[0], "");
  assert.ok(c[""].toLowerCase().includes("automatic"));
  assert.ok(keys.indexOf("Samantha") < keys.indexOf("Amelie"), "English should come before French");
});

t("each entry says where the voice lives, since that is what affects clarity", () => {
  const c = voiceChoices(voices);
  assert.ok(c["Samantha"].includes("on this computer"), c["Samantha"]);
  assert.ok(c["Google UK English Female"].includes("online"), c["Google UK English Female"]);
});

t("an empty voice list still offers automatic", () =>
  assert.deepEqual(Object.keys(voiceChoices([])), [""]));

console.log(`\n${pass} assertions passed.`);
