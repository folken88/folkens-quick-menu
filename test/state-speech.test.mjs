/**
 * The spoken state reads. These exist because a blind player gets one pass at a
 * sentence - a wrong or missing number is not something they can glance back at.
 * Run: node test/state-speech.test.mjs
 */
import assert from "node:assert/strict";
import { renderAC, signed, noteText } from "../scripts/chat/StateSpeech.js";

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log("  ok -", name); };

const full = {
  normal: 21, touch: 13, flatFooted: 19,
  cmd: 18, cmdFlatFooted: 15, base: 10,
  sources: [{ name: "Armor", value: 7 }, { name: "Shield", value: 2 }, { name: "Dexterity", value: 2 }],
};

t("the numbers you need in combat come first", () => {
  const out = renderAC(full);
  assert.ok(out.startsWith("AC 21, touch 13, flat-footed 19. CMD 18, flat-footed 15."), out);
});

t("the breakdown states the base so the sum adds up", () => {
  const out = renderAC(full);
  assert.ok(out.includes("From base 10, Armor +7, Shield +2, Dexterity +2"), out);
  const sum = 10 + 7 + 2 + 2;
  assert.equal(sum, full.normal);
});

t("a negative bonus keeps its sign", () =>
  assert.ok(renderAC({ normal: 9, base: 10, sources: [{ name: "Size", value: -1 }] })
    .includes("Size -1")));

t("roll notes come last and name their source", () => {
  const out = renderAC(full, [{ text: "+2 vs evil outsiders", source: "Ring of Protection" }]);
  assert.ok(out.endsWith("Ring of Protection: +2 vs evil outsiders."), out);
});

t("a note with no source still reads", () =>
  assert.ok(renderAC(full, [{ text: "+1 dodge in difficult terrain" }])
    .includes("+1 dodge in difficult terrain")));

t("no breakdown available still reads the totals", () => {
  const out = renderAC({ normal: 15, touch: 12, flatFooted: 13, cmd: 14, cmdFlatFooted: 12, sources: [] });
  assert.equal(out, "AC 15, touch 12, flat-footed 13. CMD 14, flat-footed 12.");
});

t("a missing CMD is left out rather than read as null", () => {
  const out = renderAC({ normal: 15, touch: 12, flatFooted: 13, cmd: null, cmdFlatFooted: null, sources: [] });
  assert.equal(out, "AC 15, touch 12, flat-footed 13.");
  assert.equal(out.includes("null"), false);
});

t("an AC of 0 is read, not treated as missing", () =>
  assert.ok(renderAC({ normal: 0, sources: [] }).startsWith("AC 0")));

t("nothing at all says so instead of reading an empty sentence", () =>
  assert.equal(renderAC({}), "AC not available."));

t("a source with no name is dropped", () =>
  assert.equal(renderAC({ normal: 12, base: 10, sources: [{ name: "", value: 2 }] }),
    "AC 12."));

t("a set-to value passes through as PF1 worded it", () =>
  assert.equal(signed("Set to 24"), "Set to 24"));

t("signed handles zero as positive", () => assert.equal(signed(0), "+0"));

t("an empty note contributes nothing", () => assert.equal(noteText({ text: "   " }), ""));

console.log(`\n${pass} assertions passed.`);
