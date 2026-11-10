/**
 * The announcement lifecycle.
 *
 * These exist because this code broke twice and neither break was caught:
 * 0.12.0 left listeners armed forever, and 0.13.0 called id.off() on the number
 * Hooks.on returns, which silenced every roll result in the game. Both times
 * the check was a count of call sites rather than anything that ran.
 *
 * Run: node test/announcer.test.mjs
 */
import assert from "node:assert/strict";
import { armAnnouncement } from "../scripts/executor/Announcer.js";

let pass = 0;
const t = (name, fn) => {
  const ok = () => { pass++; console.log("  ok -", name); };
  const r = fn();
  return r && typeof r.then === "function" ? r.then(ok) : ok();
};

/** A stand-in for Foundry's Hooks, which hands back a NUMBER from on(). */
function fakeHooks() {
  const listeners = new Map();
  let nextId = 1;
  return {
    offCalls: [],
    on(event, fn) { const id = nextId++; listeners.set(id, { event, fn }); return id; },
    off(event, id) { this.offCalls.push([event, id]); listeners.delete(id); },
    emit(event, payload) {
      for (const { event: e, fn } of [...listeners.values()]) if (e === event) fn(payload);
    },
    get live() { return listeners.size; },
  };
}

function fakeTimers() {
  const pending = new Map();
  let nextId = 1;
  return {
    set(fn, ms) { const id = nextId++; pending.set(id, { fn, ms }); return id; },
    clear(id) { pending.delete(id); },
    fire(id) { const e = pending.get(id); pending.delete(id); e?.fn(); },
    fireAll() { for (const id of [...pending.keys()]) this.fire(id); },
    get count() { return pending.size; },
    get lastDelay() { return [...pending.values()].at(-1)?.ms ?? null; },
  };
}

// --- the 0.13.0 regression: every roll was silent ---

t("our own card is announced", () => {
  const hooks = fakeHooks(), timers = fakeTimers();
  let heard = null;
  armAnnouncement({ hooks, timers, isOwn: () => true, handler: (m) => { heard = m; } });
  hooks.emit("createChatMessage", { id: "card" });
  assert.deepEqual(heard, { id: "card" });
});

t("unregistering uses hooks.off(event, id), not id.off()", () => {
  // The exact 0.13.0 break: Hooks.on returns a number, and calling .off() on a
  // number throws inside the hook before the handler ever runs.
  const hooks = fakeHooks(), timers = fakeTimers();
  let heard = false;
  armAnnouncement({ hooks, timers, handler: () => { heard = true; } });
  hooks.emit("createChatMessage", {});
  assert.equal(heard, true, "handler never ran");
  assert.equal(hooks.offCalls.length, 1);
  assert.equal(hooks.offCalls[0][0], "createChatMessage");
  assert.equal(typeof hooks.offCalls[0][1], "number");
  assert.equal(hooks.live, 0, "listener was left registered");
});

t("the listener is gone after it fires, so a roll cannot leak one", () => {
  const hooks = fakeHooks(), timers = fakeTimers();
  armAnnouncement({ hooks, timers, handler: () => {} });
  assert.equal(hooks.live, 1);
  hooks.emit("createChatMessage", {});
  assert.equal(hooks.live, 0);
});

t("it only ever announces once", () => {
  const hooks = fakeHooks(), timers = fakeTimers();
  let calls = 0;
  armAnnouncement({ hooks, timers, handler: () => { calls++; } });
  hooks.emit("createChatMessage", {});
  hooks.emit("createChatMessage", {});
  assert.equal(calls, 1);
});

// --- the 0.12.0 bug: reading out another player's roll ---

t("someone else's card is ignored and we keep waiting", () => {
  const hooks = fakeHooks(), timers = fakeTimers();
  const heard = [];
  armAnnouncement({
    hooks, timers,
    isOwn: (m) => m.author === "me",
    handler: (m) => heard.push(m.id),
  });
  hooks.emit("createChatMessage", { id: "josh", author: "josh" });
  assert.deepEqual(heard, [], "announced another player's roll");
  assert.equal(hooks.live, 1, "should still be waiting for ours");
  hooks.emit("createChatMessage", { id: "mine", author: "me" });
  assert.deepEqual(heard, ["mine"]);
});

// --- giving up ---

t("the timer unregisters the listener when no card arrives", () => {
  const hooks = fakeHooks(), timers = fakeTimers();
  armAnnouncement({ hooks, timers, handler: () => {} });
  assert.equal(hooks.live, 1);
  timers.fireAll();
  assert.equal(hooks.live, 0, "a roll with no card left its listener armed");
});

t("the timer is cancelled once the card arrives", () => {
  const hooks = fakeHooks(), timers = fakeTimers();
  armAnnouncement({ hooks, timers, handler: () => {} });
  assert.equal(timers.count, 1);
  hooks.emit("createChatMessage", {});
  assert.equal(timers.count, 0);
});

t("the window is long enough for a slow attack card", () => {
  // Josh measured key-to-card at 3.4 to 6.2 seconds on Punch, because Dice So
  // Nice animates first and PF1 creates the card only when the dice finish.
  const hooks = fakeHooks(), timers = fakeTimers();
  armAnnouncement({ hooks, timers, handler: () => {} });
  assert.ok(timers.lastDelay >= 10000, `window was only ${timers.lastDelay}ms`);
});

