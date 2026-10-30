/**
 * The executor's honesty: what it says after PF1 accepts, refuses or fails a
 * command, and that up-casting never leaves the sheet's slots wrong.
 *
 * Runs the real ActionExecutor against stubbed Foundry globals.
 * Run: node test/executor.test.mjs
 */
import assert from "node:assert/strict";

// --- a stub Foundry, just enough for the executor ---
const spoken = [];
globalThis.window = globalThis;
const hookHandlers = {};
globalThis.Hooks = { once() {}, on(name, fn) { (hookHandlers[name] ??= []).push(fn); return 1; }, off() {} };
globalThis.ChatMessage = { create() {} };
globalThis.foundry = {
  utils: { getProperty: (obj, path) => path.split(".").reduce((o, k) => o?.[k], obj) },
};
globalThis.game = {
  user: { id: "me" },
  combat: null,
  settings: { get: () => true },
  folkenQuickMenu: {
    tts: { liveVolume: 1, speak: (text) => spoken.push(text), announceAttackResult() {}, announceRollResult() {} },
    systemDetector: { isPF2e: () => false },
  },
  actors: { get: () => null },
};

const { ActionExecutor } = await import("../scripts/executor/ActionExecutor.js");

let pass = 0;
const t = async (name, fn) => {
  spoken.length = 0;
  await fn();
  pass++;
  console.log("  ok -", name);
};

/** A minimal PF1-shaped actor whose update() writes dotted paths. */
function makeActor({ items = [], books = {} } = {}) {
  const actor = {
    id: "a1",
    system: { attributes: { spells: { spellbooks: books } } },
    items: { get: (id) => items.find((i) => i.id === id) },
    updates: [],
    async update(changes) {
      this.updates.push(changes);
      for (const [path, value] of Object.entries(changes)) {
        const keys = path.split(".");
        let o = this;
        for (const k of keys.slice(0, -1)) o = o[k];
        o[keys.at(-1)] = value;
      }
    },
  };
  return actor;
}

function spontaneousBook(slots) {
  const spells = {};
  for (const [lvl, value] of Object.entries(slots)) spells[`spell${lvl}`] = { value, max: value };
  return { spontaneous: true, inUse: true, spells };
}

// --- refusals are refusals ---

await t("a potion with none left says so, and never 'sent to chat'", async () => {
  const potion = { id: "p", name: "Cure Light Wounds", use: async () => 3, system: {} };
  const actor = makeActor({ items: [potion] });
  await new ActionExecutor().execute({ actionType: "item", itemId: "p", label: "Cure Light Wounds" }, actor);
  // 0.17.0: the name is no longer spoken on use - it cut off the previous
  // result (Josh, 2026-10-29). Only the outcome is heard.
  assert.deepEqual(spoken, ["None left."]);
});

await t("a rod after a use says how many uses are left", async () => {
  const rod = { id: "r", name: "Rod", system: { uses: { per: "day", value: 2, max: 3 } } };
  rod.use = async () => ({ id: "msg" });
  const actor = makeActor({ items: [rod] });
  const ex = new ActionExecutor();
  await ex.execute({ actionType: "item", itemId: "r", label: "Rod" }, actor);
  ex._pending?.off();
  assert.deepEqual(spoken, ["2 of 3 left."]);
});

await t("using the last of something says it was the last", async () => {
  const items = [];
  const scroll = { id: "s", name: "Scroll", system: {}, use: async () => { items.length = 0; return {}; } };
  items.push(scroll);
  const actor = makeActor({ items });
  const ex = new ActionExecutor();
  await ex.execute({ actionType: "item", itemId: "s", label: "Scroll" }, actor);
  ex._pending?.off();
  assert.equal(spoken.at(-1), "That was the last one.");
});

await t("an item gone since the last scan says how to fix it", async () => {
  await new ActionExecutor().execute({ actionType: "item", itemId: "gone", label: "Wand" }, makeActor());
  assert.equal(spoken.at(-1), "Not found. Type slash scan.");
});

await t("a use() that throws is reported as a failure, by name", async () => {
  const wand = { id: "w", name: "Wand", system: {}, use: async () => { throw new Error("boom"); } };
  const origError = console.error; console.error = () => {};
  try {
    await new ActionExecutor().execute({ actionType: "item", itemId: "w", label: "Wand" }, makeActor({ items: [wand] }));
  } finally { console.error = origError; }
  assert.equal(spoken.at(-1), "Wand failed.");
});

