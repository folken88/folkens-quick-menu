/**
 * CharacterDataExtractor - Extract character data for menu population
 * Handles PF1 and PF2e actor data extraction
 */

import { debugLog } from '../module.js';

export class CharacterDataExtractor {
  constructor() {
    this.systemType = game.system.id;
  }

  /**
   * Get all skills for the actor
   */
  getSkills(actor) {
    debugLog('Getting skills for actor:', actor.name);
    
    if (this.systemType === 'pf1') {
      return this.getPF1Skills(actor);
    } else if (this.systemType === 'pf2e') {
      return this.getPF2eSkills(actor);
    }
    
    return [];
  }

  /**
   * Get PF1 skills
   */
  getPF1Skills(actor) {
    const skills = [];
    const actorSkills = actor.system.skills;
    
    // Common PF1 skills
    const skillMap = {
      'acr': 'Acrobatics',
      'apr': 'Appraise',
      'art': 'Artistry',
      'blf': 'Bluff',
      'clm': 'Climb',
      'crf': 'Craft',
      'dip': 'Diplomacy',
      'dev': 'Disable Device',
      'dis': 'Disguise',
      'esc': 'Escape Artist',
      'fly': 'Fly',
      'han': 'Handle Animal',
      'hea': 'Heal',
      'int': 'Intimidate',
      'kar': 'Knowledge (Arcana)',
      'kdu': 'Knowledge (Dungeoneering)',
      'ken': 'Knowledge (Engineering)',
      'kge': 'Knowledge (Geography)',
      'khi': 'Knowledge (History)',
      'klo': 'Knowledge (Local)',
      'kna': 'Knowledge (Nature)',
      'kno': 'Knowledge (Nobility)',
      'kpl': 'Knowledge (Planes)',
      'kre': 'Knowledge (Religion)',
      'lin': 'Linguistics',
      'lor': 'Lore',
      'per': 'Perception',
      'prf': 'Perform',
      'pro': 'Profession',
      'rid': 'Ride',
      'sen': 'Sense Motive',
      'slt': 'Sleight of Hand',
      'spl': 'Spellcraft',
      'ste': 'Stealth',
      'sur': 'Survival',
      'swm': 'Swim',
      'umd': 'Use Magic Device'
    };

    for (const [key, name] of Object.entries(skillMap)) {
      if (actorSkills[key]) {
        skills.push({
          id: `skill_${key}`,
          label: name,
          type: 'action',
          actionType: 'skill',
          skillKey: key,
          modifier: actorSkills[key].mod || 0
        });
      }
    }

    // Subskills. PF1 stores Profession/Craft/Perform/Artistry/Lore entries under
    // skills.<key>.subSkills with their own names, so walking only the top level
    // leaves "Profession (Sailor)" with no command of its own.
    for (const [key, name] of Object.entries(skillMap)) {
      const subs = actorSkills[key]?.subSkills;
      if (!subs) continue;
      for (const [subKey, sub] of Object.entries(subs)) {
        if (!sub) continue;
        const subName = sub.name || subKey;
        skills.push({
          id: `skill_${key}_${subKey}`,
          label: `${name} (${subName})`,
          type: 'action',
          actionType: 'skill',
          skillKey: `${key}.subSkills.${subKey}`,
          // Abbreviate from the parenthetical, not the parent: Sailor -> sail,
          // so every Profession does not collapse onto the same command.
          abbrevHint: subName,
          modifier: sub.mod || 0
        });
      }
    }

    return skills.sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Get PF2e skills (placeholder)
   */
  getPF2eSkills(actor) {
    // TODO: Implement PF2e skills when needed
    return [];
  }

  /**
   * Get combat actions for the actor (expanded from attacks)
   */
  getCombat(actor) {
    debugLog('Getting combat actions for actor:', actor.name);
    
    const combatActions = [];
    
    // Add weapon attacks
    const weapons = actor.items.filter(item => 
      item.type === 'weapon' || item.type === 'attack'
    );

    weapons.forEach(weapon => {
      combatActions.push({
        id: `attack_${weapon.id}`,
        label: weapon.name,
        type: 'action',
        actionType: 'attack',
        itemId: weapon.id,
        attackBonus: weapon.system.attackBonus || 0,
        damage: weapon.system.damage?.parts || []
      });
    });

    // Add initiative
    combatActions.push({
      id: 'initiative',
      label: 'Initiative',
      type: 'action',
      actionType: 'initiative'
    });

    // Add stabilize
    combatActions.push({
      id: 'stabilize',
      label: 'Stabilize',
      type: 'action',
      actionType: 'stabilize'
    });

    // Caster level and concentration.
    // PF1 does NOT model spellbooks as items - they live on the actor at
    // system.attributes.spells.spellbooks - so the old items-of-type-spellbook
    // lookup always found nothing and these two commands never existed.
    const books = actor.system?.attributes?.spells?.spellbooks ?? {};
    const inUse = Object.entries(books).filter(([, b]) => b && b.inUse);
    if (inUse.length > 0) {
      const [bookKey, book] = inUse[0];
      const label = book.label || book.name || bookKey;
      combatActions.push({
        id: 'caster_level',
        label: 'Caster Level Check',
        type: 'action',
        actionType: 'caster_level',
        spellbookKey: bookKey,
        spellbook: label,
        casterLevel: book.cl?.total ?? actor.system.details?.level?.value ?? 1
      });
      combatActions.push({
        id: 'concentration',
        label: 'Concentration Check',
        type: 'action',
        actionType: 'concentration',
        spellbookKey: bookKey,
        spellbook: label,
        concentrationBonus: book.concentration?.total ?? 0
      });
    }

    return combatActions;
  }

  /**
   * Get attacks for the actor
   */
  getAttacks(actor) {
    debugLog('Getting attacks for actor:', actor.name);
    
    const attacks = [];
    const weapons = actor.items.filter(item => 
      item.type === 'weapon' || item.type === 'attack'
    );

    weapons.forEach(weapon => {
      attacks.push({
        id: `attack_${weapon.id}`,
        label: weapon.name,
        type: 'action',
        actionType: 'attack',
        itemId: weapon.id,
        attackBonus: weapon.system.attackBonus || 0,
        damage: weapon.system.damage?.parts || []
      });
    });

    return attacks;
  }

  /**
   * Get spells for the actor - now returns spell levels as submenus
   */
  getSpells(actor) {
    debugLog('Getting spells for actor:', actor.name);
    
    const spells = [];
    const spellItems = actor.items.filter(item => item.type === 'spell');

    // Group spells by level
    const spellsByLevel = {};
    spellItems.forEach(spell => {
      const level = spell.system.level || 0;
      if (!spellsByLevel[level]) {
        spellsByLevel[level] = [];
      }
      spellsByLevel[level].push(spell);
    });

    // Create spell level submenus
    for (const [level, levelSpells] of Object.entries(spellsByLevel).sort((a, b) => parseInt(a[0]) - parseInt(b[0]))) {
      if (levelSpells.length > 0) {
        const levelName = level === '0' ? '0 Level Spells' : `${level}${this.getOrdinalSuffix(level)} Level Spells`;
        
        spells.push({
          id: `spell_level_${level}`,
          label: levelName,
          type: 'submenu',
          spellLevel: parseInt(level),
          displayNumber: parseInt(level), // Use spell level as display number
          spells: levelSpells
        });
      }
    }

    return spells;
  }

  /**
   * Get spells for a specific spell level - SIMPLIFIED VERSION
   */
  getSpellsForLevel(actor, spellLevel) {
    debugLog('Getting spells for level:', spellLevel);
    
    const spellItems = actor.items.filter(item => 
      item.type === 'spell' && (item.system.level || 0) === spellLevel
    );

    debugLog(`Found ${spellItems.length} spells for level ${spellLevel}`);

    // Return individual spells directly (no preparation submenus)
    const result = spellItems.map(spell => {
      // Use preparation.value for PF1 (currently prepared count)
      const preparedCount = spell.system.preparation?.value || 0;
      return {
        id: `spell_${spell.id}`,
        label: spell.name,
        type: 'action',
        actionType: 'spell',
        itemId: spell.id,
        level: spellLevel,
        prepared: preparedCount > 0,
        school: spell.system.school || 'none'
      };
    });

    debugLog('Direct spell actions created:', result);
    return result;
  }

  /**
   * Get individual spells for a preparation type
   */
  getSpellsByPreparation(actor, spellLevel, preparationType) {
    debugLog('Getting spells by preparation:', spellLevel, preparationType);
    
    const spellItems = actor.items.filter(item => 
      item.type === 'spell' && (item.system.level || 0) === spellLevel
    );

    debugLog(`Found ${spellItems.length} total spells for level ${spellLevel}`);

    const isPrepped = preparationType === 'prepared';
    const filteredSpells = spellItems.filter(spell => 
      (spell.system.preparation?.prepared || false) === isPrepped
    );

    debugLog(`Filtered to ${filteredSpells.length} ${preparationType} spells`);

    const result = filteredSpells.map(spell => ({
      id: `spell_${spell.id}`,
      label: spell.name,
      type: 'action',
      actionType: 'spell',
      itemId: spell.id,
      level: spellLevel,
      prepared: isPrepped,
      school: spell.system.school || 'none'
    }));

    debugLog('Spell actions created:', result);
    return result;
  }

  /**
   * Get ordinal suffix for numbers
   */
  getOrdinalSuffix(num) {
    const n = parseInt(num);
    if (n >= 11 && n <= 13) return 'th';
    switch (n % 10) {
      case 1: return 'st';
      case 2: return 'nd';
      case 3: return 'rd';
      default: return 'th';
    }
  }

  /**
   * Get items for the actor - now returns item categories as submenus
   */
  getItems(actor) {
    debugLog('Getting items for actor:', actor.name);
    
    // Return refined item categories
    return [
      {
        id: 'consumables',
        label: 'Consumables',
        type: 'item_category',
        actionType: 'submenu'
      },
      {
        id: 'equipment',
        label: 'Equipment',
        type: 'item_category', 
        actionType: 'submenu'
      },
      {
        id: 'containers',
        label: 'Containers',
        type: 'item_category',
        actionType: 'submenu'
      }
    ];
  }

  /**
   * Get items for a specific category
   */
  getItemsByCategory(actor, category) {
    debugLog('Getting items by category:', category);
    
    const allItems = actor.items.filter(item => 
      ['consumable', 'equipment', 'loot', 'weapon', 'container'].includes(item.type)
    );

    let filteredItems = [];

    allItems.forEach(item => {
      const itemData = {
        id: `item_${item.id}`,
        label: item.name,
        type: 'action',
        actionType: 'item',
        itemId: item.id,
        quantity: item.system.quantity || 1,
        uses: item.system.uses || null,
        originalItem: item
      };

      switch (category) {
        case 'consumables':
          // Potions, scrolls, wands only
          if (item.type === 'consumable' && 
              (item.system.consumableType === 'potion' || 
               item.system.consumableType === 'scroll' ||
               item.system.consumableType === 'wand' ||
               item.name.toLowerCase().includes('potion') ||
               item.name.toLowerCase().includes('scroll') ||
               item.name.toLowerCase().includes('wand'))) {
            filteredItems.push(itemData);
          }
          break;
        case 'equipment':
          // Rings, belts, books, magic/tech items that can be activated
          if (item.type === 'equipment' && 
              (item.system.uses?.max > 0 || 
               item.system.activation?.type ||
               item.system.equipped)) {
            filteredItems.push(itemData);
          }
          break;
        case 'containers':
          // Containers and their contents
          if (item.type === 'container' || item.type === 'loot') {
            // For containers, create submenu with contents
            if (item.system.contents && item.system.contents.length > 0) {
              itemData.type = 'container_category';
              itemData.actionType = 'submenu';
              itemData.containerContents = item.system.contents;
            }
            filteredItems.push(itemData);
          }
          break;
      }
    });

    return filteredItems.sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Get special abilities for the actor
   */
  getAbilities(actor) {
    debugLog('Getting abilities for actor:', actor.name);
    
    const abilities = [];
    const features = actor.items.filter(item => 
      ['feat', 'class'].includes(item.type) &&
      (item.system.uses?.max > 0 || item.system.activation?.type)
    );

    features.forEach(feature => {
      abilities.push({
        id: `ability_${feature.id}`,
        label: feature.name,
        type: 'action',
        actionType: 'item',
        itemId: feature.id,
        uses: feature.system.uses || null,
        activation: feature.system.activation || null
      });
    });

    return abilities.sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Get saving throws for the actor
   */
  getSaves(actor) {
    debugLog('Getting saves for actor:', actor.name);
    
    if (this.systemType === 'pf1') {
      return [
        {
          id: 'save_fort',
          label: 'Fortitude Save',
          type: 'action',
          actionType: 'save',
          saveType: 'fort',
          modifier: actor.system.attributes.savingThrows.fort.total || 0
        },
        {
          id: 'save_ref',
          label: 'Reflex Save',
          type: 'action',
          actionType: 'save',
          saveType: 'ref',
          modifier: actor.system.attributes.savingThrows.ref.total || 0
        },
        {
          id: 'save_will',
          label: 'Will Save',
          type: 'action',
          actionType: 'save',
          saveType: 'will',
          modifier: actor.system.attributes.savingThrows.will.total || 0
        }
      ];
    }
    
    return [];
  }

  /**
   * Get basic statistics for the actor
   */
  getStats(actor) {
    debugLog('Getting stats for actor:', actor.name);
    
    const stats = [];
    
    if (this.systemType === 'pf1') {
      const abilities = actor.system.abilities;
      
      // Ability scores
      const abilityMap = {
        'str': 'Strength',
        'dex': 'Dexterity',
        'con': 'Constitution',
        'int': 'Intelligence',
        'wis': 'Wisdom',
        'cha': 'Charisma'
      };
      
      for (const [key, name] of Object.entries(abilityMap)) {
        if (abilities[key]) {
        stats.push({
          id: `stat_${key}`,
          label: `${name} Check`,
          type: 'action',
          actionType: 'ability',
          abilityKey: key,
          modifier: abilities[key].mod || 0
        });
        }
      }
      
      // Initiative
      stats.push({
        id: 'stat_initiative',
        label: 'Initiative',
        type: 'action',
        actionType: 'initiative',
        modifier: actor.system.attributes.init.total || 0
      });
    }

    return stats;
  }

  /* ─── Character state reads (for /status, /hp, /conditions, /buffs) ─── */

  /** Full state snapshot. Formatting is left to the caller (chat / voice / menu). */
  getStatus(actor) {
    return {
      hp: this.getHP(actor),
      ac: this.getAC(actor),
      abilityDamage: this.getAbilityDamage(actor),
      conditions: this.getConditions(actor),
      buffs: this.getBuffs(actor)
    };
  }

  getHP(actor) {
    const hp = actor.system?.attributes?.hp || {};
    return {
      value: hp.value ?? 0,
      max: hp.max ?? 0,
      temp: hp.temp ?? 0,
      nonlethal: hp.nonlethal ?? 0
    };
  }

  getAC(actor) {
    const ac = actor.system?.attributes?.ac || {};
    return {
      normal: ac.normal?.total ?? null,
      touch: ac.touch?.total ?? null,
      flatFooted: ac.flatFooted?.total ?? null
    };
  }

  getAbilityDamage(actor) {
    const out = [];
    const abilities = actor.system?.abilities || {};
    const names = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
    for (const [key, ab] of Object.entries(abilities)) {
      const damage = ab?.damage || 0;
      const drain = ab?.drain || 0;
      if (damage || drain) out.push({ key, name: names[key] || key, damage, drain });
    }
    return out;
  }

  getConditions(actor) {
    const active = [];
    try {
      // Core status set (v11+) is the reliable source for applied conditions
      if (actor.statuses?.size) {
        for (const id of actor.statuses) active.push(this._conditionLabel(id));
      }
      // PF1 also mirrors some conditions as a boolean map — merge any not already listed
      const conds = actor.system?.conditions;
      if (conds && typeof conds === 'object') {
        for (const [key, on] of Object.entries(conds)) {
          if (on) { const l = this._conditionLabel(key); if (!active.includes(l)) active.push(l); }
        }
      }
    } catch (_) {}
    return active;
  }

  _conditionLabel(key) {
    try {
      const cfg = globalThis.pf1?.config?.conditions?.[key] ?? CONFIG?.PF1?.conditions?.[key];
      const raw = typeof cfg === 'string' ? cfg : cfg?.name || cfg?.label;
      if (raw) return game.i18n?.localize(raw) || raw;
      const core = CONFIG?.statusEffects?.find(s => s.id === key);
      if (core) return game.i18n?.localize(core.name || core.label) || key;
    } catch (_) {}
    return key.charAt(0).toUpperCase() + key.slice(1);
  }

  getBuffs(actor) {
    try {
      return actor.items
        .filter(i => i.type === 'buff' && i.system?.active === true)
        .map(i => i.name);
    } catch (_) {
      return [];
    }
  }
}
