/**
 * Pure sentence builders for the spoken state reads. No Foundry here, so every
 * one of these can be tested in node.
 *
 * The governing rule, in Josh's words (2026-10-05): "Mid-game, I'm usually after
 * one or two numbers, while listening to everyone else at the same time. A
 * sighted player can spread things across screens and glance at one thing while
 * ignoring the rest. I can't. Everything comes through my ears, one thing at a
 * time."
 *
 * So each quick command answers exactly one question and stops. Anything that
 * needs reconciling - does every item really add into my AC - belongs to his own
 * assistant through the agent API, not to a voice in the middle of a fight.
 */

/** AC, touch, flat-footed. Nothing else. */
export function renderAC(d) {
  if (d?.normal === null || d?.normal === undefined) return 'AC not available.';
  let line = `AC ${d.normal}`;
  if (has(d.touch)) line += `, touch ${d.touch}`;
  if (has(d.flatFooted)) line += `, flat-footed ${d.flatFooted}`;
  return sentence(line);
}

/**
 * CMD, on its own command.
 *
 * It used to ride along with /ac. Josh: "Hearing it in the same breath as my AC
 * made it sound like it was part of my AC, which it isn't." It sits beside AC on
 * the sheet, which groups them for the eye, but by ear it is a different question.
 */
export function renderCMD(d) {
  if (!has(d?.total)) return 'CMD not available.';
  let line = `CMD ${d.total}`;
  if (has(d.flatFooted)) line += `, flat-footed ${d.flatFooted}`;
  return sentence(line);
}

/**
 * The AC breakdown, for the agent API rather than the voice. `applies: false`
 * entries are the ones PF1 overrode - reported, not hidden, because an assistant
 * checking a sheet needs to know a bonus was superseded rather than absent.
 */
export function renderACBreakdown(d) {
  const src = (d?.sources ?? []).filter(s => s && s.name);
  if (!src.length) return 'No breakdown available.';
  const line = src
    .map(s => `${s.name} ${signed(s.value)}${s.applies === false ? ' (overridden)' : ''}`)
    .join(', ');
  return sentence(line);
}

/**
 * Buffs that are on. Says the count first so he knows how long the list is
 * before it starts.
 */
export function renderActiveBuffs(names = []) {
  if (!names.length) return 'No buffs active.';
  const n = names.length;
  return sentence(`${n} buff${n > 1 ? 's' : ''} active: ${names.join(', ')}`);
}

/**
 * Buffs on the sheet that are switched off - the actionable list, the one he can
 * hand to a GM or another player.
 */
export function renderInactiveBuffs(names = []) {
  if (!names.length) return 'Nothing inactive. Every buff on your sheet is on.';
  const n = names.length;
  return sentence(`${n} buff${n > 1 ? 's' : ''} not active: ${names.join(', ')}`);
}

/** "+2" / "-1"; a non-numeric value such as "Set to 24" passes through. */
export function signed(value) {
  if (typeof value === 'number') return (value >= 0 ? '+' : '') + value;
  return String(value ?? '');
}

/** A note reads better as "Ring of Protection: ..." than as a bare sentence. */
export function noteText(note) {
  const text = stripMarkup(note?.text);
  if (!text) return '';
  const source = String(note?.source ?? '').trim();
  return source ? `${source}: ${text}` : text;
}

/** Notes as one spoken run, each ending cleanly. */
export function renderNotes(notes = []) {
  const lines = notes.map(noteText).filter(Boolean).map(sentence);
  return lines.join(' ');
}

/**
 * Expand the shorthand PF1 uses in item and buff names, for the voice only.
 *
 * Josh, 2026-10-07: the voice read "Atk" as "AK" in "Blessing of Fervor (Extra
 * Atk)". Those are the buff names as Foundry stores them, so the fix belongs in
 * what gets spoken rather than in his world data. Whole words only, so a name
 * containing the letters is left alone.
 */
const SPOKEN_EXPANSIONS = [
  [/\bAtk\b/gi, 'Attack'],
  [/\bDmg\b/gi, 'Damage'],
  [/\bDC\b/g, 'D C'],
  [/\bSR\b/g, 'spell resistance'],
  [/\bDR\b/g, 'damage reduction'],
];

