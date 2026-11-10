/**
 * The command stability rule: a command a player has never changes unless the
 * player changes it, and the core is the same on every character.
 * Every case is from Josh's reports of 2026-10-31 and 2026-11-01.
 * Run: node test/command-tiers.test.mjs
 */
import assert from "node:assert/strict";
import { assignCodes, tierOf, stableKey, CORE_TYPES } from "../scripts/chat/CommandTiers.js";

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log("  ok -", name); };

const skill = (label, skillKey) => ({ id: `skill_${skillKey}`, label, actionType: "skill", skillKey });
const stat = (label, abilityKey) => ({ id: `stat_${abilityKey}`, label, actionType: "ability", abilityKey });
const consumable = (id, label, created) => ({ id: `item_${id}`, label, actionType: "item", itemId: id,
  originalItem: { type: "consumable", _stats: { createdTime: created } } });
const feature = (id, label, created, type = "feat") => ({ id: `item_${id}`, label, actionType: "item", itemId: id,
  originalItem: { type, _stats: { createdTime: created } } });
const codeOf = (r, id) => r.reverse.get(id);

// --- what happened on 2026-10-31 ---

t("a potion with Perception's initials never takes /per; it extends itself", () => {
  const r = assignCodes([
    consumable("p1", "Potion of Expeditious Retreat", 1793300000000),
    skill("Perception", "per"),
  ]);
  assert.equal(codeOf(r, "skill_per"), "per");
  assert.equal(r.map.get("per").label, "Perception");
  const potion = codeOf(r, "item_p1");
  assert.notEqual(potion, "per");
  assert.equal(potion, "pere", "the newcomer takes the longer code");
});

t("the core is the same whatever else the character carries", () => {
  const bare = assignCodes([skill("Perception", "per"), stat("Intelligence Check", "int"), skill("Intimidate", "int")]);
  const loaded = assignCodes([
    consumable("a", "Potion of Expeditious Retreat", 1), feature("b", "Perfect Recall", 2),
    skill("Perception", "per"), stat("Intelligence Check", "int"), skill("Intimidate", "int"),
    consumable("c", "Infusion", 3), feature("d", "Internal Fortitude", 4),
  ]);
  for (const id of ["skill_per", "stat_int", "skill_int"]) assert.equal(codeOf(loaded, id), codeOf(bare, id), id);
  assert.equal(codeOf(bare, "skill_int"), "itm", "Intimidate is /itm, never /int2");
  assert.equal(codeOf(bare, "stat_int"), "int");
});

// --- who had it first keeps it ---

t("the thing he had first keeps its code; the newcomer extends", () => {
  const r = assignCodes([
    consumable("tele", "Scroll of Teleport", 2000),
    consumable("tech", "Scroll of Technomancy", 1000),
  ]);
  assert.equal(codeOf(r, "item_tech"), "stx");          // st is reserved, as before
  assert.equal(codeOf(r, "item_tele"), "ste", "the shortest free extension");
});

t("permanent things outrank consumables whatever the dates say", () => {
  const r = assignCodes([
    consumable("pot", "Potion of Fly", 1),               // older
    feature("feat", "Point-blank Focus", 2),
  ]);
  assert.equal(codeOf(r, "item_feat"), "pbf");          // the hyphen splits the word
  assert.notEqual(codeOf(r, "item_pot"), "pbf");
  const r2 = assignCodes([consumable("pot", "Potion of Fly", 1), feature("feat", "Perfect Flight", 2)]);
  assert.equal(codeOf(r2, "item_feat"), "pf", "the feature wins the shared initials");
  assert.equal(codeOf(r2, "item_pot"), "pfl");
});

// --- codes are remembered ---

t("a remembered code is kept on a rebuild even when something older would now take it", () => {
  const items = [
    consumable("ret", "Potion of Expeditious Retreat", 1000),
    consumable("pere", "Potion of Perennial Rest", 500),  // older, same initials
  ];
  const first = assignCodes([items[0]]);
  assert.equal(codeOf(first, "item_ret"), "per");         // no Perception on this character
  const second = assignCodes(items, { saved: first.assigned });
  assert.equal(codeOf(second, "item_ret"), "per", "kept");
  assert.notEqual(codeOf(second, "item_pere"), "per");
  assert.deepEqual(second.moved, []);
});

t("a restocked consumable gets its old code back by name, with a new item id", () => {
  const first = assignCodes([consumable("old", "Potion of Cure Light Wounds", 1)]);
  const code = codeOf(first, "item_old");
  const again = assignCodes([consumable("new", "Potion of Cure Light Wounds", 99)], { saved: first.assigned });
  assert.equal(codeOf(again, "item_new"), code);
  assert.equal(again.fresh.length, 0, "not new to the voice");
});

