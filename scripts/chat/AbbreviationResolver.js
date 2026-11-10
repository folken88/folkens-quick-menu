/**
 * AbbreviationResolver - Maps abbreviations to action items for a given actor.
 * Handles auto-generation, collision detection, player alias persistence.
 */

import { LEGACY_ALIASES, spellOut, consumableKind, CODED_CONSUMABLE_KINDS } from './AbbreviationGenerator.js';
import { assignCodes, stableKey, rememberedKeys, isCharged } from './CommandTiers.js';
import { debugLog } from '../module.js';

const MODULE_ID = 'folken-games-quick-menu';
const FLAG_KEY = 'chatAliases';
/** Codes handed out by the generator, remembered by name and type. */
const ASSIGNED_KEY = 'assignedCodes';
/** Which code rule the remembered codes were made under. 2 = p/w/s consumables (10.21). */
const CODE_RULE_KEY = 'codeRule';
const CODE_RULE = 2;

export class AbbreviationResolver {
  constructor() {
    /** @type {Map<string, Object>} abbreviation -> actionItem */
    this.abbreviationMap = new Map();
    /** @type {Map<string, string>} actionItem.id -> abbreviation */
    this.reverseMap = new Map();
    /** @type {Map<string, Object[]>} abbreviation -> [actionItem, ...] for unresolved collisions */
    this.collisions = new Map();
    /** @type {string|null} */
    this.currentActorId = null;
    /** @type {boolean} */
    this.isBuilt = false;
  }

  /**
   * Build the complete abbreviation table for an actor.
   * Merges auto-generated abbreviations with player-saved aliases from flags.
   * @param {Actor} actor
   */
  async buildForActor(actor) {
    if (!actor) return;

    this.abbreviationMap.clear();
    this.reverseMap.clear();
    this.collisions.clear();
    this.currentActorId = actor.id;

    // 1. Gather ALL action items from the character data extractor
    const allActions = this._getAllActionItems(actor);
    debugLog(`AbbreviationResolver: found ${allActions.length} actions for ${actor.name}`);

    // 2. Player aliases, and the codes remembered from the last build.
    const playerAliases = actor.getFlag(MODULE_ID, FLAG_KEY) || {};
    const saved = { ...(actor.getFlag(MODULE_ID, ASSIGNED_KEY) || {}) };
    const savedBefore = JSON.stringify(actor.getFlag(MODULE_ID, ASSIGNED_KEY) || {});

    // 10.21: potions, wands and scrolls moved to spell-style codes. Forget what
    // they remembered, once, so they take the new code; the moved speech below
    // announces each one. Core codes and aliases are untouched.
    const rule = Number(actor.getFlag(MODULE_ID, CODE_RULE_KEY)) || 1;
    const forgotten = [];
    if (rule < CODE_RULE) {
      for (const item of allActions) {
        if (!CODED_CONSUMABLE_KINDS.has(consumableKind(item))) continue;
        const keys = rememberedKeys(item).filter(k => saved[k]);
        if (!keys.length) continue;
        forgotten.push({ key: stableKey(item), label: item.label, from: saved[keys[0]] });
        for (const k of keys) delete saved[k];
      }
    }

    // 3. Assign by tier: aliases, the fixed core, remembered codes, then
    //    anything new, oldest first. Nothing already assigned ever moves. See
    //    CommandTiers.js for the rule and why (Josh, 2026-10-31: a potion took
    //    his Perception command mid-fight).
    const { map, reverse, assigned, fresh, moved, dropped } = assignCodes(allActions, { aliases: playerAliases, saved });
    // Forgotten codes are not in `saved` any more, so assignCodes cannot report
    // them as moved. Report the ones that really changed.
    for (const f of forgotten) {
      const to = assigned[f.key];
      if (to && to !== f.from) moved.push({ key: f.key, label: f.label, from: f.from, to });
    }
    this.abbreviationMap = map;
    this.reverseMap = reverse;
    this.lastBuild = { fresh, moved };

    // 4. Remember what was handed out, so the next build gives the same answer.
    //    Only when it changed, and only if this user may write to the actor.
    if (JSON.stringify(assigned) !== savedBefore && actor.isOwner !== false) {
      try { await actor.setFlag(MODULE_ID, ASSIGNED_KEY, assigned); } catch (error) {
        debugLog('AbbreviationResolver: could not remember codes:', error);
      }
    }

    if (rule < CODE_RULE && actor.isOwner !== false) {
      try { await actor.setFlag(MODULE_ID, CODE_RULE_KEY, CODE_RULE); } catch (error) {
        debugLog('AbbreviationResolver: could not record the code rule:', error);
      }
    }

    // An alias that sits on a core item or collides with a core code can never
    // work: clear it from the flag and say what the command is instead.
    if (dropped.length) {
      if (actor.isOwner !== false) {
        try {
          const flagged = { ...(actor.getFlag(MODULE_ID, FLAG_KEY) || {}) };
          for (const d of dropped) delete flagged[d.key];
          await actor.setFlag(MODULE_ID, FLAG_KEY, flagged);
        } catch (error) {
          debugLog('AbbreviationResolver: could not clear dropped aliases:', error);
        }
      }
      const tts = game.folkenQuickMenu?.tts;
      for (const d of dropped) {
        tts?.speak(`Alias ${spellOut(d.alias)} cleared. ${d.label} is slash ${spellOut(reverse.get(d.key))}.`);
      }
    }

    // A remembered code can only be lost to the player's own alias. Say so,
    // out loud: Josh, 2026-11-01, "if a command ever does have to change, the
    // voice says which one and what it is now, before I need it."
    this._speakMoved(moved);

    // 5. Legacy aliases. Saves moved to three letters and Intimidate moved off
    //    "int", so the forms a player already learned keep working as long as
    //    nothing else has claimed them.
    for (const [canonical, aliases] of Object.entries(LEGACY_ALIASES)) {
      const target = this.abbreviationMap.get(canonical);
      if (!target) continue;
      for (const alias of aliases) {
        if (this.abbreviationMap.has(alias) || this.collisions.has(alias)) continue;
        this.abbreviationMap.set(alias, target);
      }
    }

    this.isBuilt = true;
    debugLog(`AbbreviationResolver: ${this.abbreviationMap.size} abbreviations, ${this.collisions.size} collisions`);

    return moved;
  }

