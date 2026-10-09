/**
 * Casting a spontaneous caster's spell from a higher slot than its own.
 *
 * Tobias, 2026-10-08: "for sorcerers and other spontaneous casters we need a
 * system that allows for up-casting. Olbryn is out of 6th level spell slots but
 * tries to cast disintegrate (/6dis) and tts very quickly says 'out of spells,
 * upcast?' and if he types Y then it uses a 7th level spell slot to cast it, if
 * he types N, then it cancels."
 *
 * This is the rules as written, not a house rule. Josh found it, 2026-10-09:
 * the Core Rulebook's Spell Slots section says "A spellcaster always has the
 * option to fill a higher-level spell slot with a lower-level spell." 0.14.0
 * wrongly called it a house rule. The spell is cast exactly as written - the
 * larger slot buys the cast and nothing else; that is Heighten Spell's job.
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

/**
 * A typed up-cast: the spell's own command with the slot level on the end.
 *
 * Josh, 2026-10-09: "/6cl7, the typed upcast with the slot level on the end" -
 * Chain Lightning is /6cl, so /6cl7 casts it from a 7th-level slot without the
 * Y/N prompt, and whether or not 6th-level slots remain.
 *
 * Spell commands are always a digit followed by letters, so a trailing digit
 * after letters is unambiguous. Returns null for anything else, and the caller
 * still checks that the base is a real spell and the slot is higher than it.
 */
export function parseTypedUpcast(command) {
  const m = /^(\d[a-z]+)(\d)$/.exec(String(command ?? '').toLowerCase());
  if (!m) return null;
  return { base: m[1], slot: Number(m[2]) };
}

/**
 * The spell-slots readout, for /sr0 to /sr9. Josh, 2026-10-09: "/sr1 to /sr9
 * says '3 of 5 7th level spells left', or 'do not have spells of this level'."
 *
 * @param {object} info
 * @param {number}  info.level
 * @param {boolean} info.spontaneous
 * @param {number}  info.left   casts left at this level
 * @param {number}  info.total  casts per day at this level
 */
export function slotReportLine({ level, spontaneous, left, total } = {}) {
  const lvl = Number(level);
  if (lvl === 0) return 'Cantrips are at will.';
  const name = `${ordinal(lvl)}-level`;
  if (!Number.isFinite(total) || total <= 0) {
    return spontaneous ? `No ${name} spells.` : `No ${name} spells prepared.`;
  }
  const remaining = Number.isFinite(left) ? Math.max(0, left) : 0;
  return spontaneous
    ? `${remaining} of ${total} ${name} spells left.`
    : `${remaining} of ${total} ${name} prepared left.`;
}

/** /sr7 -> 7; anything else -> null. */
export function parseSlotReportCommand(command) {
  const m = /^sr(\d)$/.exec(String(command ?? '').toLowerCase());
  return m ? Number(m[1]) : null;
}