export function expandForSpeech(text) {
  let s = String(text ?? '');
  if (!s) return '';
  for (const [pattern, replacement] of SPOKEN_EXPANSIONS) s = s.replace(pattern, replacement);
  return s;
}

/**
 * Strip HTML and Foundry enrichment down to speakable words.
 *
 * PF1 enriches roll notes before handing them over, so a note referencing an
 * item arrives as anchor markup. The chat card renders it; the voice read the
 * markup aloud, which is what happened to Josh's Resist Energy note - "a pile of
 * raw link code". Content links are reduced to their visible label.
 */
export function stripMarkup(input) {
  let s = String(input ?? '');
  if (!s) return '';
  // @UUID[...]{Label} and @Compendium[...]{Label} -> Label
  s = s.replace(/@[A-Za-z]+\[[^\]]*\]\{([^}]*)\}/g, '$1');
  // @UUID[...] with no label -> drop the reference entirely
  s = s.replace(/@[A-Za-z]+\[[^\]]*\]/g, '');
  // <a ...>Label</a> and every other tag -> its text
  s = s.replace(/<br\s*\/?>/gi, ' ');
  s = s.replace(/<[^>]*>/g, '');
  // the handful of entities that actually turn up in notes
  s = s.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
       .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
       .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * One full stop, never two. Josh heard a double period after his Stoneskin note
 * because the note already ended in one and the builder added another.
 */
export function sentence(text) {
  const s = String(text ?? '').trim();
  if (!s) return '';
  return /[.!?]$/.test(s) ? s : s + '.';
}

function has(v) {
  return v !== null && v !== undefined;
}

/**
 * /pool - what is left in each daily pool. Josh, 2026-10-15: Ser had no way to
 * check her ki without spending a point. One question, one answer, worded
 * like /bf: the count first when there is more than one.
 *
 * @param {{name: string, value: number, max: number}[]} pools
 */
export function renderPools(pools = []) {
  const list = pools.filter(p => p && Number(p.max) > 0);
  if (!list.length) return 'No pools.';
  const one = (p) => `${p.name}, ${Math.max(0, Number(p.value) || 0)} of ${p.max} left`;
  if (list.length === 1) return sentence(one(list[0]));
  return sentence(`${list.length} pools. ${list.map(one).join('. ')}`);
}

/** Feature names that are pools even without the word "pool" in them. */
const POOL_NAMES = /^(grit|panache|luck|stamina|resolve|mythic power|inspiration|focus)$/i;

/**
 * Is this daily resource a pool - ki, grit, arcane pool - rather than an
 * ordinary feature with uses per day?
 */
export function isPoolName(name) {
  const n = String(name ?? '').trim();
  return /\bpool\b/i.test(n) || POOL_NAMES.test(n);
}

/**
 * The pool's spoken noun and its command. "Ki Pool" is ki and /ki; "Grit" is
 * grit and /grit; "Arcane Pool" is arcane and /arcane.
 */
export function poolNoun(name) {
  const n = String(name ?? '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\bpool\b/i, '').trim();
  return (n || String(name ?? '')).toLowerCase();
}

export function poolCommand(name) {
  const first = poolNoun(name).split(/\s+/)[0] ?? '';
  return first.replace(/[^a-z0-9]/g, '');
}

/**
 * What /ki says. Josh, 2026-10-15: one command per pool, each answering one
 * question - "7 of 8 ki left."
 */
export function poolReadLine(noun, value, max) {
  const left = Math.max(0, Number(value) || 0);
  if (!(Number(max) > 0)) return `No ${noun}.`;
  return `${left} of ${max} ${noun} left.`;
}

/**
 * The pool read commands for a character, from its resources. Generated, so a
 * multiclass character gets a second pool's command after /scan with nobody
 * setting it up; a second pool of the same kind gets a 2, the way /clc2 does.
 *
 * @param {{id: string, name: string, max: number}[]} resources
 */
export function poolCommandsFor(resources = []) {
  const seen = new Map();
  const out = [];
  for (const r of resources) {
    if (!r || !(Number(r.max) > 0) || !isPoolName(r.name)) continue;
    const base = poolCommand(r.name);
    if (!base) continue;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out.push({ itemId: r.id, name: r.name, noun: poolNoun(r.name), command: n === 1 ? base : `${base}${n}` });
  }
  return out;
}
