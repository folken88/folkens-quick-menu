/**
 * The executor's honesty: what it says after PF1 accepts, refuses or fails a
 * command, and that up-casting never leaves the sheet's slots wrong.
 *
 * Runs the real ActionExecutor against stubbed Foundry globals.
 * Run: node test/executor.test.mjs
 */
import assert from "node:assert/strict";
import { spellOut } from "../scripts/chat/AbbreviationGenerator.js";

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
    tts: { liveVolume: 1, speak: (text) => spoken.push(text), announceAttackResult() {}, announceRollResult() {},
      // The rendered totals; a test card carries them ready-made as `result`.
      resultLine: (message) => message?.result ?? "", terse: true },
    systemDetector: { isPF2e: () => false },
  },
  actors: { get: () => null },
};

const { ActionExecutor } = await import("../scripts/executor/ActionExecutor.js");

// Every reader a test arms is switched off when it ends. Item readers wait ten
// minutes on real timers (8.44), which would hold the process open.
const armedReaders = [];
const realArmReader = ActionExecutor.prototype._armReader;
// The use line waits up to 1.5 s for the card (10.16). No test waits: a card
// either arrives during use() or comes later, by hand.
ActionExecutor.prototype._sleep = async () => undefined;
ActionExecutor.prototype._armReader = function (...args) {
  const reader = realArmReader.apply(this, args);
  armedReaders.push(reader);
  return reader;
};

// Every buff window a use opens is closed when the test ends: an executor
// with no test clock watches on a real 4 s timer (8.36).
const buffWindows = [];
const realBuffWatch = ActionExecutor.prototype._buffWatch;
if (realBuffWatch) ActionExecutor.prototype._buffWatch = function (actor) {
  const watch = realBuffWatch.call(this, actor);
  if (!watch._tracked) {
    const open = watch.open.bind(watch);
    watch.open = (opts) => { const w = open(opts); buffWindows.push(w); return w; };
    watch._tracked = true;
  }
  return watch;
};

let pass = 0;
const t = async (name, fn) => {
  spoken.length = 0;
  try {
    await fn();
  } finally {
    for (const reader of armedReaders.splice(0)) reader.off();
    for (const w of buffWindows.splice(0)) w.close();
  }
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

// --- Take 10 and Take 20 (Josh, 2026-11-01: they rolled a plain d20) ---

await t("Take 10 and Take 20 pass PF1's staticRoll, not a flag it ignores", async () => {
  const calls = [];
  const actor = makeActor();
  actor.rollSkill = async (key, opts) => { calls.push([key, opts]); };
  const ex = new ActionExecutor();
  await ex.execute({ actionType: "skill", skillKey: "per", label: "Perception", take10: true }, actor);
  await ex.execute({ actionType: "skill", skillKey: "per", label: "Perception", take20: true }, actor);
  await ex.execute({ actionType: "skill", skillKey: "per", label: "Perception" }, actor);
  assert.equal(calls[0][1].staticRoll, 10);
  assert.equal(calls[1][1].staticRoll, 20);
  assert.equal(calls[2][1].staticRoll, undefined);
  assert.equal("take10" in calls[0][1], false);
});

await t("the Normal entry makes PF1's alterRollData see fullAttack false; a chat attack is left alone", async () => {
  const weapon = { id: "w", name: "Punch", system: {}, use: async () => {
    // What PF1's process() does after pf1CreateActionUse: hand alterRollData an empty formData.
    const actionUse = { shared: {}, alterRollData: async function (formData) { this.shared.fullAttack = formData.fullAttack ?? true; } };
    for (const fn of hookHandlers.pf1CreateActionUse ?? []) fn(actionUse);
    await actionUse.alterRollData({});
    seen.push(actionUse.shared.fullAttack);
    return {};
  } };
  const seen = [];
  const actor = makeActor({ items: [weapon] });
  const ex = new ActionExecutor();
  await ex.execute({ actionType: "attack", itemId: "w", label: "Normal Punch", fullAttack: false }, actor);
  await ex.execute({ actionType: "attack", itemId: "w", label: "Punch" }, actor);
  assert.deepEqual(seen, [false, true]);
});

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
  assert.deepEqual(spoken, ["Rod. 2 of 3 left."]);
});

// --- the use line (10.16): name first, result after it, never "Card posted." ---

