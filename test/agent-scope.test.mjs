/**
 * Scoping tests. These are the safety net: Foundry hands the client every
 * actor in the world, so if these fail the API can leak the bestiary.
 * Run: node test/agent-scope.test.mjs
 */
import assert from "node:assert/strict";
import { ownedFrom, pickActor } from "../scripts/agent/ActorScope.js";

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log("  ok -", name); };

const actors = [
  { id: "a1", name: "Olbryn", isOwner: true },
  { id: "a2", name: "Obs", isOwner: true },
  { id: "a3", name: "Adamantine Golem", isOwner: false },
];

t("keeps only owned actors", () =>
  assert.deepEqual(ownedFrom(actors).map(a => a.name), ["Olbryn", "Obs"]));

t("never leaks a non-owned actor", () =>
  assert.equal(ownedFrom(actors).some(a => a.name === "Adamantine Golem"), false));

t("tolerates an empty world", () =>
  assert.deepEqual(ownedFrom([]), []));

t("defaults to the assigned character", () =>
  assert.equal(pickActor(ownedFrom(actors), "a1").name, "Olbryn"));

t("falls back to the only owned actor when none assigned", () =>
  assert.equal(pickActor([actors[0]], null).name, "Olbryn"));

t("selects by name, case-insensitively", () =>
  assert.equal(pickActor(ownedFrom(actors), "a1", "obs").id, "a2"));

t("selects by id", () =>
  assert.equal(pickActor(ownedFrom(actors), "a1", "a2").name, "Obs"));

t("refuses an actor that is not owned", () =>
  assert.throws(() => pickActor(ownedFrom(actors), "a1", "Adamantine Golem"),
    /not one of your characters/i));

t("refuses when nothing is owned", () =>
  assert.throws(() => pickActor([], null), /do not own any/i));

t("asks which when ambiguous and none assigned", () =>
  assert.throws(() => pickActor(ownedFrom(actors), null), /Olbryn, Obs/));

console.log(`\n${pass} assertions passed.`);
