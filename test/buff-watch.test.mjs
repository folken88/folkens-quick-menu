/**
 * A buff that switches on during a use is said, whoever switched it: us, or
 * Tobias's Auto Buff (8.36, 4.6). Used for someone else ("o"), it is switched
 * back off and nothing is said (10.28).
 * Run: node test/buff-watch.test.mjs
 */
import assert from "node:assert/strict";
import { BuffWatch } from "../scripts/executor/BuffWatch.js";

let pass = 0;
const t = async (name, fn) => { await fn(); pass++; console.log("  ok -", name); };

/** Foundry's Hooks: on() hands back a number, off(event, id) removes it. */
function fakeHooks() {
  const listeners = new Map();
  let nextId = 1;
  return {
    on(event, fn) { const id = nextId++; listeners.set(id, { event, fn }); return id; },
    off(event, id) { listeners.delete(id); },
    fire(event, ...args) { for (const { event: e, fn } of [...listeners.values()]) if (e === event) fn(...args); },
    get live() { return listeners.size; },
  };
}

/** A hand-advanced clock: nothing real is left running. */
function fakeTimers() {
  const due = new Map();
  let nextId = 1;
  return {
    set(fn, ms) { const id = nextId++; due.set(id, { fn, ms }); return id; },
    clear(id) { due.delete(id); },
    runAll() { for (const [id, { fn }] of [...due]) { due.delete(id); fn(); } },
    get pending() { return due.size; },
    lastMs() { return [...due.values()].at(-1)?.ms; },
  };
}

const buff = (name, actorId = "a1", extra = {}) => ({
  type: "buff", name, parent: { id: actorId }, system: { active: true },
  updates: [], async update(c) { this.updates.push(c); }, ...extra,
});
const on = { system: { active: true } };

await t("a buff Auto Buff switches on is said once", () => {
  const hooks = fakeHooks(); const timers = fakeTimers();
  const said = []; const w = new BuffWatch({ hooks, actorId: "a1", speak: l => said.push(l), timers }); w.open();
  const haste = buff("Haste");
  hooks.fire("updateItem", haste, on);
  hooks.fire("updateItem", haste, on);
  assert.deepEqual(said, ["Haste on."]);
});

await t("another actor's buff is ignored", () => {
  const hooks = fakeHooks(); const timers = fakeTimers();
  const said = []; new BuffWatch({ hooks, actorId: "a1", speak: l => said.push(l), timers }).open();
  hooks.fire("updateItem", buff("Haste", "a2"), on);
  hooks.fire("createItem", buff("Fly", "a2"));
  assert.deepEqual(said, []);
});

await t("only a buff switching ON counts: off, other fields and non-buffs are silent", () => {
  const hooks = fakeHooks(); const timers = fakeTimers();
  const said = []; new BuffWatch({ hooks, actorId: "a1", speak: l => said.push(l), timers }).open();
  hooks.fire("updateItem", buff("Haste"), { system: { active: false } });
  hooks.fire("updateItem", buff("Haste"), { name: "Haste" });
  hooks.fire("updateItem", { ...buff("Shield"), type: "consumable" }, on);
  hooks.fire("createItem", buff("Bless", "a1", { system: { active: false } }));
  assert.deepEqual(said, []);
});

await t("a buff created active (from the compendium) is said", () => {
  const hooks = fakeHooks(); const timers = fakeTimers();
  const said = []; new BuffWatch({ hooks, actorId: "a1", speak: l => said.push(l), timers }).open();
  hooks.fire("createItem", buff("Fly"), {}, "me");
  hooks.fire("updateItem", buff("Fly"), on); // Auto Buff and us both: once per name
  assert.deepEqual(said, ["Fly on."]);
});

await t("in revert mode the buff is switched back off and nothing is said", async () => {
  const hooks = fakeHooks(); const timers = fakeTimers();
  const said = []; const w = new BuffWatch({ hooks, actorId: "a1", speak: l => said.push(l), timers }); w.open({ revert: true });
  const disp = buff("Displacement");
  hooks.fire("updateItem", disp, on); await Promise.resolve();
  hooks.fire("updateItem", disp, on); await Promise.resolve();
  assert.deepEqual(disp.updates, [{ "system.active": false }]); assert.deepEqual(said, []);
});

await t("the window closes itself after windowMs; close() removes the hooks and is idempotent", () => {
  const hooks = fakeHooks(); const timers = fakeTimers();
  const said = []; const w = new BuffWatch({ hooks, actorId: "a1", speak: l => said.push(l), timers });
  w.open();
  assert.equal(timers.lastMs(), 4000, "the default window is 4 s");
  assert.equal(hooks.live, 2);
  timers.runAll();
  assert.equal(hooks.live, 0);
  hooks.fire("updateItem", buff("Haste"), on);
  assert.deepEqual(said, []);

  const h = w.open({ windowMs: 1000 });
  assert.equal(timers.lastMs(), 1000);
  h.close(); h.close();
  assert.equal(hooks.live, 0);
  assert.equal(timers.pending, 0, "closing early clears the timer");
});

await t("a second open() closes the first window; each window says a name once", () => {
  const hooks = fakeHooks(); const timers = fakeTimers();
  const said = []; const w = new BuffWatch({ hooks, actorId: "a1", speak: l => said.push(l), timers });
  const first = w.open({ revert: true });
  w.open();
  assert.equal(hooks.live, 2, "only the second window listens");
  assert.equal(timers.pending, 1);
  hooks.fire("updateItem", buff("Haste"), on);
  assert.deepEqual(said, ["Haste on."], "the second window is normal mode, not the first's revert");
  first.close(); // the old handle does not close the new window
  assert.equal(hooks.live, 2);
});

await t("a failed revert is not thrown into Foundry's hook loop", async () => {
  const hooks = fakeHooks(); const timers = fakeTimers();
  const origWarn = console.warn; const warned = []; console.warn = (...a) => warned.push(a);
  try {
    new BuffWatch({ hooks, actorId: "a1", speak: () => {}, timers }).open({ revert: true });
    hooks.fire("updateItem", buff("Haste", "a1", { async update() { throw new Error("no permission"); } }), on);
    await new Promise(r => setImmediate(r));
    assert.equal(warned.length, 1);
  } finally { console.warn = origWarn; }
});

console.log(`${pass} assertions passed.`);
