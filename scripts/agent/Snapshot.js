/**
 * The ONE function that touches live Foundry documents. It flattens an actor
 * into a plain object so every builder downstream is pure and unit-testable
 * without a Foundry environment.
 *
 * These paths were measured against PF1 11.11 on Foundry v13 in a live session.
 * Do not guess them.
 */
const num = v => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = html => String(html ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

export function snapshotActor(actor) {
  const s = actor.system ?? {};
  const at = s.attributes ?? {};
  return {
    id: actor.id,
    name: actor.name,
    classes: (actor.itemTypes?.class ?? []).map(c => ({ name: c.name, level: num(c.system?.level) })),
    hp: { value: num(at.hp?.value), max: num(at.hp?.max), temp: num(at.hp?.temp) },
    ac: {
      normal: num(at.ac?.normal?.total),
      touch: num(at.ac?.touch?.total),
      flatFooted: num(at.ac?.flatFooted?.total),
    },
    saves: {
      fort: num(at.savingThrows?.fort?.total),
      ref: num(at.savingThrows?.ref?.total),
      will: num(at.savingThrows?.will?.total),
    },
    abilities: Object.fromEntries(Object.entries(s.abilities ?? {})
      .map(([k, v]) => [k, { total: num(v?.total), mod: num(v?.mod) }])),
    buffs: (actor.itemTypes?.buff ?? []).map(b => ({ name: b.name, active: !!b.isActive })),
    spells: (actor.itemTypes?.spell ?? []).map(sp => ({
      name: sp.name,
      level: num(sp.system?.level),
      prepared: num(sp.system?.preparation?.value) ?? 0,
    })),
    consumables: (actor.itemTypes?.consumable ?? []).map(c => ({
      name: c.name,
      qty: num(c.system?.quantity) ?? 0,
      charges: num(c.system?.uses?.value),
    })),
    items: (actor.items?.contents ?? []).map(i => ({
      name: i.name,
      type: i.type,
      qty: num(i.system?.quantity) ?? 1,
      equipped: i.system?.equipped ?? null,
      price: num(i.system?.price),
      description: text(i.system?.description?.value),
    })),
    money: { carried: { ...(s.currency ?? {}) }, weightless: { ...(s.altCurrency ?? {}) } },
  };
}
