/**
 * Haste and its kind reach allies within 15 feet (10.28).
 * Run: node test/allies.test.mjs
 */
import assert from "node:assert/strict";
import { alliesWithin, isGroupBuff, allyReport } from "../scripts/executor/Allies.js";

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log("  ok -", name); };

const tok = (name, disposition, feet, isOwner) => ({
  name, feet, document: { disposition }, actor: { name, isOwner },
});
const caster = tok("Caster", 1, 0, true);
const measure = (a, b) => b.feet;

t("only same-disposition tokens within 15 feet are allies, with ownership", () => {
  const bob = tok("Bob", 1, 10, true);
  const dave = tok("Dave", 1, 15, false);
  const orc = tok("Orc", -1, 5, false);
  const far = tok("Far", 1, 20, true);
  const ghost = { name: "Ghost", feet: 5, document: { disposition: 1 }, actor: null };
  const hits = alliesWithin([caster, bob, dave, orc, far, ghost], caster, 15, measure);
  assert.deepEqual(hits.map((h) => [h.token.name, h.owned]), [["Bob", true], ["Dave", false]]);
  assert.equal(hits[0].actor, bob.actor);
});

const haste = (units, value) => ({ system: { actions: { a: { range: { units }, target: { value } } } } });

t("a many-creature spell is a group buff; personal, touch and single targets are not", () => {
  assert.equal(isGroupBuff(haste("close", "one creature/level, no two of which can be more than 30 ft. apart")), true);
  assert.equal(isGroupBuff(haste("personal", "you")), false);
  assert.equal(isGroupBuff(haste("personal", "one creature/level")), false);
  assert.equal(isGroupBuff(haste("touch", "creatures touched")), false);
  assert.equal(isGroupBuff(haste("close", "one creature")), false);
  assert.equal(isGroupBuff({ defaultAction: { range: { units: "close" }, target: { value: "allies" } } }), true);
  assert.equal(isGroupBuff({}), false);
  assert.equal(isGroupBuff(null), false);
});

t("the ally report names who is on and who must switch theirs on", () => {
  const bob = { actor: { name: "Bob" }, owned: true, switched: true };
  const carol = { actor: { name: "Carol" }, owned: true, switched: true };
  const eve = { actor: { name: "Eve" }, owned: true, switched: true };
  const dave = { actor: { name: "Dave" }, owned: false };
  assert.equal(allyReport([bob, dave], "Haste"), "Haste on for Bob. Also in range: Dave; they switch theirs on.");
  assert.equal(allyReport([bob, carol], "Haste"), "Haste on for Bob and Carol.");
  assert.equal(allyReport([bob, carol, eve], "Haste"), "Haste on for Bob, Carol and Eve.");
  assert.equal(allyReport([dave], "Haste"), "Also in range: Dave; they switch theirs on.");
  assert.equal(allyReport([{ ...bob, switched: false }], "Haste"), "");
  assert.equal(allyReport([], "Haste"), "");
});

console.log(`\n${pass} assertions passed.`);
