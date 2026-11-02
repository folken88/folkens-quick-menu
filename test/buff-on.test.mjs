/**
 * A buff potion switches its buff on: the sheet's, else the compendium's, else nothing.
 * Run: node test/buff-on.test.mjs
 */
import assert from "node:assert/strict";
import { switchBuffOn, buffNameFor, orderPacks } from "../scripts/executor/BuffOn.js";

let pass = 0;
const t = async (name, fn) => { await fn(); pass++; console.log("  ok -", name); };

function makeActor(items = []) {
  return {
    items: { contents: items, find: (fn) => items.find(fn) },
    created: [],
    async createEmbeddedDocuments(type, data) { this.created.push(...data); },
  };
}
function makePack(id, entries) {
  return {
    documentName: "Item", collection: id,
    async getIndex() { return entries.map(e => ({ _id: e._id, name: e.name, type: e.type })); },
    async getDocument(_id) { const e = entries.find(x => x._id === _id); return e && { toObject: () => ({ name: e.name, type: e.type, system: { active: false, duration: e.duration } }) }; },
  };
}

await t("a potion's buff is its name after 'of'; other consumables have none", async () => {
  assert.equal(buffNameFor({ name: "Potion of Shield" }), "Shield");
  assert.equal(buffNameFor({ name: "Potion of Owl's Wisdom" }), "Owl's Wisdom");
  assert.equal(buffNameFor({ name: "Scroll of Fireball" }), null);
  assert.equal(buffNameFor({ name: "Wack Juce" }), null);
});

await t("the sheet's own buff is switched on and said", async () => {
  const said = [];
  const shield = { type: "buff", name: "Shield", system: { active: false }, updates: [], async update(c) { this.updates.push(c); } };
  const actor = makeActor([shield]);
  const where = await switchBuffOn(actor, { name: "Potion of Shield" }, { speak: l => said.push(l) });
  assert.equal(where, "sheet");
  assert.deepEqual(shield.updates, [{ "system.active": true }]);
  assert.deepEqual(said, ["Shield on."]);
  assert.equal(actor.created.length, 0, "nothing imported when the sheet has it");
});

await t("with no buff on the sheet, PF1's compendium buff is imported active, before any other pack", async () => {
  const said = [];
  const actor = makeActor([]);
  const homebrew = makePack("world.my-buffs", [{ _id: "h1", name: "Fly", type: "buff", duration: "homebrew" }]);
  const pf1 = makePack("pf1.commonbuffs", [{ _id: "p1", name: "Fly", type: "buff", duration: "5 min" }]);
  const where = await switchBuffOn(actor, { name: "Potion of Fly" }, { packs: [homebrew, pf1], speak: l => said.push(l) });
  assert.equal(where, "compendium");
  assert.equal(actor.created.length, 1);
  assert.equal(actor.created[0].system.active, true);
  assert.equal(actor.created[0].system.duration, "5 min", "the system's version, as Tobias asked");
  assert.deepEqual(said, ["Fly on, from the compendium."]);
});

await t("a cure potion has no buff anywhere, and nothing is said", async () => {
  const said = [];
  const actor = makeActor([]);
  const pf1 = makePack("pf1.commonbuffs", [{ _id: "p1", name: "Fly", type: "buff" }]);
  const where = await switchBuffOn(actor, { name: "Potion of Cure Light Wounds" }, { packs: [pf1], speak: l => said.push(l) });
  assert.equal(where, null);
  assert.deepEqual(said, []);
});

await t("pack order: pf1 first, non-Item packs dropped", async () => {
  const order = orderPacks([
    { documentName: "Actor", collection: "pf1.monsters" },
    { documentName: "Item", collection: "world.stuff" },
    { documentName: "Item", collection: "pf1.commonbuffs" },
  ]).map(p => p.collection);
  assert.deepEqual(order, ["pf1.commonbuffs", "world.stuff"]);
});

console.log(`${pass} assertions passed.`);
