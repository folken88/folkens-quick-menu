/**
 * Scoping tests. These are the safety net: Foundry hands the client every
 * actor in the world, so if these fail the API can leak the bestiary.
 * Run: node test/agent-scope.test.mjs
 */
import assert from "node:assert/strict";
import { ownedFrom, pickActor, splitOwnership, pickPreferringMine } from "../scripts/agent/ActorScope.js";

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

// --- world-default ownership (Iron Gods: 4 actors owned by everybody) ---
const ME = "u1";
const world = [
  { id: "olbryn", name: "Olbryn", isOwner: true, ownership: { [ME]: 3, default: 2 } },
  { id: "obs", name: "Obs", isOwner: true, ownership: { default: 3 } },
  { id: "rat", name: "Ratfolk Scrapper", isOwner: true, ownership: { default: 3 } },
  { id: "golem", name: "Adamantine Golem", isOwner: false, ownership: { default: 0 } },
];

t("separates genuinely-owned from owned-by-everybody", () => {
  const { mine, shared } = splitOwnership(world, ME, "olbryn");
  assert.deepEqual(mine.map(a => a.name), ["Olbryn"]);
  assert.deepEqual(shared.map(a => a.name), ["Obs", "Ratfolk Scrapper"]);
});

t("the assigned character counts as mine even without explicit ownership", () => {
  const { mine } = splitOwnership(world, ME, "obs");
  assert.ok(mine.some(a => a.name === "Obs"));
});

t("a non-owned actor appears in neither list", () => {
  const { mine, shared } = splitOwnership(world, ME, "olbryn");
  assert.equal([...mine, ...shared].some(a => a.name === "Adamantine Golem"), false);
});

t("with no name given, resolves to the player's own character", () => {
  const { mine, shared } = splitOwnership(world, ME, "olbryn");
  assert.equal(pickPreferringMine(mine, shared, "olbryn").name, "Olbryn");
});

t("shared actors are still reachable when asked for by name", () => {
  const { mine, shared } = splitOwnership(world, ME, "olbryn");
  assert.equal(pickPreferringMine(mine, shared, "olbryn", "Obs").name, "Obs");
});

t("a non-owned actor is still refused by name", () => {
  const { mine, shared } = splitOwnership(world, ME, "olbryn");
  assert.throws(() => pickPreferringMine(mine, shared, "olbryn", "Adamantine Golem"),
    /not one of your characters/i);
});

console.log(`\n${pass} assertions passed.`);
