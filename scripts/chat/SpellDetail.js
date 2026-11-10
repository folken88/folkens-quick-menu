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

/** "@cl" or "10 * @cl" with a unit is said per level: "10 minutes per level". */
const PER_LEVEL = /^\s*(?:(\d+)\s*\*\s*)?@cl(?:\s*\*\s*(\d+))?\s*$/;
function perLevel(value, word) {
  const m = PER_LEVEL.exec(strip(value));
  if (!m) return '';
  const n = Number(m[1] ?? m[2] ?? 1);
  return `${n} ${word}${n === 1 ? '' : 's'} per level`;
}

/** PF1 writes "see text" where the real rule is in the description. */
const isSeeText = (value) => { const v = strip(value); return !v || /see text/i.test(v); };

export function rangeText(range) {
  if (!range || typeof range !== 'object') return '';
  const units = String(range.units ?? '').toLowerCase();
  if (!units) return '';
  if (units === 'spec') return isSeeText(range.value) ? 'see description' : formulaWords(range.value);
  const word = RANGE_UNITS[units] ?? units;
  if (['close', 'medium', 'long', 'personal', 'touch'].includes(units)) return word;
  const each = perLevel(range.value, word);
  if (each) return each;
  const value = formulaWords(range.value);
  return value ? `${value} ${word}` : word;
}

export function durationText(duration, { buff = null } = {}) {
  if (!duration || typeof duration !== 'object') return '';
  const units = String(duration.units ?? '').toLowerCase();
  if (!units) return '';
  if (units === 'inst') return 'instantaneous';
  if (units === 'perm') return 'permanent';
  if (units === 'turn') return 'until your next turn';
  if (units === 'spec') {
    if (!isSeeText(duration.value)) return formulaWords(duration.value);
    const real = buff?.system?.duration;
    const realUnits = String(real?.units ?? '').toLowerCase();
    if (real && realUnits && realUnits !== 'spec' && Number.isFinite(Number(real.value)) && real.value !== '' && real.value !== null) {
      return durationText(real);
    }
    return 'see description';
  }
  const word = DURATION_UNITS[units] ?? units;
  const each = perLevel(duration.value, word);
  if (each) return each;
  const value = formulaWords(duration.value);
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
 * @param {object} [opts.buff]  the spell's linked buff item; its duration replaces "see text"
 * @returns {string} "Range close. Area 20 foot burst. Duration instantaneous. Spell resistance applies." or ""
 */
export function spellDetailLine(item, { terse = true, buff = null } = {}) {
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
    const duration = durationText(field('duration'), { buff });
    if (duration) parts.push(`Duration ${duration}`);
    if (item.system?.sr === true) parts.push('Spell resistance applies');
  }
  return parts.length ? parts.join('. ') + '.' : '';
}
