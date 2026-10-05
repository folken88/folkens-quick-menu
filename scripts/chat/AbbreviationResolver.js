/**
 * AbbreviationResolver - Maps abbreviations to action items for a given actor.
 * Handles auto-generation, collision detection, player alias persistence.
 */

import { LEGACY_ALIASES, expandAbbreviation, expandAbbreviationHead, generateAbbreviation,
         isLevelledSpell, spellAbbreviation, spellAbbreviationHead } from './AbbreviationGenerator.js';
import { debugLog } from '../module.js';

const MODULE_ID = 'folken-games-quick-menu';
const FLAG_KEY = 'chatAliases';

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

    // 2. Load player aliases from actor flags
    const playerAliases = actor.getFlag(MODULE_ID, FLAG_KEY) || {};

    // 3. Build a temporary map: abbreviation -> [actionItems]
    const tempMap = new Map();

    for (const item of allActions) {
      // Check for player-assigned alias first
      let abbrev = playerAliases[item.id];

      // Otherwise auto-generate
      if (!abbrev) {
        abbrev = generateAbbreviation(item.label, item);
      }

      if (!abbrev) continue;

      abbrev = abbrev.toLowerCase();

      if (!tempMap.has(abbrev)) {
        tempMap.set(abbrev, []);
      }
      tempMap.get(abbrev).push(item);
    }

    // 4. Separate clean mappings from collisions
    for (const [abbrev, items] of tempMap) {
      if (items.length === 1) {
        this.abbreviationMap.set(abbrev, items[0]);
        this.reverseMap.set(items[0].id, abbrev);
      } else {
        // Check if any of these have player aliases — those win
        const aliased = items.filter(i => playerAliases[i.id] === abbrev);
        const unaliased = items.filter(i => playerAliases[i.id] !== abbrev);

        if (aliased.length === 1) {
          // Player explicitly chose this abbreviation for one item
          this.abbreviationMap.set(abbrev, aliased[0]);
          this.reverseMap.set(aliased[0].id, abbrev);

          // Auto-suffix the rest
          let suffix = 2;
          for (const item of unaliased) {
            const suffixed = `${abbrev}${suffix}`;
            this.abbreviationMap.set(suffixed, item);
            this.reverseMap.set(item.id, suffixed);
            suffix++;
          }
        } else {
          // Pull them apart by extending the last word until every one is
          // distinct, instead of handing out a pick-a-number prompt. The old
          // behaviour gave item one the bare code "tentatively" and then
          // shadowed it with the collision list, so that item had no working
          // command at all.
          const spread = this._spreadCollision(items);
          if (spread) {
            for (const [code, item] of spread) {
              this.abbreviationMap.set(code, item);
              this.reverseMap.set(item.id, code);
            }
          } else {
            // Could not separate them; still give every item something that
            // fires, and keep the group only for reporting in /list.
            this.collisions.set(abbrev, items);
            items.forEach((item, idx) => {
              const code = idx === 0 ? abbrev : `${abbrev}${idx + 1}`;
              this.abbreviationMap.set(code, item);
              this.reverseMap.set(item.id, code);
            });
          }
        }
      }
    }

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
  }

  /**
   * Try to give every item in a colliding group its own command by taking more
   * letters from the last word. Returns a Map(code -> item), or null if they
   * could not be separated.
   */
  _spreadCollision(items) {
    // Two strategies. Extending the last word handles "Scroll of Technomancy"
    // vs "Scroll of Teleport". Extending the first handles "Detect Magic" vs
    // "Dispel Magic", where the shared word is the last one and no amount of
    // extending it will ever separate them.
    // Spells keep their level prefix while being pulled apart, so a tiebreak
    // never costs them the thing that makes the command derivable.
    const strategies = [
      (i, extra) => isLevelledSpell(i)
        ? spellAbbreviation(i.label, i.level, extra)
        : expandAbbreviation(i.label, extra),
      (i, extra) => isLevelledSpell(i)
        ? spellAbbreviationHead(i.label, i.level, extra)
        : expandAbbreviationHead(i.label, extra),
    ];
    for (const build of strategies) {
      for (let extra = 1; extra <= 6; extra++) {
        const codes = items.map(i => build(i, extra));
        if (new Set(codes).size !== items.length) continue;
        if (codes.some(c => !c || this.abbreviationMap.has(c))) continue;
        const out = new Map();
        codes.forEach((c, i) => out.set(c, items[i]));
        return out;
      }
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
   * Clear all aliases for an actor and rebuild.
   * @param {Actor} actor
   */
  async clearAliases(actor) {
    await actor.unsetFlag(MODULE_ID, FLAG_KEY);
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

    // Deduplicate: if two items share the same label + actionType, keep the first
    const seen = new Set();
    const deduped = [];
    for (const item of items) {
      const key = `${item.label}::${item.actionType}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(item);
      }
    }

    debugLog(`AbbreviationResolver: ${items.length} raw items → ${deduped.length} after dedup`);
    return deduped;
  }
}
