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
  const miss = { attack: null, damage: null, attacks: [], source: null };
  if (!message || typeof message !== 'object') return miss;

  // 1. Ordinary d20 cards: skills, saves, ability checks, initiative.
  const plain = totalsFrom(message.rolls);
  if (plain.length) {
    const attack = plain[0];
    const damage = plain.length > 1 ? plain.slice(1).reduce((a, b) => a + b, 0) : null;
    return { attack, damage, attacks: [{ attack, damage }], source: 'message.rolls' };
  }

  // 2. PF1 attack and maneuver cards.
  //
  // Verified against 77 real cards in Iron Gods on 2026-10-08: message.rolls is
  // an empty array, and each entry here is { attack, damage } where damage is an
  // array of rolls. 10 of those 77 held more than one entry - a full attack has
  // one per iterative, up to five - and reading only the first is how Josh heard
  // "30 to hit, 11 damage" for a Punch that had also rolled 20 for 10.
  // PF1 v11 deprecated flags.pf1.metadata in favour of ChatMessagePF.system, and
  // says support goes away in v12 - which f4 already runs. Verified on f1
  // 2026-10-08 that message.system.rolls.attacks is the very same object across
  // all 77 cards, so the new path is preferred and the old one kept as a
  // fallback for anything older. Touching the deprecated path also logs a
  // warning per access, which would have meant one on every attack announced.
  const meta = message.system ?? message.flags?.pf1?.metadata;
  const metaPath = message.system ? 'system' : 'flags.pf1.metadata';
  const raw = meta?.rolls?.attacks;
  if (Array.isArray(raw) && raw.length) {
    const attacks = [];
    for (const entry of raw) {
      const attack = totalOf(entry);
      if (attack === null) continue;
      const damage = Array.isArray(entry?.damage)
        ? (totalsFrom(entry.damage).reduce((a, b) => a + b, 0) || null)
        : null;
      attacks.push({ attack, damage });
    }
    if (attacks.length) {
      return {
        attack: attacks[0].attack,
        damage: attacks[0].damage,
        attacks,
        source: `${metaPath}.rolls.attacks`,
      };
    }
  }

  // 3. Anything else PF1 may hang a total on.
  for (const [path, value] of [
    [`${metaPath}.rolls.attack`, meta?.rolls?.attack],
    [`${metaPath}.roll`, meta?.roll],
    ['message.roll', message.roll],
  ]) {
    const total = totalOf(value);
    if (total !== null) {
      return { attack: total, damage: null, attacks: [{ attack: total, damage: null }], source: path };
    }
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
  const meta = message.system ?? message.flags?.pf1?.metadata;
  const parts = [
    `rolls=${Array.isArray(message.rolls) ? message.rolls.length : typeof message.rolls}`,
    `system=${message.system ? Object.keys(message.system).join('|') : 'none'}`,
    `metadata=${meta ? Object.keys(meta).join('|') : 'none'}`,
    `metadata.rolls=${meta?.rolls ? Object.keys(meta.rolls).join('|') : 'none'}`,
  ];
  return parts.join(' ');
}

/**
 * What gets said about a roll.
 *
 * `terse` is for mid-combat, where Josh is tracking the table by ear and wants
 * the numbers and nothing else. Out of combat there is room to say how many
 * attacks there were and to label them, which matters on a full attack where
 * four numbers arrive one after another.
 */
export function renderAttackTotals(totals = {}, { terse = true } = {}) {
  const attacks = Array.isArray(totals.attacks) && totals.attacks.length
    ? totals.attacks
    : (totals.attack === null || totals.attack === undefined
        ? []
        : [{ attack: totals.attack, damage: totals.damage ?? null }]);

  if (!attacks.length) return '';

  const one = ({ attack, damage }) =>
    (damage !== null && damage !== undefined && damage > 0)
      ? `${attack} to hit, ${damage} damage`
      : `${attack} to hit`;

  if (attacks.length === 1) return one(attacks[0]) + '.';
  if (terse) return attacks.map(one).join('. ') + '.';

  const ordinals = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth'];
  const lines = attacks.map((a, i) => `${ordinals[i] ?? 'Attack ' + (i + 1)}, ${one(a)}`);
  return `${attacks.length} attacks. ${lines.join('. ')}.`;
}

/**
 * Short in combat, fuller outside it.
 *
 * Tobias, 2026-10-08. Keying the amount of detail to combat rather than to a
 * hotkey means there is no new key to collide with, and nothing for Josh to
 * remember to press at the moment he is busiest.
 *
 * @param {'auto'|'short'|'full'} mode  the player's setting
 * @param {boolean} inCombat
 */
export function shouldBeTerse(mode, inCombat) {
  if (mode === 'short') return true;
  if (mode === 'full') return false;
  return !!inCombat;
}

/**
 * Does this chat message belong to the given user?
 *
 * Safety-critical, so it lives here as a pure function rather than inside the
 * executor. An announcement hook that is still armed must never read out
 * another player's roll as if it were yours - and the old code, which used
 * Hooks.once with no check at all, would announce whatever chat message
 * arrived next from anybody.
 *
 * Foundry has moved this field around (v12+ prefers `author`), so every form
 * it has taken is accepted. An unattributable message is treated as ours: that
 * is how PF1 posts some cards, and refusing those would make the common case
 * silent to stop a rare one being wrong.
 */
export function isOwnMessage(message, userId) {
  if (!message || typeof message !== 'object') return false;
  const author = message.author?.id ?? message.author ?? message.user?.id ?? message.user;
  if (author === null || author === undefined || author === '') return true;
  if (typeof author !== 'string') return false;
  return author === userId;
}
