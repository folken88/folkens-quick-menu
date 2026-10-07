/**
 * The spoken reads. Every case here came from Josh's field reports - he gets one
 * pass at a sentence, so a wrong number or a stray fragment of markup is not
 * something he can glance back over.
 * Run: node test/state-speech.test.mjs
 */
import assert from "node:assert/strict";
import { renderAC, renderCMD, renderACBreakdown, renderNotes, signed, noteText, stripMarkup, sentence }
  from "../scripts/chat/StateSpeech.js";

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log("  ok -", name); };

// --- /ac answers one question (Josh, 2026-10-05) ---

t("/ac is AC, touch and flat-footed, and stops", () =>
  assert.equal(renderAC({ normal: 36, touch: 22, flatFooted: 28 }),
    "AC 36, touch 22, flat-footed 28."));

t("/ac never mentions the base", () =>
  assert.equal(renderAC({ normal: 36, touch: 22, flatFooted: 28, base: 10 }).includes("base"), false));

t("/ac never reads CMD - that sounded like part of AC", () => {
  const out = renderAC({ normal: 36, touch: 22, flatFooted: 28, cmd: { total: 35, flatFooted: 27 } });
  assert.equal(out.includes("CMD"), false);
  assert.equal(out, "AC 36, touch 22, flat-footed 28.");
});

t("/ac never reads the breakdown", () =>
  assert.equal(renderAC({ normal: 36, sources: [{ name: "Armor", value: 7 }] }), "AC 36."));

t("an AC of 0 is read, not treated as missing", () =>
  assert.equal(renderAC({ normal: 0 }), "AC 0."));

t("nothing available says so", () => assert.equal(renderAC({}), "AC not available."));

// --- /cmd stands alone ---

t("/cmd is CMD and flat-footed CMD", () =>
  assert.equal(renderCMD({ total: 35, flatFooted: 27 }), "CMD 35, flat-footed 27."));

t("a missing flat-footed CMD is left out, not read as null", () => {
  const out = renderCMD({ total: 35, flatFooted: null });
  assert.equal(out, "CMD 35.");
  assert.equal(out.includes("null"), false);
});

t("no CMD at all says so", () => assert.equal(renderCMD({}), "CMD not available."));

// --- the breakdown: for the agent API, not the voice ---

t("the breakdown carries no base of its own - PF1 already supplies one", () => {
  // 0.8.0 added a second base and his figures summed to 42 against an AC of 36.
  const sources = [{ name: "Base", value: 10, applies: true }, { name: "Armor", value: 7, applies: true }];
  const out = renderACBreakdown({ sources });
  assert.equal(out, "Base +10, Armor +7.");
  assert.equal((out.match(/Base/g) || []).length, 1);
});

t("an overridden bonus is reported, not dropped", () => {
  // Dropping these silently lost the Shield spell +4, which was counting.
  const out = renderACBreakdown({ sources: [
    { name: "Shield", value: 4, applies: true },
    { name: "Haste", value: 1, applies: false },
  ]});
  assert.ok(out.includes("Shield +4"), out);
  assert.ok(out.includes("Haste +1 (overridden)"), out);
});

t("a negative bonus keeps its sign", () =>
  assert.ok(renderACBreakdown({ sources: [{ name: "Size", value: -1, applies: true }] })
    .includes("Size -1")));

t("no sources says so rather than reading an empty list", () =>
  assert.equal(renderACBreakdown({ sources: [] }), "No breakdown available."));

// --- markup must never reach the voice ---

t("a content link is reduced to its label", () =>
  assert.equal(stripMarkup('Resist <a class="content-link" data-uuid="Item.x"><i class="fas fa-suitcase"></i>Resist Energy</a> 10'),
    "Resist Resist Energy 10"));

t("an unenriched UUID reference with a label keeps the label", () =>
  assert.equal(stripMarkup("See @UUID[Item.abc123]{Stoneskin} for details"),
    "See Stoneskin for details"));

t("a reference with no label is dropped rather than spelled out", () =>
  assert.equal(stripMarkup("See @UUID[Item.abc123] now"), "See now"));

t("entities are spoken as characters", () =>
  assert.equal(stripMarkup("DR 10/adamantine &amp; cold iron"), "DR 10/adamantine & cold iron"));

t("line breaks become spaces, not run-together words", () =>
  assert.equal(stripMarkup("first<br>second"), "first second"));

t("plain text is untouched", () =>
  assert.equal(stripMarkup("+2 vs evil outsiders"), "+2 vs evil outsiders"));

// --- punctuation ---

t("a note already ending in a period does not get a second one", () =>
  assert.equal(sentence("Stoneskin: DR 10/adamantine."), "Stoneskin: DR 10/adamantine."));

t("a note without one gets it", () =>
  assert.equal(sentence("DR 10/adamantine"), "DR 10/adamantine."));

t("a note names its source", () =>
  assert.equal(noteText({ text: "+2 vs evil outsiders", source: "Ring of Protection" }),
    "Ring of Protection: +2 vs evil outsiders"));

t("a note with no source still reads", () =>
  assert.equal(noteText({ text: "+1 dodge" }), "+1 dodge"));

t("an empty note contributes nothing", () => assert.equal(noteText({ text: "   " }), ""));

t("several notes read as clean separate sentences", () =>
  assert.equal(renderNotes([
    { text: "DR 10/adamantine.", source: "Stoneskin" },
    { text: "+2 vs evil outsiders", source: "Ring of Protection" },
  ]), "Stoneskin: DR 10/adamantine. Ring of Protection: +2 vs evil outsiders."));

t("signed handles zero as positive", () => assert.equal(signed(0), "+0"));

t("a set-to value passes through as PF1 worded it", () =>
  assert.equal(signed("Set to 24"), "Set to 24"));

console.log(`\n${pass} assertions passed.`);
