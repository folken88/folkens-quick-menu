/**
 * Report + export tests. Fixture mirrors real shapes measured on Olbryn
 * (Sorcerer 15, f1/Iron Gods). Run: node test/report.test.mjs
 */
import assert from "node:assert/strict";
import { summary, spellsByLevel, consumables, search, money } from "../scripts/agent/Report.js";
import { renderCharacter, renderInventory } from "../scripts/agent/TextRender.js";

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log("  ok -", name); };

const snap = {
  id: "a1", name: "Olbryn",
  classes: [{ name: "Sorcerer", level: 15 }],
  hp: { value: 195, max: 195, temp: null },
  ac: { normal: 36, touch: 22, flatFooted: 28 },
  saves: { fort: 18, ref: 20, will: 19 },
  abilities: { str: { total: 10, mod: 0 }, cha: { total: 26, mod: 8 } },
  buffs: [{ name: "Haste", active: true }, { name: "Stoneskin", active: false }],
  spells: [
    { name: "Haste", level: 3, prepared: 1 },
    { name: "Slow", level: 3, prepared: 0 },
    { name: "Magic Missile", level: 1, prepared: 2 },
  ],
  consumables: [
    { name: "Wand of Cure Light Wounds", qty: 1, charges: 34 },
    { name: "Empty Flask", qty: 0, charges: null },
  ],
  items: [
    { name: "Wand of Cure Light Wounds", type: "consumable", qty: 1, equipped: null, description: "cures wounds" },
    { name: "Chain Shirt", type: "equipment", qty: 1, equipped: true, description: "armor" },
    { name: "Scroll of Fog Cloud", type: "consumable", qty: 1, equipped: null, description: "obscures vision" },
    { name: "Power Attack", type: "feat", qty: 1, equipped: null, description: "a feat" },
    { name: "Haste", type: "spell", qty: 1, equipped: null, description: "a spell" },
  ],
  money: { carried: { gp: 0, cp: 0 }, weightless: { gp: 12, cp: 7654 } },
};

t("summary carries identity and defences", () => {
  const r = summary(snap);
  assert.equal(r.name, "Olbryn");
  assert.equal(r.classes, "Sorcerer 15");
  assert.equal(r.hp, "195/195");
  assert.deepEqual(r.ac, { normal: 36, touch: 22, flatFooted: 28 });
});

t("summary lists only active buffs", () =>
  assert.deepEqual(summary(snap).activeBuffs, ["Haste"]));

t("abilities render with a signed modifier", () =>
  assert.equal(summary(snap).abilities.cha, "26 (+8)"));

t("negative modifiers keep their sign", () => {
  const s2 = { ...snap, abilities: { str: { total: 7, mod: -2 } } };
  assert.equal(summary(s2).abilities.str, "7 (-2)");
});

t("temp hp is surfaced when present", () => {
  const s2 = { ...snap, hp: { value: 195, max: 195, temp: 12 } };
  assert.equal(summary(s2).hp, "195/195 (+12 temp)");
});

t("spells group by level with counts", () => {
  const r = spellsByLevel(snap);
  assert.equal(r[3].known, 2);
  assert.equal(r[3].prepared, 1);
  assert.deepEqual(r[1].names, ["Magic Missile"]);
});

t("consumables hide zero-quantity entries", () =>
  assert.deepEqual(consumables(snap).map(c => c.name), ["Wand of Cure Light Wounds"]));

t("search matches name or description", () =>
  assert.deepEqual(search(snap, "cure").map(i => i.name), ["Wand of Cure Light Wounds"]));

t("search does not match mid-word - cure must not hit obscures", () =>
  assert.equal(search(snap, "cure").some(i => i.name === "Scroll of Fog Cloud"), false));

t("search ranks name matches above description matches", () => {
  const r = search(snap, "wand");
  assert.equal(r[0].name, "Wand of Cure Light Wounds");
});

t("search tolerates regex characters in the query", () =>
  assert.doesNotThrow(() => search(snap, "cure (light)")));

t("search is case-insensitive", () =>
  assert.equal(search(snap, "CHAIN").length, 1));

t("search returns empty rather than throwing", () =>
  assert.deepEqual(search(snap, "zzzz"), []));

t("money reports both pools and flags the non-empty one", () => {
  const m = money(snap);
  assert.equal(m.weightless.cp, 7654);
  assert.equal(m.note.includes("weightless"), true);
});

t("export is plain text with one fact per line", () => {
  const txt = renderCharacter(snap);
  assert.equal(txt.includes("<"), false);
  assert.equal(txt.includes("|"), false);
  assert.match(txt, /^Olbryn$/m);
  assert.match(txt, /^HP: 195\/195$/m);
  assert.match(txt, /^AC: 36 normal, 22 touch, 28 flat-footed$/m);
});

t("export lists active buffs and omits inactive ones", () => {
  const txt = renderCharacter(snap);
  assert.match(txt, /^Active buffs: Haste$/m);
  assert.equal(/Stoneskin/.test(txt), false);
});

t("export names the pool the money is actually in", () =>
  assert.match(renderCharacter(snap), /weightless cp: 7654/));

t("export is stable across calls", () =>
  assert.equal(renderCharacter(snap), renderCharacter(snap)));

t("inventory export groups by type and marks equipped", () => {
  const txt = renderInventory(snap);
  assert.match(txt, /^equipment:$/m);
  assert.match(txt, /Chain Shirt \(equipped\)/);
});

t("inventory is gear only - no feats, spells, buffs or classes", () => {
  const txt = renderInventory(snap);
  assert.equal(/Power Attack/.test(txt), false);
  assert.equal(/^spell:$/m.test(txt), false);
  assert.match(txt, /Wand of Cure Light Wounds/);
});

console.log(`\n${pass} assertions passed.`);
