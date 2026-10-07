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
