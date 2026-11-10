/**
 * What a spell's line adds beyond the roll. Pure, so it can be tested in node.
 *
 * Josh, 2026-10-30: "DC is always unknown to me, I can never calculate it
 * correctly" - and he wants duration, area, range and spell resistance too.
 * Tobias, 2026-11-01: give him the feature. The DC is read from the card by
 * RollTotals; this reads the rest from the item, and only at full detail, so
 * mid-fight on auto he still gets the number and nothing else.
 *
 * "Plus notes" is said at every level but short: things he adds by hand -
 * Sneak Attack's conditions, Haste's extra swing - sit in notes on the card,
 * and without a word he would not know there is something to read.
 *
 * Field names are PF1 11.11's: an action's range and duration are
 * { value, units }, its area is a string (spellArea is the deprecated name),
 * and spell resistance is the item's system.sr.
 */

const strip = (s) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const RANGE_UNITS = {
  close: 'close', medium: 'medium', long: 'long', personal: 'personal', touch: 'touch',
  ft: 'feet', mi: 'miles', m: 'meters', km: 'kilometers',
};

const DURATION_UNITS = {
  round: 'round', minute: 'minute', hour: 'hour', day: 'day', month: 'month', year: 'year',
};

/** "@cl" and friends read as words. */
function formulaWords(value) {
  return strip(value)
    .replace(/@cl\b/g, 'caster level')
    .replace(/@sl\b/g, 'spell level')
    .replace(/\s*\*\s*/g, ' times ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function rangeText(range) {
  if (!range || typeof range !== 'object') return '';
  const units = String(range.units ?? '').toLowerCase();
  if (!units) return '';
  if (units === 'spec') return formulaWords(range.value);
  const word = RANGE_UNITS[units] ?? units;
  if (['close', 'medium', 'long', 'personal', 'touch'].includes(units)) return word;
  const value = formulaWords(range.value);
  return value ? `${value} ${word}` : word;
}

export function durationText(duration) {
  if (!duration || typeof duration !== 'object') return '';
  const units = String(duration.units ?? '').toLowerCase();
  if (!units) return '';
  if (units === 'inst') return 'instantaneous';
  if (units === 'perm') return 'permanent';
  if (units === 'turn') return 'until your next turn';
  if (units === 'spec') return formulaWords(duration.value);
  const value = formulaWords(duration.value);
  const word = DURATION_UNITS[units] ?? units;
  if (!value) return word;
  const plural = /^\d+$/.test(value) && Number(value) === 1 ? word : `${word}s`;
  return `${value} ${plural}`;
}

/** Does the item or its action carry notes someone typed by hand? */
export function hasNotes(item) {
  const action = item?.defaultAction ?? item?.actions?.contents?.[0] ?? null;
  const raw = item?.system?.actions?.[0] ?? null;
  const lists = [
    action?.effectNotes, action?.attackNotes, action?.notes?.effect, action?.notes?.attack, action?.notes?.footer,
    raw?.effectNotes, raw?.attackNotes, raw?.notes?.effect, raw?.notes?.attack, raw?.notes?.footer,
    item?.system?.effectNotes, item?.system?.attackNotes,
  ];
  return lists.some(l => Array.isArray(l) && l.some(n => strip(n)));
}

/**
 * @param {object} item   the spell or item that was used
 * @param {object} [opts]
 * @param {boolean} [opts.terse]  short detail: nothing
 * @returns {string} "Range close. Area 20 foot burst. Duration instantaneous. Spell resistance applies." or ""
 */
export function spellDetailLine(item, { terse = true } = {}) {
  if (!item) return '';
  const action = item.defaultAction ?? item.actions?.contents?.[0] ?? null;
  const raw = item.system?.actions?.[0] ?? {};
  const field = (key) => action?.[key] ?? raw?.[key];
  const parts = [];
  if (!terse) {
    const range = rangeText(field('range'));
    if (range) parts.push(`Range ${range}`);
    const area = strip(field('area') ?? raw.spellArea ?? item.system?.spellArea);
    if (area) parts.push(`Area ${area}`);
    const duration = durationText(field('duration'));
    if (duration) parts.push(`Duration ${duration}`);
    if (item.system?.sr === true) parts.push('Spell resistance applies');
  }
  return parts.length ? parts.join('. ') + '.' : '';
}
