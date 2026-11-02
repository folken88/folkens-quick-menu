/**
 * Who gets which command, and who has to move. Pure, so the rule can be tested
 * in node.
 *
 * Josh, 2026-10-31: in the middle of a fight he bought Potions of Expeditious
 * Retreat, initials p, e, r. The next rebuild pulled the potion and Perception
 * apart by extending both, so /per - his most-used command - went dead with no
 * warning. His rule, which Tobias adopted on 2026-11-01: a command a player
 * already has never changes unless the player changes it, and the core is the
 * same on every character.
 *
 * Three tiers, assigned in order, and nothing assigned earlier ever moves:
 *
 *  1. The fixed core: skills, saves, ability checks, initiative, combat
 *     maneuvers, stabilize, caster level, concentration, pool reads. Their
 *     codes come from system keys, so they are identical on every character
 *     in every game - Perception is /per, Will is /wil, Intimidate is /itm.
 *  2. Permanent things - attacks, spells, features, gear - oldest first by the
 *     date Foundry stamped on the item, so the thing he had first keeps its
 *     code and a newcomer takes the longer one.
 *  3. Consumables, which always give way.
 *
 * Codes handed out are remembered on the actor by name and type, so a rebuild,
 * a reload or a restocked potion gets the same answer; a player's own /fqm
 * alias beats everything. A newcomer whose natural code is taken extends its
 * own code until one is free: Scroll of Teleport after Scroll of Technomancy is
 * /stel, and Technomancy stays put.
 */

import { generateAbbreviation, expandAbbreviation, expandAbbreviationHead,
         isLevelledSpell, spellAbbreviation, spellAbbreviationHead } from './AbbreviationGenerator.js';

/** Action types that make up the fixed core. */
export const CORE_TYPES = new Set([
  'skill', 'save', 'ability', 'initiative', 'stabilize', 'maneuver',
  'caster_level', 'concentration', 'pool_read',
]);

/** 1 core, 2 permanent, 3 consumable. */
export function tierOf(item) {
  if (CORE_TYPES.has(item?.actionType)) return 1;
  return item?.originalItem?.type === 'consumable' ? 3 : 2;
}

/** When Foundry stamped the item; 0 when it has no stamp. */
export function createdAt(item) {
  const t = Number(item?.originalItem?._stats?.createdTime);
  return Number.isFinite(t) ? t : 0;
}

/** How a code is remembered: by what the thing is, not which copy of it. */
export function stableKey(item) {
  return `${item?.actionType ?? ''}::${String(item?.label ?? '').trim().toLowerCase()}`;
}

const clean = (code) => String(code ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Assign every item a command.
 *
 * @param {object[]} items       action items, already deduplicated by name
 * @param {object}   [opts]
 * @param {object}   [opts.aliases] player aliases by action item id (/fqm rename)
 * @param {object}   [opts.saved]   codes remembered from the last build, by stableKey
 * @returns {{map: Map<string, object>, reverse: Map<string, string>, assigned: object,
 *            fresh: object[], moved: Array<{key: string, label: string, from: string, to: string}>}}
 *   `assigned` is what to remember for next time; `fresh` are tier 2 and 3 items
 *   that had no remembered code; `moved` are remembered codes that could not be
 *   kept (only a player alias or a core code can take one).
 */
export function assignCodes(items, { aliases = {}, saved = {} } = {}) {
  const map = new Map();
  const reverse = new Map();
  const take = (code, item) => { map.set(code, item); reverse.set(item.id, code); };
  const isFree = (code) => !!code && !map.has(code);

  const ordered = [...(items ?? [])].sort((a, b) =>
    tierOf(a) - tierOf(b)
    || (tierOf(a) === 1 ? 0 : createdAt(a) - createdAt(b))
    || String(a.label ?? '').localeCompare(String(b.label ?? ''))
    || String(a.id ?? '').localeCompare(String(b.id ?? '')));

  // A. The player's own aliases win outright.
  for (const item of ordered) {
    const alias = clean(aliases[item.id]);
    if (!alias) continue;
    take(isFree(alias) ? alias : extendUntilFree(item, alias, map), item);
  }

  // B. The fixed core, explicit codes (pool reads, /cmb, /clc2) first.
  const core = ordered.filter(i => tierOf(i) === 1 && !reverse.has(i.id))
    .sort((a, b) => (b.forceAbbrev ? 1 : 0) - (a.forceAbbrev ? 1 : 0));
  for (const item of core) {
    const natural = clean(generateAbbreviation(item.label, item));
    if (!natural) continue;
    take(isFree(natural) ? natural : extendUntilFree(item, natural, map), item);
  }

  // C. Remembered codes, where still free.
  const rest = ordered.filter(i => tierOf(i) > 1 && !reverse.has(i.id));
  for (const item of rest) {
    const remembered = clean(saved[stableKey(item)]);
    if (remembered && isFree(remembered)) take(remembered, item);
  }

  // D. Everything new, oldest first. A taken code means the newcomer extends.
  const fresh = [];
  for (const item of rest) {
    if (reverse.has(item.id)) continue;
    const natural = clean(generateAbbreviation(item.label, item));
    if (!natural) continue;
    take(isFree(natural) ? natural : extendUntilFree(item, natural, map), item);
    fresh.push(item);
  }

  const assigned = {};
  for (const item of ordered) {
    if (tierOf(item) > 1 && reverse.has(item.id)) assigned[stableKey(item)] = reverse.get(item.id);
  }
  const moved = [];
  for (const [key, from] of Object.entries(saved)) {
    const to = assigned[key];
    if (to && to !== clean(from)) {
      const item = ordered.find(i => stableKey(i) === key);
      moved.push({ key, label: item?.label ?? key, from: clean(from), to });
    }
  }
  return { map, reverse, assigned, fresh, moved };
}

/**
 * A code for the newcomer that nothing holds yet. The holder is never touched.
 *
 * A feature that shares its name with a pool read - Bolty's Grit feature and
 * the /grit read - takes the code plus u, for use: /gritu (Josh, 2026-10-15).
 * Otherwise the last word is extended letter by letter, then the first word,
 * then a number as the last resort.
 */
export function extendUntilFree(item, natural, map) {
  const holder = map.get(natural);
  if (holder?.actionType === 'pool_read' && !map.has(`${natural}u`)) return `${natural}u`;

  const strategies = [
    (extra) => isLevelledSpell(item)
      ? spellAbbreviation(item.label, item.level, extra)
      : expandAbbreviation(item.label, extra),
    (extra) => isLevelledSpell(item)
      ? spellAbbreviationHead(item.label, item.level, extra)
      : expandAbbreviationHead(item.label, extra),
  ];
  for (const build of strategies) {
    for (let extra = 1; extra <= 6; extra++) {
      const code = clean(build(extra));
      if (code && code !== natural && !map.has(code)) return code;
    }
  }
  for (let n = 2; ; n++) {
    const code = `${natural}${n}`;
    if (!map.has(code)) return code;
  }
}
