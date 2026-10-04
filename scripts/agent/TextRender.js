import { summary, spellsByLevel, consumables, money } from "./Report.js";

/**
 * Flat text for a screen reader and for keeping.
 *
 * Sight is re-scannable: a sighted player rebuilds what they know by glancing
 * again. A blind player has to externalise it to keep it. So this output is
 * built to be saved and re-read: one fact per line, stable ordering, no markup
 * and no tables, because a table read aloud is noise.
 */
export function renderCharacter(s) {
  const r = summary(s);
  const L = [];
  L.push(r.name);
  L.push(r.classes);
  L.push("");
  L.push(`HP: ${r.hp}`);
  L.push(`AC: ${r.ac.normal} normal, ${r.ac.touch} touch, ${r.ac.flatFooted} flat-footed`);
  L.push(`Saves: Fortitude ${r.saves.fort}, Reflex ${r.saves.ref}, Will ${r.saves.will}`);
  L.push("");
  for (const [k, v] of Object.entries(r.abilities)) L.push(`${k.toUpperCase()}: ${v}`);
  L.push("");
  L.push(`Active buffs: ${r.activeBuffs.join(", ") || "none"}`);
  L.push("");
  const m = money(s);
  L.push(`Money (${m.note}):`);
  for (const [k, v] of Object.entries(m.weightless)) if (v) L.push(`  weightless ${k}: ${v}`);
  for (const [k, v] of Object.entries(m.carried)) if (v) L.push(`  carried ${k}: ${v}`);
  L.push("");
  L.push("Spells:");
  for (const [lvl, g] of Object.entries(spellsByLevel(s)).sort((a, b) => a[0] - b[0]))
    L.push(`  Level ${lvl}: ${g.known} known, ${g.prepared} prepared - ${g.names.join(", ")}`);
  L.push("");
  L.push("Consumables:");
  for (const c of consumables(s))
    L.push(`  ${c.name} x${c.qty}${c.charges !== null ? `, ${c.charges} charges` : ""}`);
  return L.join("\n");
}

/** Inventory as flat text, grouped by item type. */
export function renderInventory(s) {
  const byType = {};
  for (const i of s.items) (byType[i.type] ??= []).push(i);
  const L = [`${s.name} - inventory`, ""];
  for (const type of Object.keys(byType).sort()) {
    L.push(`${type}:`);
    for (const i of byType[type].slice().sort((a, b) => a.name.localeCompare(b.name)))
      L.push(`  ${i.name}${i.qty > 1 ? ` x${i.qty}` : ""}${i.equipped === true ? " (equipped)" : ""}`);
    L.push("");
  }
  return L.join("\n").trimEnd();
}
