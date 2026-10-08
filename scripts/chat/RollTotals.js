/**
 * Pulling the numbers back out of a chat card, whatever shape PF1 put them in.
 * Pure, so every shape can be tested in node.
 *
 * Why this exists: Josh, 2026-10-07, reported that /cmb rolls but says nothing.
 * The cause is that `announceAttackResult` only ever looked at `message.rolls`,
 * which PF1 populates for a skill, save or ability check but leaves empty on an
 * attack card - it keeps attack results in its own flags instead.
 *
 * I could not establish the exact attack-card shape with confidence. The PF1
 * source initialises `flags.pf1.metadata.rolls.attacks`, and I read 330 real
 * messages out of the Iron Gods world to check: 122 carried `message.rolls`
 * (the ordinary d20 rolls, which is why those announce correctly) and not one
 * was an attack card, so there was nothing to confirm against.
 *
 * Rather than guess at one shape and ship a third wrong fix, this tries every
 * shape it might be and reports which one matched. If none does it returns
 * nothing, and the caller says something true instead of inventing a number -
 * announcing a wrong total to someone who cannot see the card would be far
 * worse than announcing none.
 */

/** A roll can arrive as a Roll instance, a serialized Roll, or a JSON string. */
function totalOf(candidate) {
  if (candidate === null || candidate === undefined) return null;
  if (typeof candidate === 'number') return Number.isFinite(candidate) ? candidate : null;

  if (typeof candidate === 'string') {
    try { return totalOf(JSON.parse(candidate)); } catch (_) { return null; }
  }
  if (typeof candidate !== 'object') return null;

  if (typeof candidate.total === 'number' && Number.isFinite(candidate.total)) return candidate.total;

  // PF1 wraps an attack as { attack: <roll>, damage: [...] } in some paths.
  for (const key of ['attack', 'roll', 'result']) {
    if (candidate[key] !== undefined) {
      const inner = totalOf(candidate[key]);
      if (inner !== null) return inner;
    }
  }
  return null;
}

function totalsFrom(list) {
  if (!Array.isArray(list)) return [];
  return list.map(totalOf).filter(n => n !== null);
}

/**
 * @param {object} message a ChatMessage (or anything shaped like one)
 * @returns {{attack: number|null, damage: number|null, source: string|null}}
 *   `source` names the path that matched, so a failure can be diagnosed from a
 *   log rather than by guesswork.
 */
export function extractRollTotals(message) {
  const miss = { attack: null, damage: null, source: null };
  if (!message || typeof message !== 'object') return miss;

  // 1. Ordinary d20 cards: skills, saves, ability checks, initiative.
  const plain = totalsFrom(message.rolls);
  if (plain.length) {
    return {
      attack: plain[0],
      damage: plain.length > 1 ? plain.slice(1).reduce((a, b) => a + b, 0) : null,
      source: 'message.rolls',
    };
  }

  // 2. PF1 attack and maneuver cards.
  const meta = message.flags?.pf1?.metadata;
  const attacks = meta?.rolls?.attacks;
  if (Array.isArray(attacks) && attacks.length) {
    const first = attacks[0];
    const attack = totalOf(first);
    const damage = Array.isArray(first?.damage)
      ? totalsFrom(first.damage).reduce((a, b) => a + b, 0) || null
      : null;
    if (attack !== null) return { attack, damage, source: 'flags.pf1.metadata.rolls.attacks' };
  }

  // 3. Anything else PF1 may hang a total on.
  for (const [path, value] of [
    ['flags.pf1.metadata.rolls.attack', meta?.rolls?.attack],
    ['flags.pf1.metadata.roll', meta?.roll],
    ['message.roll', message.roll],
  ]) {
    const total = totalOf(value);
    if (total !== null) return { attack: total, damage: null, source: path };
  }

  return miss;
}

/**
 * A compact description of where numbers might be hiding, for the console when
 * extraction fails. Josh's own key log is what finally found the menu bug, so
 * the same trick is wired in here: he can read this back to me in one pass
 * instead of us trading theories.
 */
export function describeShape(message) {
  if (!message || typeof message !== 'object') return 'not an object';
  const meta = message.flags?.pf1?.metadata;
  const parts = [
    `rolls=${Array.isArray(message.rolls) ? message.rolls.length : typeof message.rolls}`,
    `flags.pf1=${message.flags?.pf1 ? Object.keys(message.flags.pf1).join('|') : 'none'}`,
    `metadata=${meta ? Object.keys(meta).join('|') : 'none'}`,
    `metadata.rolls=${meta?.rolls ? Object.keys(meta.rolls).join('|') : 'none'}`,
  ];
  return parts.join(' ');
}

/** "22 to hit, 7 damage." / "22 to hit." - only what was actually found. */
export function renderAttackTotals({ attack, damage } = {}) {
  if (attack === null || attack === undefined) return '';
  let line = `${attack} to hit`;
  if (damage !== null && damage !== undefined && damage > 0) line += `, ${damage} damage`;
  return line + '.';
}
