/**
 * Is this item a heal, and is it temporary hit points? False Life was read as
 * "14 healing" (Josh, 2026-10-09 follow-up, 8.43); it gives temporary hit
 * points, which are not the same thing at the table.
 */

const stripTags = (html) => String(html ?? '').replace(/<[^>]*>/g, '');
const asText = (v) => (Array.isArray(v) ? v.map(asText).join(' ') : (v == null ? '' : String(v)));

/** The item's first action: a live document's, else the raw system data's. */
function firstAction(item) {
  const live = item?.defaultAction ?? item?.actions?.contents?.[0];
  if (live) return live;
  const raw = item?.system?.actions;
  if (Array.isArray(raw)) return raw[0];
  return raw && typeof raw === 'object' ? Object.values(raw)[0] : undefined;
}

/** false | true | 'temp' (a heal whose text mentions temporary hit points). */
export function healingOf(item) {
  const action = firstAction(item);
  // A live action that states isHealing outright is believed, either way.
  const isHeal = typeof action?.isHealing === 'boolean'
    ? action.isHealing
    : (item?.isHealing === true || action?.actionType === 'heal');
  if (!isHeal) return false;
  const text = [
    stripTags(item?.system?.description?.value),
    stripTags(asText(action?.effectNotes)),
    stripTags(asText(action?.notes?.effect)),
  ].join(' ');
  return /temporary hit points?/i.test(text) ? 'temp' : true;
}
