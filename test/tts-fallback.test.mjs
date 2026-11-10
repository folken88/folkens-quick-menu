/**
 * The real TTSManager's no-result fallback (10.16): a card with nothing to
 * roll says the item's name, or "Done.", and never "Card posted."
 *
 * The constructor needs a browser voice, so the manager is made without it
 * (Object.create on the prototype) and speak() is captured.
 * Run: node test/tts-fallback.test.mjs
 */
import assert from "node:assert/strict";

const settings = { enableTTS: true, verbosity: "auto", debugMode: false };
globalThis.window = globalThis;
globalThis.Hooks = { once() {}, on() { return 1; }, off() {} };
globalThis.game = {
  user: { id: "me" },
  combat: null,
  settings: { get: (_module, key) => settings[key] },
};

const { TTSManager } = await import("../scripts/tts/TTSManager.js");

const spoken = [];
const tts = Object.create(TTSManager.prototype);
tts.speak = (text) => spoken.push(text);

let pass = 0;
const t = (name, fn) => { spoken.length = 0; fn(); pass++; console.log("  ok -", name); };

const noRolls = () => ({ rolls: [], content: "" });

t("a card with nothing to roll says the item's name", () => {
  tts.announceAttackResult(noRolls(), { quietIfNone: true, item: { name: "Haste", system: {} } });
  assert.deepEqual(spoken, ["Haste."]);
});

t("with no item it says Done", () => {
  tts.announceAttackResult(noRolls(), { quietIfNone: true });
  assert.deepEqual(spoken, ["Done."]);
});

t("rolled notes follow the name", () => {
  const content = '<span class="tag"><a class="inline-roll">Caster Level Check 14</a></span>';
  tts.announceAttackResult({ rolls: [], content }, { quietIfNone: true, item: { name: "Haste", system: {} } });
  assert.equal(spoken.length, 1);
  assert.match(spoken[0], /^Haste\. .*Caster Level Check 14.*\.$/);
});

t("no fallback line ever says Card posted", () => {
  const all = [];
  for (const opts of [{ quietIfNone: true, item: { name: "Haste", system: {} } }, { quietIfNone: true }, { quietIfNone: true, healing: true }]) {
    spoken.length = 0;
    tts.announceAttackResult(noRolls(), opts);
    all.push(...spoken);
  }
  assert.equal(all.length, 3);
  for (const line of all) assert.doesNotMatch(line, /Card posted/);
});

t("resultLine speaks nothing and is empty with no rolls", () => {
  assert.equal(tts.resultLine(noRolls()), "");
  assert.deepEqual(spoken, []);
});

console.log(`\n${pass} assertions passed.`);
