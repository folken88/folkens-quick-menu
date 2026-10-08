/**
 * Which keys the open menu may consume.
 *
 * This is the rule that made the menu look dead to Josh, so it is tested rather
 * than left inside an event handler. Run: node test/menu-keys.test.mjs
 */
import assert from "node:assert/strict";
import { menuClaimsKey, isDuplicateKeydown, MENU_KEYS } from "../scripts/input/MenuKeys.js";

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log("  ok -", name); };
const key = (code, mods = {}) => ({ code, ctrlKey: false, altKey: false, metaKey: false, ...mods });

// --- the keys the menu drives on ---

t("plain arrows are claimed", () => {
  for (const c of ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]) {
    assert.equal(menuClaimsKey(key(c)), true, c);
  }
});

t("Enter, Escape and Backspace are claimed", () => {
  for (const c of ["Enter", "NumpadEnter", "Escape", "Backspace"]) {
    assert.equal(menuClaimsKey(key(c)), true, c);
  }
});

t("the number row and the numpad are claimed", () => {
  for (let i = 0; i <= 9; i++) {
    assert.equal(menuClaimsKey(key(`Digit${i}`)), true, `Digit${i}`);
    assert.equal(menuClaimsKey(key(`Numpad${i}`)), true, `Numpad${i}`);
  }
});

t("the menu action letters are claimed", () => {
  for (const c of ["KeyF", "KeyP", "KeyU", "KeyR", "Slash"]) {
    assert.equal(menuClaimsKey(key(c)), true, c);
  }
});

// --- everything else must pass through ---

t("Tab is NOT swallowed", () => assert.equal(menuClaimsKey(key("Tab")), false));

t("ordinary letters the menu does not use pass through", () => {
  for (const c of ["KeyA", "KeyS", "KeyT", "KeyZ", "Space"]) {
    assert.equal(menuClaimsKey(key(c)), false, c);
  }
});

t("function keys pass through", () => {
  for (const c of ["F1", "F5", "F11"]) assert.equal(menuClaimsKey(key(c)), false, c);
});

t("Home, End and the rest pass through", () => {
  for (const c of ["Home", "End", "Insert", "Delete", "ContextMenu"]) {
    assert.equal(menuClaimsKey(key(c)), false, c);
  }
});

// --- modifiers belong to the OS, the browser and assistive tools ---

t("a modified arrow is never claimed, whichever modifier it is", () => {
  assert.equal(menuClaimsKey(key("ArrowDown", { ctrlKey: true })), false);
  assert.equal(menuClaimsKey(key("ArrowDown", { altKey: true })), false);
  assert.equal(menuClaimsKey(key("ArrowDown", { metaKey: true })), false);
  assert.equal(menuClaimsKey(key("ArrowDown", { ctrlKey: true, altKey: true })), false);
});

t("a modified menu letter is never claimed - Ctrl+R must still reload", () =>
  assert.equal(menuClaimsKey(key("KeyR", { ctrlKey: true })), false));

t("Caps Lock as a screen-reader modifier needs no special case", () => {
  // Josh runs VoiceOver on Caps Lock because Pro Tools took Ctrl+Option.
  // Caps Lock is not a KeyboardEvent modifier at all, so there is nothing to
  // detect - which is exactly why the rule is "claim only what we use" rather
  // than "hand back the screen reader's chord".
  assert.equal(menuClaimsKey(key("CapsLock")), false);
  assert.equal(menuClaimsKey(key("ArrowDown")), true);
});

// --- shape ---

t("nothing outside the declared set is claimed", () => {
  for (const c of ["KeyQ", "BracketLeft", "Minus", "Equal", "Backslash"]) {
    assert.equal(MENU_KEYS.has(c), false, c);
    assert.equal(menuClaimsKey(key(c)), false, c);
  }
});

t("the TTS and jump-to-chat keys are deliberately not claimed by the menu", () => {
  // [ ] - = and Backslash are handled by handleAccessibilityKeys, which runs
  // whether the menu is open or not. The menu must not eat them.
  for (const c of ["BracketLeft", "BracketRight", "Minus", "Equal", "Backslash"]) {
    assert.equal(menuClaimsKey(key(c)), false, c);
  }
});

t("a missing or malformed event is safe", () => {
  assert.equal(menuClaimsKey(null), false);
  assert.equal(menuClaimsKey(undefined), false);
  assert.equal(menuClaimsKey({}), false);
});

// --- the doubled activation key (Josh's key log, 2026-10-07) ---

t("the same press delivered twice is recognised as one", () => {
  // Both events carried event.timeStamp 1416.274 to the millisecond.
  const first = { code: "Backquote", timeStamp: 1416.274 };
  const second = { code: "Backquote", timeStamp: 1416.274 };
  assert.equal(isDuplicateKeydown(first, second), true);
});

t("a genuine second press is not suppressed, however fast", () => {
  const first = { code: "Backquote", timeStamp: 1416.274 };
  const later = { code: "Backquote", timeStamp: 1416.275 };
  assert.equal(isDuplicateKeydown(first, later), false);
});

t("the guard needs no time window to tune", () => {
  // Two presses two full seconds apart are still two presses, and a duplicate
  // two seconds later would still be caught - the test is identity, not nearness.
  assert.equal(isDuplicateKeydown({ code: "Backquote", timeStamp: 1 }, { code: "Backquote", timeStamp: 3000 }), false);
  assert.equal(isDuplicateKeydown({ code: "Backquote", timeStamp: 3000 }, { code: "Backquote", timeStamp: 3000 }), true);
});

t("a different key at the same instant is not a duplicate", () =>
  assert.equal(isDuplicateKeydown({ code: "Backquote", timeStamp: 10 }, { code: "Escape", timeStamp: 10 }), false));

t("no previous event means nothing to suppress", () => {
  assert.equal(isDuplicateKeydown(null, { code: "Backquote", timeStamp: 10 }), false);
  assert.equal(isDuplicateKeydown(undefined, { code: "Backquote", timeStamp: 10 }), false);
});

t("a missing timeStamp never counts as a duplicate", () => {
  assert.equal(isDuplicateKeydown({ code: "Backquote" }, { code: "Backquote" }), false);
  assert.equal(isDuplicateKeydown({ code: "Backquote", timeStamp: 10 }, { code: "Backquote" }), false);
});

t("Escape and Left are both still claimed, but they now do different jobs", () => {
  // Escape closes outright, Left steps back a level. Both must still reach us.
  assert.equal(menuClaimsKey(key("Escape")), true);
  assert.equal(menuClaimsKey(key("ArrowLeft")), true);
});

console.log(`\n${pass} assertions passed.`);
