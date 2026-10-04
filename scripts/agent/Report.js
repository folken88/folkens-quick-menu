/** Pure builders over a snapshot from Snapshot.js. No Foundry here. */

const sign = n => (n === null ? "?" : (n >= 0 ? "+" : "") + n);

export function summary(s) {
  return {
    name: s.name,
    classes: s.classes.map(c => `${c.name} ${c.level ?? "?"}`).join(" / "),
    hp: `${s.hp.value}/${s.hp.max}` + (s.hp.temp ? ` (+${s.hp.temp} temp)` : ""),
    ac: s.ac,
    saves: s.saves,
    abilities: Object.fromEntries(Object.entries(s.abilities)
      .map(([k, v]) => [k, `${v.total} (${sign(v.mod)})`])),
    activeBuffs: s.buffs.filter(b => b.active).map(b => b.name),
  };
}

export function spellsByLevel(s) {
  const out = {};
  for (const sp of s.spells) {
    const L = sp.level ?? "?";
    out[L] ??= { known: 0, prepared: 0, names: [] };
    out[L].known++;
    out[L].prepared += sp.prepared ?? 0;
    out[L].names.push(sp.name);
  }
  return out;
}

export function consumables(s) {
  return s.consumables.filter(c => (c.qty ?? 0) > 0);
}

export function search(s, query) {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return [];
  return s.items.filter(i =>
    i.name.toLowerCase().includes(q) || (i.description ?? "").toLowerCase().includes(q));
}

/**
 * Both coin pools. A PF1 character can look broke while holding thousands,
 * because coin often sits in altCurrency (weightless) rather than currency.
 */
export function money(s) {
  const sum = o => Object.values(o ?? {}).reduce((a, b) => a + (b || 0), 0);
  const carried = sum(s.money.carried), weightless = sum(s.money.weightless);
  const note = weightless > 0 && carried === 0
    ? "all coin is in the weightless pool"
    : (carried > 0 && weightless > 0 ? "coin in both pools" : "coin in the carried pool");
  return { ...s.money, note };
}
