/**
 * Which spellbooks earn their own commands. Pure, so it can be tested in node.
 */

/**
 * One entry per spellbook whose numbers are not already covered.
 *
 * Josh, 2026-10-05: Olbryn's second book is his racial drow spell-like
 * abilities, which Foundry keeps separately. Both books are caster level 15 and
 * concentration 23, so /clc2 and /conc2 rolled exactly what /clc and /conc
 * already rolled - "an extra pair of commands to learn for nothing".
 *
 * Deduplicating on the figures rather than excluding spell-like books keeps the
 * useful case: if a book ever has a different caster level, its pair appears on
 * its own without anyone having to come back and special-case it.
 *
 * @param {object} books  actor.system.attributes.spells.spellbooks
 * @param {number} fallbackLevel  used when a book has no caster level of its own
 * @returns {Array<{key,label,cl,conc,suffix,named}>} in book order
 */
export function distinctSpellbooks(books, fallbackLevel = 1) {
  const out = [];
  const seen = new Set();

  for (const [key, book] of Object.entries(books ?? {})) {
    if (!book || !book.inUse) continue;

    const cl = book.cl?.total ?? fallbackLevel;
    const conc = book.concentration?.total ?? 0;
    const fingerprint = `${cl}/${conc}`;
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);

    const index = out.length;
    const label = book.label || book.name || key;
    out.push({
      key,
      label,
      cl,
      conc,
      suffix: index === 0 ? '' : String(index + 1),
      named: index === 0 ? '' : ` (${label})`
    });
  }

  return out;
}
