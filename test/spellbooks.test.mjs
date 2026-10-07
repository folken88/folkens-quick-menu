/**
 * Which spellbooks earn their own commands.
 * Run: node test/spellbooks.test.mjs
 */
import assert from "node:assert/strict";
import { distinctSpellbooks } from "../scripts/character/Spellbooks.js";

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log("  ok -", name); };

// Olbryn: a class book and a drow spell-like book, both CL 15 / concentration 23.
const olbryn = {
  primary: { inUse: true, label: "Arcane", cl: { total: 15 }, concentration: { total: 23 } },
  spelllike: { inUse: true, label: "Spell-like", cl: { total: 15 }, concentration: { total: 23 } },
};

t("two books with identical numbers get one pair of commands", () => {
  const out = distinctSpellbooks(olbryn);
  assert.equal(out.length, 1);
  assert.equal(out[0].suffix, "");
  assert.equal(out[0].key, "primary");
});

t("the surviving book is the first one, so clc and conc do not move", () =>
  assert.equal(distinctSpellbooks(olbryn)[0].label, "Arcane"));

t("a book whose caster level differs earns its own pair", () => {
  const out = distinctSpellbooks({
    primary: { inUse: true, label: "Arcane", cl: { total: 15 }, concentration: { total: 23 } },
    second: { inUse: true, label: "Divine", cl: { total: 9 }, concentration: { total: 14 } },
  });
  assert.equal(out.length, 2);
  assert.equal(out[1].suffix, "2");
  assert.equal(out[1].named, " (Divine)");
});

t("the same caster level but different concentration still counts as different", () => {
  const out = distinctSpellbooks({
    a: { inUse: true, cl: { total: 15 }, concentration: { total: 23 } },
    b: { inUse: true, cl: { total: 15 }, concentration: { total: 19 } },
  });
  assert.equal(out.length, 2);
});

t("books not in use are ignored", () => {
  const out = distinctSpellbooks({
    primary: { inUse: true, cl: { total: 15 }, concentration: { total: 23 } },
    unused: { inUse: false, cl: { total: 1 }, concentration: { total: 0 } },
  });
  assert.equal(out.length, 1);
});

t("a book with no caster level falls back to the character level", () =>
  assert.equal(distinctSpellbooks({ p: { inUse: true } }, 11)[0].cl, 11));

t("a book with no label is named by its key", () =>
  assert.equal(distinctSpellbooks({ primary: { inUse: true, cl: { total: 3 } } })[0].label, "primary"));

t("no spellbooks at all is not an error", () => {
  assert.deepEqual(distinctSpellbooks({}), []);
  assert.deepEqual(distinctSpellbooks(undefined), []);
});

t("three books collapsing to two keeps suffixes contiguous", () => {
  const out = distinctSpellbooks({
    a: { inUse: true, label: "A", cl: { total: 15 }, concentration: { total: 23 } },
    b: { inUse: true, label: "B", cl: { total: 15 }, concentration: { total: 23 } },
    c: { inUse: true, label: "C", cl: { total: 7 }, concentration: { total: 11 } },
  });
  assert.deepEqual(out.map(b => b.suffix), ["", "2"]);
  assert.deepEqual(out.map(b => b.label), ["A", "C"]);
});

console.log(`\n${pass} assertions passed.`);