  /**
   * The command for a sheet item, by its item id. Used when an item has just
   * been added, to say its code.
   * @param {string} itemId
   * @returns {string|null}
   */
  codeForItemId(itemId) {
    if (!itemId) return null;
    for (const [code, item] of this.abbreviationMap) {
      if (item.itemId === itemId || item.alternates?.includes(itemId)) return code;
    }
    return null;
  }

  /**
   * Resolve an abbreviation to an action item.
   * @param {string} abbreviation
   * @returns {{ found: boolean, actionItem?: Object, collision?: boolean, items?: Object[] }}
   */
  resolve(abbreviation) {
    const lower = abbreviation.toLowerCase();

    // An assigned command wins. The collision group is only consulted when the
    // code resolves to nothing, otherwise a command that was handed out would
    // be shadowed and never fire.
    if (this.abbreviationMap.has(lower)) {
      return { found: true, actionItem: this.abbreviationMap.get(lower) };
    }

    if (this.collisions.has(lower)) {
      return { found: false, collision: true, items: this.collisions.get(lower) };
    }

    return { found: false, collision: false };
  }

  /**
   * Get the abbreviation assigned to an action item.
   * @param {string} actionItemId
   * @returns {string|null}
   */
  getAbbreviationFor(actionItemId) {
    return this.reverseMap.get(actionItemId) || null;
  }

  /**
   * Save a player alias and rebuild the table.
   * @param {Actor} actor
   * @param {string} actionItemId
   * @param {string} newAbbrev
   */
  async saveAlias(actor, actionItemId, newAbbrev) {
    const aliases = actor.getFlag(MODULE_ID, FLAG_KEY) || {};
    aliases[actionItemId] = newAbbrev.toLowerCase();
    await actor.setFlag(MODULE_ID, FLAG_KEY, aliases);
    await this.buildForActor(actor);
  }

  /**
   * Save collision resolution: chosen item keeps the abbreviation,
   * others get numeric suffixes.
   * @param {Actor} actor
   * @param {string} abbreviation
   * @param {Object} chosenItem - The item the player picked
   * @param {Object[]} allItems - All colliding items
   */
  async saveCollisionChoice(actor, abbreviation, chosenItem, allItems) {
    const aliases = actor.getFlag(MODULE_ID, FLAG_KEY) || {};
    aliases[chosenItem.id] = abbreviation;

    let suffix = 2;
    for (const item of allItems) {
      if (item.id !== chosenItem.id) {
        aliases[item.id] = `${abbreviation}${suffix}`;
        suffix++;
      }
    }

    await actor.setFlag(MODULE_ID, FLAG_KEY, aliases);
    await this.buildForActor(actor);
  }

  /**
   * Clear the player's aliases and rebuild. The remembered generated codes
   * stay: /fqm reset undoes the player's renames, not the stability rule.
   * @param {Actor} actor
   */
  async clearAliases(actor) {
    // What the player hears now, so reset can say which commands moved back.
    const before = this.currentActorId === actor.id ? new Map(this.reverseMap) : new Map();
    await actor.unsetFlag(MODULE_ID, FLAG_KEY);
    const spokenMoves = (await this.buildForActor(actor)) ?? [];
    const already = new Set(spokenMoves.map(m => m.key));
    const changed = [];
    for (const [id, to] of this.reverseMap) {
      const from = before.get(id);
      const item = this.abbreviationMap.get(to);
      const key = stableKey(item);
      if (from && from !== to && !already.has(key)) changed.push({ key, label: item.label, from, to });
    }
    this._speakMoved(changed);
  }