await t("templates are skipped so area spells do not wait on the map", async () => {
  let options;
  const wand = { id: "w", name: "Wand", system: {}, use: async (o) => { options = o; return {}; } };
  const ex = new ActionExecutor();
  await ex.execute({ actionType: "item", itemId: "w", label: "Wand" }, makeActor({ items: [wand] }));
  ex._pending?.off();
  assert.equal(options.measureTemplate, false);
  assert.equal(options.skipDialog, true);
});

// --- spells ---

await t("a successful cast says nothing itself - the result comes from the card", async () => {
  const book = spontaneousBook({ 6: 2 });
  const spell = { id: "d", name: "Disintegrate", system: { level: 6, spellbook: "primary" }, spellbook: book, use: async () => ({}) };
  const ex = new ActionExecutor();
  await ex.execute({ actionType: "spell", itemId: "d", label: "Disintegrate" }, makeActor({ items: [spell], books: { primary: book } }));
  ex._pending?.off();
  assert.deepEqual(spoken, []);
});

await t("a prepared spell with no casts left is refused before PF1 is asked", async () => {
  let asked = false;
  const book = { spontaneous: false, inUse: true, spells: {} };
  const spell = { id: "f", name: "Fireball", system: { level: 3 }, spellbook: book, getSpellUses: () => 0, use: async () => { asked = true; } };
  await new ActionExecutor().execute({ actionType: "spell", itemId: "f", label: "Fireball" }, makeActor({ items: [spell] }));
  assert.equal(asked, false);
  assert.equal(spoken.at(-1), "None left.");
});

// --- up-casting ---

await t("any other command withdraws a pending up-cast offer", async () => {
  const ex = new ActionExecutor();
  ex.pendingUpcast = { spellId: "d", actorId: "a1", level: 6, upcastLevel: 7 };
  await ex.execute({ actionType: "skill", label: "Perception", skillId: "per" }, null);
  assert.equal(ex.hasPendingUpcast, false);
});

await t("a failed up-cast puts BOTH levels back to what they were", async () => {
  // 0.14.0 read the 'before' counts after the update had changed them, so a
  // failed cast left a free 6th and one fewer 7th.
  const book = spontaneousBook({ 6: 0, 7: 2 });
  const spell = { id: "d", name: "Disintegrate", system: { level: 6, spellbook: "primary" }, spellbook: book, use: async () => 2 };
  const actor = makeActor({ items: [spell], books: { primary: book } });
  await new ActionExecutor()._castWithSlot(spell, actor, 6, 7);
  assert.equal(book.spells.spell6.value, 0);
  assert.equal(book.spells.spell7.value, 2);
  assert.equal(spoken.at(-1), "Disabled.");
});

await t("a good up-cast spends the 7th and leaves the 6th at zero", async () => {
  const book = spontaneousBook({ 6: 0, 7: 2 });
  // PF1 deducts the lent slot at the spell's own level.
  const spell = { id: "d", name: "Disintegrate", system: { level: 6, spellbook: "primary" }, spellbook: book,
    use: async () => { book.spells.spell6.value -= 1; return {}; } };
  const actor = makeActor({ items: [spell], books: { primary: book } });
  const ex = new ActionExecutor();
  await ex._castWithSlot(spell, actor, 6, 7);
  ex._pending?.off();
  assert.equal(book.spells.spell6.value, 0);
  assert.equal(book.spells.spell7.value, 1);
  assert.equal(spoken.at(-1), "Disintegrate, cast with a 7th slot.");
});

await t("/6cl7 refuses a slot that is not higher than the spell", async () => {
  const book = spontaneousBook({ 6: 1, 7: 1 });
  const spell = { id: "c", name: "Chain Lightning", system: { level: 6, spellbook: "primary" }, spellbook: book, use: async () => ({}) };
  await new ActionExecutor().castFromSlot(spell, makeActor({ items: [spell] }), 6);
  assert.equal(spoken.at(-1), "A 6th slot is not higher than 6th.");
});

await t("/6cl7 refuses a prepared caster", async () => {
  const book = { spontaneous: false, spells: {} };
  const spell = { id: "c", name: "Chain Lightning", system: { level: 6 }, spellbook: book };
  await new ActionExecutor().castFromSlot(spell, makeActor(), 7);
  assert.equal(spoken.at(-1), "Only spontaneous casters choose a slot.");
});

await t("/6cl7 with no 7ths left says so", async () => {
  const book = spontaneousBook({ 6: 1, 7: 0 });
  const spell = { id: "c", name: "Chain Lightning", system: { level: 6, spellbook: "primary" }, spellbook: book };
  await new ActionExecutor().castFromSlot(spell, makeActor(), 7);
  assert.equal(spoken.at(-1), "No 7th slots left.");
});

