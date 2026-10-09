/**
 * Casting a spontaneous caster's spell from a higher slot than its own.
 *
 * Tobias, 2026-10-08: "for sorcerers and other spontaneous casters we need a
 * system that allows for up-casting. Olbryn is out of 6th level spell slots but
 * tries to cast disintegrate (/6dis) and tts very quickly says 'out of spells,
 * upcast?' and if he types Y then it uses a 7th level spell slot to cast it, if
 * he types N, then it cancels."
 *
 * Worth saying once: Pathfinder 1e has no general up-casting rule for
 * spontaneous casters, so this is a house rule at this table. The spell is cast
 * exactly as written - the larger slot buys nothing beyond being able to cast it
 * at all.
 *
 * Pure, so the slot arithmetic and the wording can be tested without Foundry.
 */

/** PF1 spell levels. */
export const MAX_SPELL_LEVEL = 9;

/** How many casts remain at a given level in a spontaneous book. */
export function slotsAt(spellbook, level) {
  const slot = spellbook?.spells?.[`spell${level}`];
  const value = slot?.value;
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/**
 * The slot to borrow: the LOWEST level above the spell's own that still has a
 * cast left. Lowest, so the most valuable slots are spent last - out of 6th with
 * 7th and 9th free, this takes the 7th.
 *
 * @returns {number|null} the level to spend, or null if nothing higher is free
 */
export function findUpcastLevel(spellbook, spellLevel) {
  const from = Number(spellLevel);
  if (!Number.isInteger(from) || from < 0) return null;
  for (let level = from + 1; level <= MAX_SPELL_LEVEL; level++) {
    if (slotsAt(spellbook, level) > 0) return level;
  }
  return null;
}

/**
 * Should we even offer? Only for a spontaneous book that has genuinely run out
 * at this level. A prepared caster does not work this way, and cantrips never
 * run out.
 */
export function canOfferUpcast(spellbook, spellLevel) {
  if (!spellbook?.spontaneous) return false;
  const from = Number(spellLevel);
  if (!Number.isInteger(from) || from < 1) return false;
  if (slotsAt(spellbook, from) > 0) return false;
  return findUpcastLevel(spellbook, from) !== null;
}

const ORDINALS = ['', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th'];

/** "6th", "7th" - for speech, not for display. */
export function ordinal(level) {
  return ORDINALS[level] ?? `level ${level}`;
}

/**
 * The prompt. It has to be quick: he is mid-turn and asked for the voice to say
 * it "very quickly". The question goes last so the word he answers is the last
 * thing he hears.
 */
export function upcastPrompt(spellName, spellLevel, upcastLevel) {
  return `Out of ${ordinal(spellLevel)}. Cast ${spellName} with a ${ordinal(upcastLevel)}?`;
}

/** Said after it goes through, so he knows which slot he actually spent. */
export function upcastConfirmation(spellName, upcastLevel) {
  return `${spellName}, cast with a ${ordinal(upcastLevel)} slot.`;
}

/** Nothing higher is free either. */
export function noSlotsMessage(spellLevel) {
  return `Out of ${ordinal(spellLevel)}, and nothing higher left.`;
}

/**
 * Yes, no, or neither.
 *
 * Deliberately narrow. While a prompt is waiting this consumes what he types,
 * so anything that is not clearly an answer must fall through to chat rather
 * than be guessed at.
 */
export function parseYesNo(text) {
  const t = String(text ?? '').trim().toLowerCase().replace(/^\//, '');
  if (t === 'y' || t === 'yes') return true;
  if (t === 'n' || t === 'no') return false;
  return null;
}

/**
 * The slot bookkeeping for one up-cast, as plain numbers.
 *
 * PF1 spends the slot at the spell's OWN level when it casts, and there is no
 * documented way to tell it to charge a different one. So we lend the spell a
 * slot at its own level and take one from the higher level in the same update:
 * PF1 then spends the lent slot as usual and the net effect is exactly right.
 *
 * Returned as data so the arithmetic is testable and so the caller can write it
 * in a single update - no window where the sheet is half-changed.
 *
 * @returns {{updates: object, expectedAfterCast: object, lentLevel: number, spentLevel: number}}
 */
export function planUpcast(bookKey, spellLevel, upcastLevel, spellbook) {
  const base = `system.attributes.spells.spellbooks.${bookKey}.spells`;
  const own = slotsAt(spellbook, spellLevel);
  const higher = slotsAt(spellbook, upcastLevel);

  return {
    lentLevel: spellLevel,
    spentLevel: upcastLevel,
    updates: {
      [`${base}.spell${spellLevel}.value`]: own + 1,
      [`${base}.spell${upcastLevel}.value`]: higher - 1,
    },
    // After PF1 spends the lent slot, the spell's own level should be back where
    // it started. If it is not, PF1 did not deduct (auto-deduct can be off) and
    // the caller must put it right rather than leave a free slot behind.
    expectedAfterCast: {
      [`${base}.spell${spellLevel}.value`]: own,
    },
  };
}
