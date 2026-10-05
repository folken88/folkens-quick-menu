/**
 * Pure sentence builders for the spoken state reads. No Foundry here, so every
 * one of these can be tested in node.
 *
 * Everything a blind player gets comes through a voice in one pass - they cannot
 * skim back over it - so the order is fixed: the numbers you need mid-combat
 * first, the explanation of where they came from second, and the roll notes last.
 */

/**
 * @param {object} d  from CharacterDataExtractor.getACDetail()
 * @param {Array<{text:string,source?:string}>} notes  from getACNotes()
 */
export function renderAC(d, notes = []) {
  const parts = [];

  const n = v => (v === null || v === undefined ? null : v);
  if (n(d?.normal) !== null) {
    let line = `AC ${d.normal}`;
    if (n(d.touch) !== null) line += `, touch ${d.touch}`;
    if (n(d.flatFooted) !== null) line += `, flat-footed ${d.flatFooted}`;
    parts.push(line);
  } else {
    parts.push('AC not available');
  }

  if (n(d?.cmd) !== null) {
    let line = `CMD ${d.cmd}`;
    if (n(d.cmdFlatFooted) !== null) line += `, flat-footed ${d.cmdFlatFooted}`;
    parts.push(line);
  }

  // PF1 keeps the base 10 out of its source list, so state it to make the sum add up.
  const src = (d?.sources ?? []).filter(s => s && s.name);
  if (src.length) {
    const terms = src.map(s => `${s.name} ${signed(s.value)}`).join(', ');
    parts.push(`From base ${d.base ?? 10}, ${terms}`);
  }

  if (notes.length) {
    parts.push(notes.map(x => noteText(x)).filter(Boolean).join('. '));
  }

  return parts.join('. ') + '.';
}

/** "+2" / "-1" / "set to 24" passes through unchanged. */
export function signed(value) {
  if (typeof value === 'number') return (value >= 0 ? '+' : '') + value;
  return String(value ?? '');
}

/** A note reads better as "Ring of Protection: ..." than as a bare sentence. */
export function noteText(note) {
  const text = String(note?.text ?? '').trim();
  if (!text) return '';
  const source = String(note?.source ?? '').trim();
  return source ? `${source}: ${text}` : text;
}
