/**
 * Rolled results that PF1 puts only in a chat card's HTML: effect-note tags
 * with inline rolls (Spell Prism, Greater Spell Penetration, Mirror Image).
 * Regex-based so it runs without a DOM.
 */

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" };

/**
 * @param {string} content  the card's HTML
 * @returns {string[]} each `<span class="tag">` containing an inline roll, as plain text
 */
export function rolledNotes(content) {
  if (typeof content !== 'string' || !content) return [];
  const out = [];
  for (const m of content.matchAll(/<span class="tag"[^>]*>([\s\S]*?)<\/span>/g)) {
    if (!m[1].includes('inline-roll')) continue;
    const text = m[1]
      .replace(/<[^>]+>/g, '')
      .replace(/&(?:amp|lt|gt|quot|#39);/g, (e) => ENTITIES[e])
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\.$/, '');
    if (text) out.push(text);
  }
  return out;
}

/**
 * The item a card belongs to: the segment after the last "Item." of
 * message.system.item, else data-item-id in the markup, else null.
 */
export function cardItemId(message) {
  const uuid = message?.system?.item;
  if (typeof uuid === 'string') {
    const i = uuid.lastIndexOf('Item.');
    const id = i >= 0 ? uuid.slice(i + 5) : '';
    if (id) return id;
  }
  const m = /data-item-id="([^"]+)"/.exec(message?.content ?? '');
  return m ? m[1] : null;
}
