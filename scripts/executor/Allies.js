/**
 * Allies in reach of a group buff (10.28): Haste on the caster's sheet should
 * not leave the friends beside them unhasted, nor unmentioned.
 */

/** Same-side tokens other than the caster within `feet`, with who may be changed. */
export function alliesWithin(tokens, caster, feet, measure) {
  const side = caster?.document?.disposition;
  const hits = [];
  for (const token of tokens ?? []) {
    if (!token || token === caster) continue;
    if (token.document?.disposition !== side || !token.actor) continue;
    if (!(measure(caster, token) <= feet)) continue;
    hits.push({ token, actor: token.actor, owned: !!token.actor.isOwner });
  }
  return hits;
}

/** A spell that reaches several creatures at a distance: Haste, not Shield or Fly. */
export function isGroupBuff(item) {
  const action = Object.values(item?.system?.actions ?? {})[0] ?? item?.defaultAction;
  const units = action?.range?.units;
  if (!units || units === 'personal' || units === 'touch') return false;
  return /creature\/level|creatures|allies/i.test(action?.target?.value ?? '');
}

function joinNames(names) {
  if (names.length < 2) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** One line: who got the buff, and who must switch theirs on. */
export function allyReport(hits, buffName) {
  const on = (hits ?? []).filter((h) => h.owned && h.switched).map((h) => h.actor?.name);
  const rest = (hits ?? []).filter((h) => !h.owned).map((h) => h.actor?.name);
  const parts = [];
  if (on.length) parts.push(`${buffName} on for ${joinNames(on)}.`);
  if (rest.length) parts.push(`Also in range: ${rest.join(', ')}; they switch theirs on.`);
  return parts.join(' ');
}
