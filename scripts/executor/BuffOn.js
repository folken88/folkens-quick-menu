/**
 * A buff potion switches its buff on.
 *
 * Josh, 2026-11-01: every buff potion Sparkbang drank - Haste, Fly, Owl's
 * Wisdom, Shield - spent the potion, switched nothing on, and said only how
 * many were left. Tobias, 2026-11-01: buff potions should switch their buff
 * on, and the buff should come from the compendium rather than be made up,
 * because the compendium's versions are generally more accurate.
 *
 * So: the buff of that name already on the sheet is switched on; failing that,
 * one is imported from a compendium (PF1's own first) and switched on; failing
 * that, nothing is said - a cure potion has no buff, and that is not an error.
 *
 * The actor, packs and voice are passed in, so the rule can be tested in node.
 */

/** "Potion of Shield" -> "Shield"; anything that is not a potion -> null. */
export function buffNameFor(item) {
  const m = /^(?:potion|elixir|oil|draught) of (.+)$/i.exec(String(item?.name ?? '').trim());
  return m ? m[1].trim() : null;
}

/** PF1's own packs first, so a buff is the system's version when it has one. */
export function orderPacks(packs = []) {
  const items = [...packs].filter(p => p?.documentName === 'Item' || p?.metadata?.type === 'Item');
  return items.sort((a, b) => {
    const pa = String(a.collection ?? a.metadata?.id ?? '').startsWith('pf1.') ? 0 : 1;
    const pb = String(b.collection ?? b.metadata?.id ?? '').startsWith('pf1.') ? 0 : 1;
    return pa - pb;
  });
}

/**
 * @param {object}   actor
 * @param {object}   item          the consumable that was just used
 * @param {object}   [opts]
 * @param {object[]} [opts.packs]  compendium packs to search when the sheet has no such buff
 * @param {function} [opts.speak]  (line) => void
 * @param {function} [opts.fromCompendium] (doc) => plain item data; defaults to doc.toObject()
 * @returns {Promise<'sheet'|'compendium'|null>} where the buff came from, or null when there was none to switch on
 */
export async function switchBuffOn(actor, item, { packs = [], speak = () => {}, fromCompendium = null } = {}) {
  const name = buffNameFor(item);
  if (!name || !actor) return null;
  const lower = name.toLowerCase();

  const own = (actor.items?.contents ?? actor.items ?? []).find?.(i => i.type === 'buff' && String(i.name).toLowerCase() === lower)
    ?? actor.items?.find?.(i => i.type === 'buff' && String(i.name).toLowerCase() === lower);
  if (own) {
    if (own.system?.active !== true) await own.update({ 'system.active': true });
    speak(`${name} on.`);
    return 'sheet';
  }

  for (const pack of orderPacks(packs)) {
    const index = await pack.getIndex();
    const entry = [...index].find(e => e.type === 'buff' && String(e.name).toLowerCase() === lower);
    if (!entry) continue;
    const doc = await pack.getDocument(entry._id);
    if (!doc) continue;
    const data = fromCompendium ? fromCompendium(doc) : doc.toObject();
    data.system = { ...(data.system ?? {}), active: true };
    await actor.createEmbeddedDocuments('Item', [data]);
    speak(`${name} on, from the compendium.`);
    return 'compendium';
  }
  return null;
}