const rodCard = (extra = {}) => ({ system: { item: "Actor.a1.Item.r" }, ...extra });

await t("a card that comes during the use is one line: name, result, count", async () => {
  const rod = { id: "r", name: "Rod", system: { uses: { per: "day", value: 2, max: 3 } } };
  rod.use = async () => { postCard(rodCard({ result: "7 fire damage." })); return {}; };
  const ex = new ActionExecutor();
  await ex.execute({ actionType: "item", itemId: "r", label: "Rod" }, makeActor({ items: [rod] }));
  assert.deepEqual(spoken, ["Rod, 7 fire damage. 2 of 3 left."]);
  assert.equal(ex.hasPendingReader, false, "the reader was left armed");
});

await t("a card with nothing to roll still says the name, never Card posted", async () => {
  const rod = { id: "r", name: "Rod", system: { uses: { per: "day", value: 2, max: 3 } } };
  rod.use = async () => { postCard(rodCard()); return {}; };
  await new ActionExecutor().execute({ actionType: "item", itemId: "r", label: "Rod" }, makeActor({ items: [rod] }));
  assert.deepEqual(spoken, ["Rod. 2 of 3 left."]);
});

await t("the card's rolled notes join the line", async () => {
  const rod = { id: "r", name: "Rod", system: { uses: { per: "day", value: 2, max: 3 } } };
  const content = '<span class="tag"><a class="inline-roll">Caster Level Check 14</a></span>';
  rod.use = async () => { postCard(rodCard({ result: "Ref DC 17.", content })); return {}; };
  await new ActionExecutor().execute({ actionType: "item", itemId: "r", label: "Rod" }, makeActor({ items: [rod] }));
  assert.equal(spoken.length, 1);
  assert.match(spoken[0], /^Rod, Ref DC 17\. .*Caster Level Check 14.*\. 2 of 3 left\.$/);
});

await t("a late card speaks name and result only, after the use line", async () => {
  const rod = { id: "r", name: "Rod", system: { uses: { per: "day", value: 2, max: 3 } } };
  rod.use = async () => ({});
  const ex = new ActionExecutor();
  ex._timers = makeClock();
  await ex.execute({ actionType: "item", itemId: "r", label: "Rod" }, makeActor({ items: [rod] }));
  assert.deepEqual(spoken, ["Rod. 2 of 3 left."]);
  postCard(rodCard({ result: "7 fire damage." }));
  assert.deepEqual(spoken, ["Rod. 2 of 3 left.", "Rod, 7 fire damage."]);
  postCard(rodCard({ result: "9 fire damage." })); // a second card is not this use's
  assert.equal(spoken.length, 2);
});

await t("a late card with no result and no notes says nothing more", async () => {
  const rod = { id: "r", name: "Rod", system: { uses: { per: "day", value: 2, max: 3 } } };
  rod.use = async () => ({});
  const ex = new ActionExecutor();
  ex._timers = makeClock();
  await ex.execute({ actionType: "item", itemId: "r", label: "Rod" }, makeActor({ items: [rod] }));
  postCard(rodCard());
  assert.deepEqual(spoken, ["Rod. 2 of 3 left."]);
  assert.equal(ex.hasPendingReader, false, "the late card did not end the reader");
});

await t("a late card with only rolled notes reads them after the name", async () => {
  const rod = { id: "r", name: "Rod", system: { uses: { per: "day", value: 2, max: 3 } } };
  rod.use = async () => ({});
  const ex = new ActionExecutor();
  ex._timers = makeClock();
  await ex.execute({ actionType: "item", itemId: "r", label: "Rod" }, makeActor({ items: [rod] }));
  postCard(rodCard({ content: '<span class="tag"><a class="inline-roll">Caster Level Check 14</a></span>' }));
  assert.equal(spoken.length, 2);
  assert.match(spoken[1], /^Rod\. .*Caster Level Check 14.*\.$/);
});

await t("a card that lands as the wait ends is still read once, in the line", async () => {
  const rod = { id: "r", name: "Rod", system: { uses: { per: "day", value: 2, max: 3 } } };
  rod.use = async () => ({});
  const ex = new ActionExecutor();
  ex._sleep = async () => { postCard(rodCard({ result: "7 fire damage." })); };
  await ex.execute({ actionType: "item", itemId: "r", label: "Rod" }, makeActor({ items: [rod] }));
  assert.deepEqual(spoken, ["Rod, 7 fire damage. 2 of 3 left."]);
});

