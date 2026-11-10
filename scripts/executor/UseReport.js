/**
 * The use line (10.16). Josh heard "Card posted." after an item with nothing
 * to roll, and the name nowhere. One line now carries the whole use, name
 * first, result straight after it:
 *
 *   "Lightning Bolt, 40 electricity damage. Ref DC 23. Greater Spell Penetration Check 36."
 *   "Haste. Range close. Duration 10 rounds. 2 of 3 left."
 *
 * Pure: the executor gathers the parts and speaks the line.
 *
 * @param {object}   parts
 * @param {string}   parts.name      the item's name
 * @param {string}  [parts.result]   rendered roll totals; its final stop is dropped
 * @param {string}  [parts.detail]   range, duration and the like, ending in a stop
 * @param {string[]}[parts.notes]    rolled card notes, joined with stops
 * @param {string}  [parts.count]    what is left, ending in a stop
 * @param {boolean} [parts.forOther] used on someone else
 * @returns {string}
 */
export function composeUseLine({ name, result = '', detail = '', notes = [], count = '', forOther = false } = {}) {
  let line = name || 'Done';
  const bare = String(result ?? '').trim().replace(/\.$/, '');
  if (bare) line += `, ${bare}`;
  if (forOther) line += ', for someone else';
  line += '.';
  if (detail) line += ` ${detail}`;
  if (notes?.length) line += ` ${notes.join('. ')}.`;
  if (count) line += ` ${count}`;
  return line;
}