t("cancelling early removes the listener and the timer", () => {
  const hooks = fakeHooks(), timers = fakeTimers();
  const a = armAnnouncement({ hooks, timers, handler: () => {} });
  a.off();
  assert.equal(hooks.live, 0);
  assert.equal(timers.count, 0);
  assert.equal(a.isPending(), false);
});

t("cancelling twice is harmless", () => {
  const hooks = fakeHooks(), timers = fakeTimers();
  const a = armAnnouncement({ hooks, timers, handler: () => {} });
  a.off(); a.off();
  assert.equal(hooks.offCalls.length, 1);
});

t("a throwing handler still leaves nothing registered", () => {
  const hooks = fakeHooks(), timers = fakeTimers();
  armAnnouncement({ hooks, timers, handler: () => { throw new Error("boom"); } });
  hooks.emit("createChatMessage", {});
  assert.equal(hooks.live, 0);
});

// --- the default plumbing, not just the fakes ---

t("it works with the default timers, which nothing else exercises", async () => {
  // The browser default was a bare setTimeout reference, which throws
  // "Illegal invocation" when called as timers.set(). Node does not reproduce
  // that, so this at least keeps the default path running in the suite.
  const hooks = fakeHooks();
  let heard = false;
  const a = armAnnouncement({ hooks, handler: () => { heard = true; }, timeout: 50 });
  hooks.emit("createChatMessage", {});
  assert.equal(heard, true);
  assert.equal(a.isPending(), false);
});

t("the default timers really do fire and unregister", async () => {
  const hooks = fakeHooks();
  armAnnouncement({ hooks, handler: () => {}, timeout: 10 });
  assert.equal(hooks.live, 1);
  await new Promise(r => setTimeout(r, 40));
  assert.equal(hooks.live, 0, "default timeout never unregistered the listener");
});

// --- one reader per command (8.46) and late cards (8.44) ---

/** Timers on a hand-advanced clock, so a ten-minute window costs nothing. */
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
    get count() { return due.length; },
  };
}

t("two readers each take their own card, whatever the order (8.46)", () => {
  const hooks = fakeHooks(), timers = makeClock();
  const got = [];
  const ray = armAnnouncement({ hooks, timers, match: m => m.item === "ray", handler: m => got.push("ray:" + m.total) });
  const arcana = armAnnouncement({ hooks, timers, match: m => m.item === undefined, handler: m => got.push("arcana:" + m.total) });
  hooks.emit("createChatMessage", { total: 32 });             // Arcana's card, no item
  hooks.emit("createChatMessage", { item: "ray", total: 51 }); // the slow spell's card
  assert.deepEqual(got, ["arcana:32", "ray:51"]);
  assert.equal(ray.isPending(), false); assert.equal(arcana.isPending(), false);
});

t("a card that does not match leaves the reader armed", () => {
  const hooks = fakeHooks(), timers = makeClock();
  const got = [];
  const r = armAnnouncement({ hooks, timers, match: m => m.item === "ray", handler: m => got.push(m.total) });
  hooks.emit("createChatMessage", { total: 3 });
  assert.deepEqual(got, []);
  assert.equal(r.isPending(), true);
  assert.equal(hooks.live, 1);
});

await t("a late card is still read, and the wait is said once (8.44)", async () => {
  const hooks = fakeHooks(), timers = makeClock();
  const said = []; const got = [];
  const r = armAnnouncement({ hooks, timers, match: () => true, handler: m => got.push(m.total), timeout: 600000, waitMs: 3000, onWaiting: () => said.push("waiting") });
  timers.advance(3000); timers.advance(3000);
  hooks.emit("createChatMessage", { total: 7 });
  assert.deepEqual(said, ["waiting"]); assert.deepEqual(got, [7]);
  assert.equal((await r.done).total, 7); // done resolves to the matched message
  assert.equal(timers.count, 0, "a timer outlived the reader");
});

t("no wait line when the card beats waitMs", () => {
  const hooks = fakeHooks(), timers = makeClock();
  const said = [];
  armAnnouncement({ hooks, timers, handler: () => {}, timeout: 600000, waitMs: 3000, onWaiting: () => said.push("waiting") });
  timers.advance(1000);
  hooks.emit("createChatMessage", {});
  timers.advance(5000);
  assert.deepEqual(said, []);
  assert.equal(timers.count, 0);
});

await t("done resolves to null when the reader is switched off before a card", async () => {
  const hooks = fakeHooks(), timers = makeClock();
  const r = armAnnouncement({ hooks, timers, handler: () => {} });
  r.off();
  assert.equal(await r.done, null);
});

await t("done resolves to null on timeout", async () => {
  const hooks = fakeHooks(), timers = makeClock();
  const r = armAnnouncement({ hooks, timers, handler: () => {}, timeout: 600000 });
  timers.advance(600000);
  assert.equal(r.isPending(), false);
  assert.equal(hooks.live, 0);
  assert.equal(await r.done, null);
});

console.log(`\n${pass} assertions passed.`);
