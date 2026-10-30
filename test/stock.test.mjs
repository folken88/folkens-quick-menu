/**
 * Same-name stacks, ammunition reads, and which gear earns a command.
 * From Josh's three emails of 2026-10-29, on Ser.
 * Run: node test/stock.test.mjs
 */
import assert from "node:assert/strict";
import { stockOf, firstWithStock, totalStock, stockLine, ammoReadLine } from "../scripts/character/Stock.js";
import { LAST_ONE } from "../scripts/executor/UseOutcome.js";

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log("  ok -", name); };

// Ser's two Potion of Cure Light Wounds stacks, as read from the Shackles DB.
const emptyPotion = { id: "FuboskQNTj0vM8dJ", system: { quantity: 0, uses: { per: "single", value: 1 } } };
const fullPotion  = { id: "Trm5ODgtsvz6dODX", system: { quantity: 1, uses: { per: "single" } } };
const jerkyA = { id: "ZTKilAQ5SiPWnIbd", system: { quantity: 1, uses: { per: "single" } } };
const jerkyB = { id: "ks16sYHnuwW6P1or", system: { quantity: 1, uses: { per: "single" } } };

t("a single-use stack's stock is its quantity", () => {
  assert.equal(stockOf(emptyPotion), 0);
  assert.equal(stockOf(fullPotion), 1);
});

t("a per-day item's stock is its uses left", () =>
  assert.equal(stockOf({ system: { uses: { per: "day", max: 3, value: 2 } } }), 2));

t("a thing that does not run out has no stock to count", () =>
  assert.equal(stockOf({ system: { uses: { per: "" } } }), null));

t("/pclw moves past the empty potion stack to the one with a potion", () =>
  assert.equal(firstWithStock([emptyPotion, fullPotion]), fullPotion));

t("the first stack is used when it has something", () =>
  assert.equal(firstWithStock([jerkyA, jerkyB]), jerkyA));

t("when every stack is empty the first is handed to PF1, so the refusal is heard", () =>
  assert.equal(firstWithStock([emptyPotion, { ...emptyPotion, id: "x" }]), emptyPotion));

t("a missing stack is skipped, not tripped over", () => {
  assert.equal(firstWithStock([undefined, fullPotion]), fullPotion);
  assert.equal(firstWithStock([]), null);
});

t("the count read back is the total across stacks", () => {
  assert.equal(totalStock([emptyPotion, fullPotion]), 1);
  assert.equal(stockLine([jerkyA, jerkyB]), "2 left.");
  assert.equal(stockLine([emptyPotion, { ...emptyPotion, id: "y" }]), LAST_ONE);
  assert.equal(stockLine([{ system: {} }]), "");
});

// --- /arro reads, never spends ---

t("arrows are read with their name and count", () => {
  assert.equal(ammoReadLine("Arrow", 21), "21 arrows left.");
  assert.equal(ammoReadLine("Arrow", 1), "1 arrow left.");
  assert.equal(ammoReadLine("Arrow", 0), "0 arrows left.");
});

t("other ammunition is pluralised sensibly", () => {
  assert.equal(ammoReadLine("Bullet", 30), "30 bullets left.");
  assert.equal(ammoReadLine("Crossbow Bolt", 12), "12 crossbow bolts left.");
  assert.equal(ammoReadLine("Alchemical Cartridge", 5), "5 alchemical cartridges left.");
});

console.log(`${pass} assertions passed.`);