t("the first build reports every generated code as fresh; a rebuild reports only the newcomer", () => {
  const items = [feature("a", "Up Close and Deadly", 1), consumable("b", "Potion of Shield", 2)];
  const first = assignCodes(items);
  assert.equal(first.fresh.length, 2);
  const withNew = assignCodes([...items, consumable("c", "Potion of Fly", 3)], { saved: first.assigned });
  assert.deepEqual(withNew.fresh.map(i => i.label), ["Potion of Fly"]);
});

// --- the player's own aliases ---

t("a player alias wins, and the generated holder it displaces is reported as moved", () => {
  const items = [skill("Perception", "per"), consumable("ret", "Potion of Expeditious Retreat", 1), consumable("k", "Scroll of Knock", 2)];
  const first = assignCodes(items);
  assert.equal(codeOf(first, "item_ret"), "pere");
  const renamed = assignCodes(items, { saved: first.assigned, aliases: { item_k: "pere" } });
  assert.equal(codeOf(renamed, "item_k"), "pere");
  assert.notEqual(codeOf(renamed, "item_ret"), "pere");
  assert.equal(renamed.moved.length, 1);
  assert.equal(renamed.moved[0].label, "Potion of Expeditious Retreat");
  assert.equal(renamed.moved[0].from, "pere");
});

// --- the pool rule survives ---

t("a feature named like a pool read takes the code plus u", () => {
  const r = assignCodes([
    feature("gritfeat", "Grit", 1, "feat"),
    { id: "pool_x", label: "Grit, left", actionType: "pool_read", forceAbbrev: "grit", itemId: "gritfeat" },
  ]);
  assert.equal(codeOf(r, "pool_x"), "grit");
  assert.equal(codeOf(r, "item_gritfeat"), "gritu");
});

t("an alias cannot take a core code; it is dropped and reported (1.2)", () => {
  const r = assignCodes([skill("Intimidate", "int"), stat("Intelligence", "int")], { aliases: { stat_int: "int", skill_int: "int2" } });
  assert.equal(codeOf(r, "skill_int"), "itm");
  assert.deepEqual(r.dropped.map(d => d.key).sort(), ["skill_int", "stat_int"]);
});

t("a remembered code is never the alias, so reset moves back and says so (1.9)", () => {
  const items = [consumable("k", "Scroll of Knock", 1), skill("Perception", "per")];
  const aliased = assignCodes(items, { aliases: { item_k: "skn" } });
  assert.equal(codeOf(aliased, "item_k"), "skn");
  assert.notEqual(aliased.assigned[stableKey(items[0])], "skn");
  const reset = assignCodes(items, { saved: aliased.assigned });
  assert.equal(codeOf(reset, "item_k"), aliased.assigned[stableKey(items[0])]);
});

t("the core is assigned before aliases: an alias equal to a final core code is dropped", () => {
  const items = [skill("Intimidate", "int"), stat("Intelligence", "int"), consumable("k", "Scroll of Knock", 1)];
  const r = assignCodes(items, { aliases: { item_k: "itm" } });
  assert.equal(codeOf(r, "skill_int"), "itm");
  assert.equal(r.map.get("itm").label, "Intimidate");
  assert.deepEqual(r.dropped, [{ key: "item_k", alias: "itm", label: "Scroll of Knock" }]);
  assert.notEqual(codeOf(r, "item_k"), "itm");
});

t("an aliased item whose natural code is held records nothing; reset moves only it", () => {
  const items = [skill("Perception", "per"), consumable("ret", "Potion of Expeditious Retreat", 1)];
  const aliased = assignCodes(items, { aliases: { item_ret: "xyz" } });
  assert.equal(codeOf(aliased, "item_ret"), "xyz");
  assert.equal(aliased.assigned[stableKey(items[1])], undefined, "natural code per is Perception's");
  const reset = assignCodes(items, { saved: aliased.assigned });
  assert.equal(codeOf(reset, "skill_per"), "per", "the holder never moves");
  assert.equal(codeOf(reset, "item_ret"), "pere", "a fresh code, not the alias");
  assert.equal(reset.fresh.length, 1);
});

t("tiers and keys", () => {
  assert.equal(tierOf(skill("Perception", "per")), 1);
  assert.equal(tierOf(feature("f", "Dead Shot", 1)), 2);
  assert.equal(tierOf(consumable("c", "Potion of Fly", 1)), 3);
  assert.equal(stableKey(consumable("c", " Potion of Fly ", 1)), "item::potion of fly");
  for (const type of ["skill", "save", "ability", "initiative", "maneuver", "stabilize", "caster_level", "concentration", "pool_read"]) {
    assert.equal(CORE_TYPES.has(type), true, type);
  }
});

console.log(`${pass} assertions passed.`);