await t("for someone else is said after the name", async () => {
  const rod = { id: "r", name: "Rod", system: { uses: { per: "day", value: 2, max: 3 } } };
  rod.use = async () => ({});
  const ex = new ActionExecutor();
  await ex._useItem(rod, makeActor({ items: [rod] }), null, { forOther: true });
  ex._pending?.off();
  assert.deepEqual(spoken, ["Rod, for someone else. 2 of 3 left."]);
});

// --- buffs switched on are said, by us or by Auto Buff (8.36, 4.6, 10.28) ---

/** A sheet buff whose update() fires updateItem, as Foundry does. */
function sheetBuff(name, actor) {
  return {
    id: `b-${name}`, type: "buff", name, parent: actor, system: { active: false }, updates: [],
    async update(changes) {
      this.updates.push(changes);
      this.system.active = changes["system.active"];
      for (const fn of hookHandlers.updateItem ?? []) fn(this, { system: { active: this.system.active } }, {}, "me");
    },
  };
}
/** makeActor's items, searchable by name as switchBuffOn needs. */
function buffActor(items) {
  const actor = makeActor({ items });
  actor.items.contents = items;
  actor.items.find = (fn) => items.find(fn);
  return actor;
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

await t("a buff potion's buff switching on is said after the use line", async () => {
  const items = [];
  const actor = buffActor(items);
  const shield = sheetBuff("Shield", actor);
  const potion = { id: "p", name: "Potion of Shield", type: "consumable", system: { quantity: 2 }, use: async () => ({}) };
  items.push(potion, shield);
  const ex = new ActionExecutor();
  ex._timers = makeClock();
  await ex.execute({ actionType: "item", itemId: "p", label: "Potion of Shield" }, actor);
  await settle();
  assert.deepEqual(shield.updates, [{ "system.active": true }]);
  assert.equal(spoken.length, 2, JSON.stringify(spoken));
  assert.match(spoken[0], /^Potion of Shield\b/);
  assert.equal(spoken[1], "Shield on.");
});

await t("a buff Auto Buff switches on during the use is said once, after the use line", async () => {
  const items = [];
  const actor = buffActor(items);
  const haste = sheetBuff("Haste", actor);
  // Auto Buff switches Haste on while PF1 is using the wand.
  const wand = { id: "w", name: "Wand of Haste", type: "consumable", system: { uses: { per: "charges", value: 9, max: 10 } },
    use: async () => { await haste.update({ "system.active": true }); return {}; } };
  items.push(wand, haste);
  const ex = new ActionExecutor();
  ex._timers = makeClock();
  await ex.execute({ actionType: "item", itemId: "w", label: "Wand of Haste" }, actor);
  await settle();
  assert.equal(spoken.length, 2, JSON.stringify(spoken));
  assert.match(spoken[0], /^Wand of Haste\b/);
  assert.equal(spoken[1], "Haste on.");
});

await t("execute passes forOther through an item command to the use line", async () => {
  const rod = { id: "r", name: "Rod", system: { uses: { per: "day", value: 2, max: 3 } } };
  rod.use = async () => ({});
  const ex = new ActionExecutor();
  await ex.execute({ actionType: "item", itemId: "r", label: "Rod" }, makeActor({ items: [rod] }), { source: "chat", forOther: true });
  ex._pending?.off();
  assert.equal(spoken.length, 1, JSON.stringify(spoken));
  assert.match(spoken[0], /for someone else\./);
});

await t("used for someone else, a buff switched on here is switched back off and not said", async () => {
  const items = [];
  const actor = buffActor(items);
  const shield = sheetBuff("Shield", actor);
  // Auto Buff switches the buff on the user's own sheet.
  const potion = { id: "p", name: "Potion of Shield", type: "consumable", system: { quantity: 2 },
    use: async () => { await shield.update({ "system.active": true }); return {}; } };
  items.push(potion, shield);
  const ex = new ActionExecutor();
  ex._timers = makeClock();
  await ex._useItem(potion, actor, null, { forOther: true });
  await settle();
  assert.deepEqual(shield.updates, [{ "system.active": true }, { "system.active": false }]);
  assert.equal(shield.system.active, false);
  assert.equal(spoken.length, 1, JSON.stringify(spoken));
  assert.match(spoken[0], /^Potion of Shield, for someone else\b/);
});

await t("the buff window lasts 4 s after the use, then hears nothing", async () => {
  const items = [];
  const actor = buffActor(items);
  const bless = sheetBuff("Bless", actor);
  const rod = { id: "r", name: "Rod", system: { uses: { per: "day", value: 2, max: 3 } }, use: async () => ({}) };
  items.push(rod, bless);
  const ex = new ActionExecutor();
  ex._timers = makeClock();
  await ex.execute({ actionType: "item", itemId: "r", label: "Rod" }, actor);
  ex._timers.advance(3999);
  await bless.update({ "system.active": true }); // Auto Buff, a little late
  assert.deepEqual(spoken, ["Rod. 2 of 3 left.", "Bless on."]);
  await bless.update({ "system.active": false });
  ex._timers.advance(1);
  const bark = sheetBuff("Barkskin", actor); items.push(bark);
  await bark.update({ "system.active": true });
  assert.deepEqual(spoken, ["Rod. 2 of 3 left.", "Bless on."]);
});

await t("a refused use closes the buff window at once", async () => {
  const items = [];
  const actor = buffActor(items);
  const shield = sheetBuff("Shield", actor);
  const potion = { id: "p", name: "Potion of Shield", type: "consumable", system: {}, use: async () => 3 };
  items.push(potion, shield);
  const ex = new ActionExecutor();
  ex._timers = makeClock();
  await ex.execute({ actionType: "item", itemId: "p", label: "Potion of Shield" }, actor);
  await shield.update({ "system.active": true });
  await settle();
  assert.deepEqual(spoken, ["None left."]);
});

await t("using the last of something says it was the last", async () => {
  const items = [];
  const scroll = { id: "s", name: "Scroll", system: {}, use: async () => { items.length = 0; return {}; } };
  items.push(scroll);
  const actor = makeActor({ items });
  const ex = new ActionExecutor();
  await ex.execute({ actionType: "item", itemId: "s", label: "Scroll" }, actor);
  ex._pending?.off();
  assert.equal(spoken.at(-1), "Scroll. That was the last one.");
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

/** A stub actor whose flags live in memory, like Foundry's. */
function stubActor(flags = {}) {
  return { id: "k1", name: "Kay", isOwner: true, flags,
    getFlag: (_m, k) => flags[k], setFlag: async (_m, k, v) => { flags[k] = v; },
    unsetFlag: async (_m, k) => { delete flags[k]; } };
}
const consumableItem = (id, label, created = 1) => ({ id: `item_${id}`, label, type: "action", actionType: "item",
  itemId: id, originalItem: { type: "consumable", _stats: { createdTime: created } } });
const coreSkill = (label, key) => ({ id: `skill_${key}`, label, type: "action", actionType: "skill", skillKey: key });
async function newResolver(items) {
  const { AbbreviationResolver } = await import("../scripts/chat/AbbreviationResolver.js");
  const res = new AbbreviationResolver();
  res._getAllActionItems = () => items;
  return res;
}

await t("a pool read keeps its name when the pool's own feature abbreviates the same (Bolty's Grit)", async () => {
  const res = await newResolver([
    { id: "item_grit", label: "Grit", type: "action", actionType: "item", itemId: "g" },
    { id: "pool_g", label: "Grit, left", type: "action", actionType: "pool_read", forceAbbrev: "grit", itemId: "g" },
    { id: "item_dead", label: "Deadeye", type: "action", actionType: "item", itemId: "d" },
  ]);
  await res.buildForActor(stubActor());
  assert.equal(res.resolve("grit").actionItem.actionType, "pool_read");
  assert.equal(res.resolve("gritu").actionItem.id, "item_grit");
  assert.equal(res.collisionCount, 0);
});

await t("an alias on a core item is cleared from the flag and spoken (1.2)", async () => {
  const res = await newResolver([coreSkill("Intimidate", "int"), consumableItem("k", "Scroll of Knock")]);
  const actor = stubActor({ chatAliases: { skill_int: "xyz", item_k: "skn" } });
  spoken.length = 0;
  await res.buildForActor(actor);
  assert.deepEqual(actor.flags.chatAliases, { item_k: "skn" });
  assert.deepEqual(spoken, [`Alias ${spellOut("xyz")} cleared. Intimidate is slash ${spellOut("itm")}.`]);
  assert.equal(res.resolve("itm").actionItem.id, "skill_int");
});

await t("reset speaks each command that moved back, once (1.15)", async () => {
  const res = await newResolver([consumableItem("k", "Scroll of Knock"), coreSkill("Perception", "per")]);
  const actor = stubActor({ chatAliases: { item_k: "skn" } });
  await res.buildForActor(actor);
  assert.equal(res.resolve("skn").actionItem.id, "item_k");
  spoken.length = 0;
  await res.clearAliases(actor);
  const now = res.reverseMap.get("item_k");
  assert.notEqual(now, "skn");
  assert.deepEqual(spoken, [`Scroll of Knock is now slash ${spellOut(now)}.`]);
});

await t("a move the rebuild itself reports and the reset diff finds is spoken once", async () => {
  const res = await newResolver([consumableItem("k", "Scroll of Knock"), coreSkill("Perception", "per")]);
  const actor = stubActor({ chatAliases: { item_k: "abc" } });
  await res.buildForActor(actor);
  // The remembered code is one the core now holds, so the rebuild moves it too.
  actor.flags.assignedCodes = { "item::scroll of knock": "per" };
  spoken.length = 0;
  await res.clearAliases(actor);
  const now = res.reverseMap.get("item_k");
  assert.equal(spoken.filter(x => x.startsWith("Scroll of Knock")).length, 1, JSON.stringify(spoken));
  assert.equal(spoken[0], `Scroll of Knock is now slash ${spellOut(now)}.`);
});

await t("more than five moves on reset: five lines, then a count", async () => {
  const names = ["Alpha", "Bravo", "Cobalt", "Delta", "Ember", "Fjord", "Garnet"];
  const res = await newResolver(names.map((n, i) => consumableItem(n.toLowerCase(), `Potion of ${n}`, i + 1)));
  const aliases = Object.fromEntries(names.map((n, i) => [`item_${n.toLowerCase()}`, `zq${i}`]));
  const actor = stubActor({ chatAliases: aliases });
  await res.buildForActor(actor);
  spoken.length = 0;
  await res.clearAliases(actor);
  assert.equal(spoken.length, 6, JSON.stringify(spoken));
  assert.equal(spoken.filter(x => / is now slash /.test(x)).length, 5);
  assert.equal(spoken[5], "2 more commands changed. Type slash f q m list.");
});

await t("10.21 changeover: a remembered potion code is dropped once, spoken once, and the rule flag is set", async () => {
  const potion = { ...consumableItem("pd", "Potion of Displacement"),
    originalItem: { type: "consumable", system: { subType: "potion" }, _stats: { createdTime: 1 } } };
  const res = await newResolver([potion, coreSkill("Perception", "per")]);
  const actor = stubActor({ assignedCodes: { "item::potion of displacement": "pd" } });
  spoken.length = 0;
  await res.buildForActor(actor);
  assert.equal(res.reverseMap.get("item_pd"), "pdisp");
  assert.equal(actor.flags.codeRule, 2);
  assert.deepEqual(spoken.filter(x => x.startsWith("Potion of Displacement")),
    [`Potion of Displacement is now slash ${spellOut("pdisp")}.`], JSON.stringify(spoken));
  spoken.length = 0;
  await res.buildForActor(actor);
  assert.equal(res.reverseMap.get("item_pd"), "pdisp");
  assert.deepEqual(spoken, [], JSON.stringify(spoken));
});

// --- one reader per command (8.46), late cards still read (8.44) ---

/** Hand a chat card to every createChatMessage listener, as Foundry does. */
function postCard(message) {
  for (const fn of hookHandlers.createChatMessage ?? []) fn(message);
}

/** Capture what the readers announce, in order. */
function hearReadouts() {
  const heard = [];
  const tts = game.folkenQuickMenu.tts;
  const saved = { attack: tts.announceAttackResult, roll: tts.announceRollResult };
  tts.announceAttackResult = (message) => heard.push(["card", message]);
  tts.announceRollResult = (total) => heard.push(["roll", total]);
  Object.defineProperty(heard, "restore", { value: () => { tts.announceAttackResult = saved.attack; tts.announceRollResult = saved.roll; } });
  return heard;
}

const rayCard = (total) => ({ system: { item: "Actor.a1.Item.d" }, rolls: [{ total }] });

await t("a skill typed while a spell rolls keeps both readers, each reads its own card (8.46)", async () => {
  const heard = hearReadouts();
  try {
    const book = spontaneousBook({ 6: 2 });
    const spell = { id: "d", name: "Disintegrate", system: { level: 6, spellbook: "primary" }, spellbook: book, use: async () => ({}) };
    const actor = makeActor({ items: [spell], books: { primary: book } });
    actor.rollSkill = async () => {};
    const ex = new ActionExecutor();
    await ex.execute({ actionType: "spell", itemId: "d", label: "Disintegrate" }, actor);
    await ex.execute({ actionType: "skill", skillKey: "kar", label: "Arcana" }, actor);
    assert.equal(ex._readers.size, 2, "the skill dropped the spell's reader");
    assert.equal(ex.hasPendingReader, true);
    assert.ok(ex._itemReaderFor("d"), "the spell's reader is not an item reader");

    postCard({ rolls: [{ total: 32 }] }); // Arcana's card: no item
    const ray = rayCard(51);
    postCard(ray);                         // the slow spell's card
    assert.deepEqual(heard, [["roll", 32], ["card", ray]]);
    assert.equal(ex.hasPendingReader, false);
  } finally { heard.restore(); }
});

await t("a generic reader leaves a card some item reader is waiting for", async () => {
  const heard = hearReadouts();
  try {
    const book = spontaneousBook({ 6: 2 });
    const spell = { id: "d", name: "Disintegrate", system: { level: 6, spellbook: "primary" }, spellbook: book, use: async () => ({}) };
    const actor = makeActor({ items: [spell], books: { primary: book } });
    actor.rollSkill = async () => {};
    const ex = new ActionExecutor();
    await ex.execute({ actionType: "spell", itemId: "d", label: "Disintegrate" }, actor);
    await ex.execute({ actionType: "skill", skillKey: "kar", label: "Arcana" }, actor);
    const ray = rayCard(51);
    postCard(ray); // the spell's card lands first
    assert.deepEqual(heard, [["card", ray]], "the skill's reader took the spell's card");
    postCard({ rolls: [{ total: 32 }] });
    assert.deepEqual(heard, [["card", ray], ["roll", 32]]);
  } finally { heard.restore(); }
});

await t("two casts of one spell get a card each, not the first card twice", async () => {
  const heard = hearReadouts();
  try {
    const book = spontaneousBook({ 6: 2 });
    const spell = { id: "d", name: "Disintegrate", system: { level: 6, spellbook: "primary" }, spellbook: book, use: async () => ({}) };
    const actor = makeActor({ items: [spell], books: { primary: book } });
    const ex = new ActionExecutor();
    await ex.execute({ actionType: "spell", itemId: "d", label: "Disintegrate" }, actor);
    await ex.execute({ actionType: "spell", itemId: "d", label: "Disintegrate" }, actor);
    const first = rayCard(40), second = rayCard(22);
    postCard(first);
    postCard(second);
    assert.deepEqual(heard, [["card", first], ["card", second]]);
    assert.equal(ex.hasPendingReader, false);
  } finally { heard.restore(); }
});

await t("an attack waits for its own weapon's card", async () => {
  const heard = hearReadouts();
  try {
    const punch = { id: "p", name: "Punch", system: {}, use: async () => ({}) };
    const ex = new ActionExecutor();
    await ex.execute({ actionType: "attack", itemId: "p", label: "Punch" }, makeActor({ items: [punch] }));
    assert.ok(ex._itemReaderFor("p"), "the attack's reader is not an item reader");
    postCard({ rolls: [{ total: 9 }] }); // someone's plain roll: not the punch
    assert.deepEqual(heard, []);
    const card = { system: { item: "Actor.a1.Item.p" }, rolls: [{ total: 18 }] };
    postCard(card);
    assert.deepEqual(heard, [["card", card]]);
  } finally { heard.restore(); }
});

/** Timers on a hand-advanced clock, handed to an executor as ex._timers. */
function makeClock() {
  let now = 0;
  const due = [];
  let nextId = 1;
  return {
    set(fn, ms) { const id = nextId++; due.push({ id, at: now + ms, fn }); return id; },
    clear(id) { const i = due.findIndex(d => d.id === id); if (i >= 0) due.splice(i, 1); },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        due.sort((a, b) => a.at - b.at);
        const next = due[0];
        if (!next || next.at > end) break;
        due.shift();
        now = next.at;
        next.fn();
      }
      now = end;
    },
  };
}

const disintegrate = () => {
  const book = spontaneousBook({ 6: 2 });
  const spell = { id: "d", name: "Disintegrate", system: { level: 6, spellbook: "primary" }, spellbook: book, use: async () => ({}) };
  return makeActor({ items: [spell], books: { primary: book } });
};

await t("a slow spell says once, at 8 s, that it is waiting, and its card is still read (8.44)", async () => {
  const heard = hearReadouts();
  try {
    const ex = new ActionExecutor();
    ex._timers = makeClock();
    await ex.execute({ actionType: "spell", itemId: "d", label: "Disintegrate" }, disintegrate());
    ex._timers.advance(7000); // inside Josh's 3.4-6.2 s dice window: quiet
    assert.deepEqual(spoken, []);
    ex._timers.advance(1000);
    assert.deepEqual(spoken, ["Disintegrate, waiting on the dice."]);
    ex._timers.advance(60000);
    const ray = rayCard(51);
    postCard(ray);
    assert.deepEqual(heard, [["card", ray]]);
    assert.deepEqual(spoken, ["Disintegrate, waiting on the dice."]);
  } finally { heard.restore(); }
});

await t("a spell whose card never comes says no result, once, after ten minutes", async () => {
  const heard = hearReadouts();
  try {
    const ex = new ActionExecutor();
    ex._timers = makeClock();
    await ex.execute({ actionType: "spell", itemId: "d", label: "Disintegrate" }, disintegrate());
    ex._timers.advance(599999);
    assert.deepEqual(spoken, ["Disintegrate, waiting on the dice."]);
    ex._timers.advance(1);
    assert.deepEqual(spoken, ["Disintegrate, waiting on the dice.", "Disintegrate, no result."]);
    assert.equal(ex.hasPendingReader, false);
    ex._timers.advance(600000);
    postCard(rayCard(51));
    assert.deepEqual(heard, []);
    assert.equal(spoken.length, 2);
  } finally { heard.restore(); }
});

await t("a skill whose card never came is dropped by the next skill, which reads the card", async () => {
  const heard = hearReadouts();
  try {
    const actor = makeActor();
    actor.rollSkill = async () => {};
    const ex = new ActionExecutor();
    ex._timers = makeClock();
    await ex.execute({ actionType: "skill", skillKey: "per", label: "Perception" }, actor); // no card
    const first = ex._pending;
    await ex.execute({ actionType: "skill", skillKey: "kar", label: "Arcana" }, actor);
    const second = ex._pending;
    assert.equal(first.isPending(), false, "the stale generic reader is still armed");
    assert.equal(second.isPending(), true);
    postCard({ rolls: [{ total: 15 }] });
    assert.deepEqual(heard, [["roll", 15]]);
    assert.deepEqual(spoken, []);
    assert.equal(ex.hasPendingReader, false, "the second reader never got its card");
  } finally { heard.restore(); }
});

await t("a skill does not drop a spell's reader", async () => {
  const actor = disintegrate();
  actor.rollSkill = async () => {};
  const ex = new ActionExecutor();
  ex._timers = makeClock();
  await ex.execute({ actionType: "spell", itemId: "d", label: "Disintegrate" }, actor);
  await ex.execute({ actionType: "skill", skillKey: "per", label: "Perception" }, actor);
  await ex.execute({ actionType: "skill", skillKey: "kar", label: "Arcana" }, actor);
  assert.ok(ex._itemReaderFor("d"));
  assert.equal(ex._readers.size, 2);
});

// --- Haste reaches allies within 15 feet (10.28) ---

function allyToken(name, disposition, feet, { owned = true, buff = null } = {}) {
  const actor = { name, isOwner: owned, itemTypes: { buff: buff ? [buff] : [] } };
  return { document: { disposition }, actor, feet, center: { feet } };
}
function stubCanvas(tokens) {
  globalThis.canvas = {
    ready: true,
    tokens: { placeables: tokens },
    grid: { measurePath: ([a, b]) => ({ distance: Math.abs(b.feet - a.feet) }) },
  };
}

await t("a group spell switches on an owned ally's buff and names them after the use line", async () => {
  const hasteBuff = { name: "Haste", updates: [], async update(c) { this.updates.push(c); } };
  const bob = allyToken("Bob", 1, 10, { buff: hasteBuff });
  const orc = allyToken("Orc", -1, 5, { owned: false });
  const actor = makeActor();
  const casterToken = allyToken("Caster", 1, 0);
  actor.getActiveTokens = () => [casterToken];
  stubCanvas([casterToken, bob, orc]);
  try {
    const spell = { id: "h", name: "Haste", type: "spell",
      system: { actions: { a: { range: { units: "close" }, target: { value: "one creature/level" } } } },
      use: async () => ({}) };
    const ex = new ActionExecutor();
    ex._timers = makeClock();
    await ex._useItem(spell, actor);
    await ex._lastAllies;
    ex._pending?.off();
    assert.deepEqual(hasteBuff.updates, [{ "system.active": true }]);
    assert.equal(spoken.length, 2, JSON.stringify(spoken));
    assert.match(spoken[0], /^Haste/);
    assert.equal(spoken[1], "Haste on for Bob.");
  } finally { delete globalThis.canvas; }
});

await t("a spell that is not a group buff leaves allies alone", async () => {
  const shieldBuff = { name: "Shield", updates: [], async update(c) { this.updates.push(c); } };
  const bob = allyToken("Bob", 1, 10, { buff: shieldBuff });
  const actor = makeActor();
  const casterToken = allyToken("Caster", 1, 0);
  actor.getActiveTokens = () => [casterToken];
  stubCanvas([casterToken, bob]);
  try {
    const spell = { id: "s", name: "Shield", type: "spell",
      system: { actions: { a: { range: { units: "personal" }, target: { value: "you" } } } },
      use: async () => ({}) };
    const ex = new ActionExecutor();
    ex._timers = makeClock();
    await ex._useItem(spell, actor);
    await ex._lastAllies;
    ex._pending?.off();
    assert.deepEqual(shieldBuff.updates, []);
    assert.equal(spoken.length, 1, JSON.stringify(spoken));
  } finally { delete globalThis.canvas; }
});

await t("one ally's failing update still switches the next and the report names only the second", async () => {
  const bad = { name: "Haste", async update() { throw new Error("denied"); } };
  const good = { name: "haste ", updates: [], async update(c) { this.updates.push(c); } };
  const bob = allyToken("Bob", 1, 5, { buff: bad });
  const carol = allyToken("Carol", 1, 10, { buff: good });
  const carolAgain = allyToken("Carol", 1, 12, { buff: good });
  bob.actor.id = "bob"; carol.actor.id = "carol"; carolAgain.actor.id = "carol";
  const actor = makeActor();
  const casterToken = allyToken("Caster", 1, 0);
  actor.getActiveTokens = () => [casterToken];
  stubCanvas([casterToken, bob, carol, carolAgain]);
  const warn = console.warn; console.warn = () => {};
  try {
    const spell = { id: "h", name: "Haste", type: "spell",
      system: { actions: { a: { range: { units: "close" }, target: { value: "one creature/level" } } } },
      use: async () => ({}) };
    const ex = new ActionExecutor();
    ex._timers = makeClock();
    await ex._useItem(spell, actor);
    await ex._lastAllies;
    ex._pending?.off();
    assert.deepEqual(good.updates, [{ "system.active": true }]);
    assert.equal(spoken.at(-1), "Haste on for Carol.", JSON.stringify(spoken));
  } finally { console.warn = warn; delete globalThis.canvas; }
});

await t("a chat command of any type plays the accept blip, a menu one does not (10.12)", async () => {
  const actor = makeActor();
  actor.rollSkill = async () => {};
  const ex = new ActionExecutor();
  const earcons = [];
  ex._earcon = (k) => earcons.push(k);
  await ex.execute({ actionType: "skill", skillKey: "per", label: "Perception" }, actor, { source: "chat" });
  assert.ok(earcons.includes("ack"), JSON.stringify(earcons));
  earcons.length = 0;
  await ex.execute({ actionType: "skill", skillKey: "per", label: "Perception" }, actor, { source: "menu" });
  assert.equal(earcons.includes("ack"), false);
});

console.log(`\n${pass} assertions passed.`);
