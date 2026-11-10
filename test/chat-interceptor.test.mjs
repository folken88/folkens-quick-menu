/**
 * The word after an item command through the real chat interceptor (10.26, 10.11).
 * Run: node test/chat-interceptor.test.mjs
 */
import assert from "node:assert/strict";

const spoken = [];
const calls = [];
globalThis.window = globalThis;
globalThis.Hooks = { once() {}, on() { return 1; }, off() {} };
globalThis.ChatMessage = { create() {} };
globalThis.foundry = { utils: { getProperty: (o, p) => p.split(".").reduce((x, k) => x?.[k], o) } };
const executor = { execute: (...a) => { calls.push(a); }, hasPendingReader: false,
  castFromSlot: (...a) => { calls.push(["castFromSlot", ...a]); },
  withdrawUpcast: () => false, hasPendingUpcast: false, recentlyExpiredUpcast: false };
const chainLightning = { id: "c", name: "Chain Lightning" };
const actor = { id: "a", name: "Ser", items: { get: (id) => (id === "c" ? chainLightning : null) } };
const items = {
  pcmw: { actionType: "item", itemId: "p", label: "Potion of Cure Moderate Wounds" },
  per: { actionType: "skill", skillId: "per", label: "Perception" },
  "6cl": { actionType: "spell", itemId: "c", label: "Chain Lightning" },
};
globalThis.game = {
  user: { id: "me" },
  // debugMode off keeps the new file free of DEBUG noise; commands on.
  settings: { get: (_m, key) => key !== "debugMode" },
  actionExecutor: executor,
  folkenQuickMenu: {
    actionExecutor: executor,
    tts: { liveVolume: 1, speak: (text) => spoken.push(text) },
    menuManager: { getCurrentActor: () => actor },
  },
};
globalThis.ui = { notifications: { warn() {}, error() {}, info() {} } };

const { ChatCommandInterceptor } = await import("../scripts/chat/ChatCommandInterceptor.js");
const resolver = {
  isBuilt: true,
  resolve: (cmd) => items[cmd] ? { found: true, actionItem: items[cmd] } : { found: false },
};
// Foundry's own parser: every command here is one it does not know.
const chatLog = { constructor: { parse: () => ["invalid"] } };
const icpt = new ChatCommandInterceptor(resolver, executor);

let pass = 0;
const t = (name, fn) => {
  spoken.length = 0; calls.length = 0;
  fn(); pass++; console.log("  ok -", name);
};
const send = (text) => icpt._handleChatMessage(chatLog, text, {});

t("a word that is not o is refused aloud, nothing is used, the message is consumed", () => {
  assert.equal(send("/pcmw 0"), false);
  assert.deepEqual(spoken, ["0? Not an option. Say o for someone else."]);
  assert.equal(calls.length, 0);
});

t("o uses the item for someone else", () => {
  assert.equal(send("/pcmw o"), false);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], [items.pcmw, actor, { source: "chat", forOther: true }]);
  assert.deepEqual(spoken, []);
});

t("no word uses it for yourself", () => {
  assert.equal(send("/pcmw"), false);
  assert.deepEqual(calls[0], [items.pcmw, actor, { source: "chat", forOther: false }]);
});

t("a skill takes no options, o included", () => {
  assert.equal(send("/per o"), false);
  assert.deepEqual(spoken, ["Perception takes no options."]);
  assert.equal(calls.length, 0);
});

t("a typed up-cast with o casts it for someone else", () => {
  assert.equal(send("/6cl7 o"), false);
  assert.deepEqual(calls, [["castFromSlot", chainLightning, actor, 7, { forOther: true }]]);
  assert.deepEqual(spoken, []);
});

t("a typed up-cast with no word casts it for yourself", () => {
  assert.equal(send("/6cl7"), false);
  assert.deepEqual(calls, [["castFromSlot", chainLightning, actor, 7, { forOther: false }]]);
});

t("a typed up-cast with any other word is refused aloud and nothing is cast", () => {
  assert.equal(send("/6cl7 x"), false);
  assert.deepEqual(spoken, ["x? Not an option. Say o for someone else."]);
  assert.equal(calls.length, 0);
});

console.log(`${pass} passed`);