  /** Say which commands changed: the first five, then a count. */
  _speakMoved(moved) {
    if (!moved?.length) return;
    const tts = game.folkenQuickMenu?.tts;
    for (const m of moved.slice(0, 5)) tts?.speak(`${m.label} is now slash ${spellOut(m.to)}.`);
    if (moved.length > 5) tts?.speak(`${moved.length - 5} more commands changed. Type slash f q m list.`);
  }

  /**
   * Forget every remembered generated code too, so the next build starts from
   * the rule alone. The player is warned first by the caller; whatever moves
   * is spoken by the rebuild.
   * @param {Actor} actor
   */
  async forgetAssignedCodes(actor) {
    await actor.unsetFlag(MODULE_ID, ASSIGNED_KEY);
    await this.buildForActor(actor);
  }

  /**
   * Get all current abbreviation → label pairs (for /fqm list).
   * @returns {Array<{abbrev: string, label: string, actionType: string}>}
   */
  listAll() {
    const list = [];
    for (const [abbrev, item] of this.abbreviationMap) {
      list.push({ abbrev, label: item.label, actionType: item.actionType });
    }
    list.sort((a, b) => a.abbrev.localeCompare(b.abbrev));
    return list;
  }

  /**
   * Get total count of registered abbreviations.
   * @returns {number}
   */
  get count() {
    return this.abbreviationMap.size;
  }

  /**
   * Get count of unresolved collisions.
   * @returns {number}
   */
  get collisionCount() {
    return this.collisions.size;
  }

  // ─── Internal: gather all action items from extractors ────

  _getAllActionItems(actor) {
    const extractor = game.folkenQuickMenu?.characterData;
    if (!extractor) return [];

    const items = [];

    try {
      // Skills
      const skills = extractor.getSkills ? extractor.getSkills(actor) : [];
      items.push(...skills);

      // Combat / Attacks
      if (extractor.getCombat) {
        items.push(...extractor.getCombat(actor));
      } else if (extractor.getAttacks) {
        items.push(...extractor.getAttacks(actor));
      }

      // Spells — flatten spell level submenus into individual spells
      const spellMenus = extractor.getSpells ? extractor.getSpells(actor) : [];
      for (const menu of spellMenus) {
        if (menu.type === 'submenu' && menu.spellLevel !== undefined) {
          const spells = extractor.getSpellsForLevel
            ? extractor.getSpellsForLevel(actor, menu.spellLevel)
            : [];
          items.push(...spells);
        }
      }

      // Items — flatten category submenus
      const itemMenus = extractor.getItems ? extractor.getItems(actor) : [];
      for (const menu of itemMenus) {
        if (menu.type === 'item_category' || menu.actionType === 'submenu') {
          const categoryItems = extractor.getItemsByCategory
            ? extractor.getItemsByCategory(actor, menu.id)
            : [];
          items.push(...categoryItems);
        }
      }

      // Abilities
      const abilities = extractor.getAbilities ? extractor.getAbilities(actor) : [];
      items.push(...abilities);

      // Saves
      const saves = extractor.getSaves ? extractor.getSaves(actor) : [];
      items.push(...saves);

      // Stats (ability checks)
      const stats = extractor.getStats ? extractor.getStats(actor) : [];
      items.push(...stats);
    } catch (error) {
      console.error('AbbreviationResolver: error gathering action items:', error);
    }

    // Deduplicate: if two items share the same label + actionType, keep the
    // first - and remember the others as alternates, so a command whose first
    // stack is empty moves on to the next one with the same name. Josh,
    // 2026-10-29: two Potion of Cure Light Wounds stacks, one at 0, and /pclw
    // said "None left." with a potion still in the bag. Only single-use
    // stacks merge: a charged item (a wand) carries its own charges, so two
    // wands of one spell are two commands, as on the menu (10.3).
    const kept = new Map();
    const deduped = [];
    for (const item of items) {
      if (isCharged(item)) { deduped.push(item); continue; }
      const key = `${item.label}::${item.actionType}`;
      const first = kept.get(key);
      if (!first) {
        kept.set(key, item);
        deduped.push(item);
      } else if (item.itemId && first.itemId && item.itemId !== first.itemId) {
        (first.alternates ??= []).push(item.itemId);
      }
    }

    debugLog(`AbbreviationResolver: ${items.length} raw items → ${deduped.length} after dedup`);
    return deduped;
  }
}
