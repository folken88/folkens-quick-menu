/**
 * The use line (10.16): name first, then the result, then detail, notes and
 * the count. Replaces "Card posted."
 * Run: node test/use-report.test.mjs
 */
import assert from "node:assert/strict";
import { composeUseLine } from "../scripts/executor/UseReport.js";

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log("  ok -", name); };

t("a buff with no roll: name, detail, count", () =>
  assert.equal(composeUseLine({ name: "Haste", detail: "Range close. Duration 10 rounds.", count: "2 of 3 left." }),
    "Haste. Range close. Duration 10 rounds. 2 of 3 left."));

t("a result keeps its inner stops; only the final one goes before the join", () =>
  assert.equal(composeUseLine({ name: "Lightning Bolt", result: "40 electricity damage. Ref DC 23.",
    notes: ["Greater Spell Penetration Check 36"] }),
    "Lightning Bolt, 40 electricity damage. Ref DC 23. Greater Spell Penetration Check 36."));

t("for someone else comes after the name, before the count", () =>
  assert.equal(composeUseLine({ name: "Potion of Cure Moderate Wounds", forOther: true, count: "1 left." }),
    "Potion of Cure Moderate Wounds, for someone else. 1 left."));

t("the name alone is a sentence", () =>
  assert.equal(composeUseLine({ name: "Rod" }), "Rod."));

t("a result with the for-someone-else tag", () =>
  assert.equal(composeUseLine({ name: "Potion of Cure Light Wounds", result: "Healed 7.", forOther: true }),
    "Potion of Cure Light Wounds, Healed 7, for someone else."));

console.log(`\n${pass} assertions passed.`);
