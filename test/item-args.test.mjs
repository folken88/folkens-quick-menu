/**
 * The word after an item command: o, or a refusal (10.26, 10.11).
 * Run: node test/item-args.test.mjs
 */
import assert from "node:assert/strict";
import { parseItemArgs } from "../scripts/chat/ItemArgs.js";

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log("  ok -", name); };

t("no word is for yourself", () => {
  assert.deepEqual(parseItemArgs("", "item"), { mode: "self" });
  assert.deepEqual(parseItemArgs(undefined, "item"), { mode: "self" });
  assert.deepEqual(parseItemArgs("   ", "skill", "Perception"), { mode: "self" });
});

t("o and other mean someone else, any case", () => {
  assert.deepEqual(parseItemArgs("o", "item"), { mode: "other" });
  assert.deepEqual(parseItemArgs("Other", "item"), { mode: "other" });
  assert.deepEqual(parseItemArgs("  o ", "item"), { mode: "other" });
  for (const type of ["item_consume", "item_activate", "spell"]) {
    assert.deepEqual(parseItemArgs("o", type), { mode: "other" });
  }
});

t("any other word on an item is refused, as typed", () => {
  assert.deepEqual(parseItemArgs("0", "item"),
    { mode: "invalid", reason: "0? Not an option. Say o for someone else." });
  assert.equal(parseItemArgs("p", "item").mode, "invalid");
  assert.equal(parseItemArgs(" Ox ", "spell").reason, "Ox? Not an option. Say o for someone else.");
});

t("a command that takes no options refuses any word, o included", () => {
  assert.deepEqual(parseItemArgs("o", "skill", "Perception"),
    { mode: "invalid", reason: "Perception takes no options." });
  assert.equal(parseItemArgs("5", "save", "Fortitude").reason, "Fortitude takes no options.");
});

console.log(`${pass} passed`);