await t("a Y after the offer lapsed is told so", async () => {
  const ex = new ActionExecutor();
  ex._expiredAt = Date.now();
  assert.equal(ex.recentlyExpiredUpcast, true);
  ex.answerExpiredUpcast();
  assert.equal(spoken.at(-1), "Offer expired.");
  assert.equal(ex.recentlyExpiredUpcast, false);
});

// --- 0.16.0 ---

await t("a withdrawn offer is announced, and a following Y is answered, not posted", async () => {
  const ex = new ActionExecutor();
  ex.pendingUpcast = { spellId: "d", actorId: "a1", level: 6, upcastLevel: 7 };
  await ex.execute({ actionType: "skill", label: "Perception", skillId: "per" }, null);
  assert.equal(spoken[0], "Offer withdrawn.");
  assert.equal(ex.recentlyExpiredUpcast, true);
  ex.answerExpiredUpcast();
  assert.equal(spoken.at(-1), "Offer withdrawn.");
});

await t("/0as1: cantrips cannot be up-cast (Josh: it broke every cantrip)", async () => {
  const book = spontaneousBook({ 0: 4, 1: 4 });
  const spell = { id: "a", name: "Acid Splash", system: { level: 0, spellbook: "primary" }, spellbook: book, use: async () => ({}) };
  await new ActionExecutor().castFromSlot(spell, makeActor({ items: [spell] }), 1);
  assert.equal(spoken.at(-1), "Cantrips do not use slots.");
  assert.equal(book.spells.spell1.value, 4);
});

await t("/ki reads the pool and spends nothing", async () => {
  let used = false;
  const ki = { id: "k", name: "Ki Pool", charges: 7, maxCharges: 8, use: async () => { used = true; } };
  await new ActionExecutor().execute({ actionType: "pool_read", itemId: "k", poolNoun: "ki", label: "Ki Pool, left" }, makeActor({ items: [ki] }));
  assert.deepEqual(spoken, ["7 of 8 ki left."]);
  assert.equal(used, false);
});

await t("templates are really skipped: PF1's own decision is overridden in its hook", async () => {
  let shared;
  const wand = { id: "w", name: "Wand", system: {}, use: async () => {
    shared = { useMeasureTemplate: true };           // what PF1 decides from its client setting
    for (const fn of hookHandlers.pf1CreateActionUse ?? []) fn({ shared });
    return {};
  } };
  const ex = new ActionExecutor();
  await ex.execute({ actionType: "item", itemId: "w", label: "Wand" }, makeActor({ items: [wand] }));
  ex._pending?.off();
  assert.equal(shared.useMeasureTemplate, false);
});

await t("outside a Quick Menu use, PF1's template decision is left alone", async () => {
  new ActionExecutor()._installTemplateGuard();
  const shared = { useMeasureTemplate: true };
  for (const fn of hookHandlers.pf1CreateActionUse ?? []) fn({ shared });
  assert.equal(shared.useMeasureTemplate, true);
});

await t("a cure potion is recognised as healing; a sword is not", async () => {
  const ex = new ActionExecutor();
  assert.equal(ex._isHealing({ system: { actions: [{ actionType: "heal" }] } }), true);
  assert.equal(ex._isHealing({ defaultAction: { isHealing: true } }), true);
  assert.equal(ex._isHealing({ system: { actions: [{ actionType: "mwak" }] } }), false);
  assert.equal(ex._isHealing(null), false);
});

await t("a pool read keeps its name when the pool's own feature abbreviates the same (Bolty's Grit)", async () => {
  const { AbbreviationResolver } = await import("../scripts/chat/AbbreviationResolver.js");
  const res = new AbbreviationResolver();
  res._getAllActionItems = () => [
    { id: "item_grit", label: "Grit", type: "action", actionType: "item", itemId: "g" },
    { id: "pool_g", label: "Grit, left", type: "action", actionType: "pool_read", forceAbbrev: "grit", itemId: "g" },
    { id: "item_dead", label: "Deadeye", type: "action", actionType: "item", itemId: "d" },
  ];
  await res.buildForActor({ id: "b", name: "Bolty", getFlag: () => ({}) });
  assert.equal(res.resolve("grit").actionItem.actionType, "pool_read");
  assert.equal(res.resolve("gritu").actionItem.id, "item_grit");
  assert.equal(res.collisionCount, 0);
});

console.log(`\n${pass} assertions passed.`);
