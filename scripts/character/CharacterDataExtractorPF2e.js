/**
 * CharacterDataExtractorPF2e - PF2e-specific character data extraction
 * Handles PF2e actor structure and data formats
 */

import { debugLog } from '../module.js';

export class CharacterDataExtractorPF2e {
  
  /**
   * Get skills from PF2e actor
   */
  static getSkills(actor) {
    debugLog('PF2e getSkills called for:', actor.name);
    
    if (!actor.system?.skills) {
      debugLog('No skills found on PF2e actor');
      return [];
    }

    const skills = [];
    
    // PF2e skills structure
    for (const [skillId, skillData] of Object.entries(actor.system.skills)) {
      if (!skillData) continue;
      
      // PF2e skills have different structure than PF1
      const skill = {
        type: 'skill',
        id: skillId,
        label: skillData.label || game.i18n.localize(skillData.label) || skillId,
        actionType: 'skill',
        proficiency: skillData.rank || 0, // PF2e uses ranks (untrained=0, trained=1, expert=2, master=3, legendary=4)
        modifier: skillData.mod || skillData.totalModifier || 0,
        ability: skillData.ability || skillData.attribute,
        armor: skillData.armor || false // armor check penalty applies
      };

      skills.push(skill);
    }

    // Add Lore skills (PF2e equivalent of Knowledge skills)
    const loreSkills = this.getLoreSkills(actor);
    skills.push(...loreSkills);

    debugLog('PF2e skills extracted:', skills.length);
    return skills.sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Get Lore skills from PF2e actor (equivalent to Knowledge skills in PF1)
   */
  static getLoreSkills(actor) {
    const loreSkills = [];
    
    // PF2e Lore skills might be stored as items or in skills
    if (actor.items) {
      for (const item of actor.items) {
        if (item.type === 'lore') {
          loreSkills.push({
            type: 'skill',
            id: `lore-${item.id}`,
            label: item.name,
            actionType: 'skill',
            proficiency: item.system?.proficient?.value || 0,
            modifier: item.system?.mod || 0,
            isLore: true
          });
        }
      }
    }

    return loreSkills;
  }

  /**
   * Get attacks/strikes from PF2e actor
   */
  static getAttacks(actor) {
    debugLog('PF2e getAttacks called for:', actor.name);
    
    const attacks = [];

    // PF2e strikes are stored differently than PF1
    if (actor.system?.actions?.strikes) {
      for (const strike of actor.system.actions.strikes) {
        const itemId = strike.item?.id;
        attacks.push({
          type: 'strike',
          id: strike.slug || itemId,
          label: strike.label || strike.item?.name,
          actionType: 'strike',
          attackBonus: strike.totalModifier || strike.attack,
          damage: strike.damage,
          weapon: strike.item,
          traits: strike.traits || [],
          // Add PF2e-specific data for rollItemMacro
          actorId: actor.id,
          itemId: itemId,
          macroPath: itemId ? `Actor.${actor.id}.Item.${itemId}` : null
        });
      }
    }

    // Also check for weapon items that can be used as attacks
    if (actor.items) {
      for (const item of actor.items) {
        if (item.type === 'weapon' && item.system?.equipped?.value) {
          attacks.push({
            type: 'attack',
            id: item.id,
            label: item.name,
            actionType: 'attack',
            attackBonus: item.system?.attack?.value || 0,
            damage: item.system?.damage,
            weapon: item,
            traits: item.system?.traits?.value || [],
            // Add PF2e-specific data for rollItemMacro
            actorId: actor.id,
            itemId: item.id,
            macroPath: `Actor.${actor.id}.Item.${item.id}`
          });
        }
      }
    }

    debugLog('PF2e attacks extracted:', attacks.length);
    return attacks;
  }

  /**
   * Get spells from PF2e actor
   */
  static getSpells(actor) {
    debugLog('PF2e getSpells called for:', actor.name);
    
    const spellLevels = [];

    // PF2e spell structure is different - spells are organized by tradition and level
    if (actor.system?.spells) {
      for (const [traditionKey, tradition] of Object.entries(actor.system.spells)) {
        if (!tradition.spells) continue;

        for (const [levelKey, levelData] of Object.entries(tradition.spells)) {
          const level = parseInt(levelKey);
          if (isNaN(level)) continue;

          const levelName = level === 0 ? 'Cantrips' : `${this.getOrdinal(level)} Level Spells`;
          
          spellLevels.push({
            type: 'spell_level',
            id: `${traditionKey}-${level}`,
            label: `${levelName} (${tradition.name || traditionKey})`,
            actionType: 'submenu',
            spellLevel: level,
            tradition: traditionKey,
            displayNumber: level,
            slots: levelData.max || 0,
            used: levelData.value || 0
          });
        }
      }
    }

    // Also check for spell items directly
    const spellItems = this.getSpellItems(actor);
    if (spellItems.length > 0 && spellLevels.length === 0) {
      // Fallback to item-based spell organization
      return this.organizeSpellsByLevel(spellItems);
    }

    debugLog('PF2e spell levels extracted:', spellLevels.length);
    return spellLevels.sort((a, b) => a.spellLevel - b.spellLevel);
  }

  /**
   * Get spells for a specific level in PF2e
   */
  static getSpellsForLevel(actor, spellLevel, tradition = null) {
    debugLog('PF2e getSpellsForLevel called:', { spellLevel, tradition });
    
    const spells = [];

    // Get spells from system structure
    if (actor.system?.spells && tradition) {
      const traditionData = actor.system.spells[tradition];
      const levelData = traditionData?.spells?.[spellLevel];
      
      if (levelData?.spells) {
        for (const spell of levelData.spells) {
          spells.push({
            type: 'spell',
            id: spell.id,
            label: spell.name,
            actionType: 'spell',
            spellLevel: spellLevel,
            tradition: tradition,
            prepared: spell.expended !== undefined ? !spell.expended : true,
            uses: spell.uses || levelData.max || 0,
            // Add PF2e-specific data for rollItemMacro
            actorId: actor.id,
            itemId: spell.id,
            macroPath: `Actor.${actor.id}.Item.${spell.id}`
          });
        }
      }
    }

    // Fallback to items
    if (spells.length === 0) {
      const spellItems = this.getSpellItems(actor, spellLevel);
      spells.push(...spellItems);
    }

    debugLog('PF2e spells for level extracted:', spells.length);
    return spells;
  }

  /**
   * Get spell items from actor
   */
  static getSpellItems(actor, targetLevel = null) {
    const spells = [];

    if (actor.items) {
      for (const item of actor.items) {
        if (item.type === 'spell') {
          const level = item.system?.level?.value || 0;
          
          if (targetLevel === null || level === targetLevel) {
            spells.push({
              type: 'spell',
              id: item.id,
              label: item.name,
              actionType: 'spell',
              spellLevel: level,
              prepared: true, // PF2e spell items are usually prepared
              item: item,
              // Add PF2e-specific data for rollItemMacro
              actorId: actor.id,
              itemId: item.id,
              macroPath: `Actor.${actor.id}.Item.${item.id}`
            });
          }
        }
      }
    }

    return spells;
  }

  /**
   * Organize spell items by level
   */
  static organizeSpellsByLevel(spellItems) {
    const levels = new Map();

    for (const spell of spellItems) {
      const level = spell.spellLevel;
      if (!levels.has(level)) {
        const levelName = level === 0 ? 'Cantrips' : `${this.getOrdinal(level)} Level Spells`;
        levels.set(level, {
          type: 'spell_level',
          id: `spell-level-${level}`,
          label: levelName,
          actionType: 'submenu',
          spellLevel: level,
          displayNumber: level
        });
      }
    }

    return Array.from(levels.values()).sort((a, b) => a.spellLevel - b.spellLevel);
  }

  /**
   * Get items from PF2e actor
   */
  static getItems(actor) {
    debugLog('PF2e getItems called for:', actor.name);
    
    // Return item categories
    return [
      {
        type: 'item_category',
        id: 'consumables',
        label: 'Consumables',
        actionType: 'submenu'
      },
      {
        type: 'item_category', 
        id: 'equipment',
        label: 'Equipment',
        actionType: 'submenu'
      },
      {
        type: 'item_category',
        id: 'treasure',
        label: 'Treasure',
        actionType: 'submenu'
      }
    ];
  }

  /**
   * Get items by category for PF2e actor
   */
  static getItemsByCategory(actor, category) {
    debugLog('PF2e getItemsByCategory called for:', actor.name, 'category:', category);
    
    const items = [];
    
    if (actor.items) {
      for (const item of actor.items) {
        let includeItem = false;
        
        switch (category) {
          case 'consumables':
            includeItem = item.type === 'consumable' || 
                         (item.type === 'equipment' && item.system?.consumableType) ||
                         item.type === 'potion' || item.type === 'scroll';
            break;
          case 'equipment':
            includeItem = item.type === 'equipment' || item.type === 'weapon' || 
                         item.type === 'armor' || item.type === 'shield';
            break;
          case 'treasure':
            includeItem = item.type === 'treasure' || item.type === 'loot';
            break;
        }
        
        if (includeItem) {
          items.push({
            type: 'item_actions',
            id: item.id,
            label: item.name,
            actionType: 'submenu',
            item: item,
            quantity: item.system?.quantity || 1,
            // Add PF2e-specific data for rollItemMacro
            actorId: actor.id,
            itemId: item.id,
            macroPath: `Actor.${actor.id}.Item.${item.id}`
          });
        }
      }
    }
    
    debugLog('PF2e items for category extracted:', items.length);
    return items.sort((a, b) => a.label.localeCompare(b.label));
  }

  /**
   * Get available actions for a specific item
   */
  static getItemActions(actor, itemId) {
    debugLog('PF2e getItemActions called for:', itemId);
    
    const item = actor.items.get(itemId);
    if (!item) return [];
    
    const actions = [];
    const macroPath = `Actor.${actor.id}.Item.${item.id}`;
    
    // Check if item can be equipped/unequipped
    if (item.type === 'weapon' || item.type === 'armor' || item.type === 'equipment') {
      const isEquipped = item.system?.equipped?.value || false;
      
      if (isEquipped) {
        actions.push({
          type: 'item_action',
          id: `unequip_${item.id}`,
          label: 'Unequip',
          actionType: 'item_unequip',
          itemId: item.id,
          actorId: actor.id,
          macroPath: macroPath,
          item: item
        });
      } else {
        actions.push({
          type: 'item_action', 
          id: `equip_${item.id}`,
          label: 'Equip',
          actionType: 'item_equip',
          itemId: item.id,
          actorId: actor.id,
          macroPath: macroPath,
          item: item
        });
      }
    }
    
    // Check if item can be activated (has uses or activation)
    if (item.system?.uses?.max > 0 || item.system?.activation?.type) {
      actions.push({
        type: 'item_action',
        id: `activate_${item.id}`,
        label: 'Activate',
        actionType: 'item_activate',
        itemId: item.id,
        actorId: actor.id,
        macroPath: macroPath,
        item: item
      });
    }
    
    // Check if weapon can be used to attack
    if (item.type === 'weapon' && item.system?.equipped?.value) {
      actions.push({
        type: 'item_action',
        id: `attack_${item.id}`,
        label: 'Attack',
        actionType: 'attack',
        itemId: item.id,
        actorId: actor.id,
        macroPath: macroPath,
        item: item
      });
    }
    
    // Consumables can be consumed
    if (item.type === 'consumable') {
      actions.push({
        type: 'item_action',
        id: `consume_${item.id}`,
        label: 'Consume',
        actionType: 'item_consume',
        itemId: item.id,
        actorId: actor.id,
        macroPath: macroPath,
        item: item
      });
    }
    
    // Always allow inspection/details
    actions.push({
      type: 'item_action',
      id: `inspect_${item.id}`,
      label: 'Inspect',
      actionType: 'item_inspect',
      itemId: item.id,
      actorId: actor.id,
      item: item
    });
    
    debugLog('PF2e item actions generated:', actions.length);
    return actions;
  }

  /**
   * Get PF2e actions organized by skill categories
   */
  static getActions(actor) {
    debugLog('PF2e getActions called for:', actor.name);
    
    if (!game.pf2e?.actions) {
      debugLog('PF2e actions not available');
      return [];
    }
    
    // Return action categories instead of individual actions
    return [
      {
        type: 'action_category',
        id: 'athletics',
        label: 'Athletics',
        actionType: 'submenu',
        displayNumber: 1
      },
      {
        type: 'action_category',
        id: 'acrobatics',
        label: 'Acrobatics',
        actionType: 'submenu',
        displayNumber: 2
      },
      {
        type: 'action_category',
        id: 'stealth',
        label: 'Stealth',
        actionType: 'submenu',
        displayNumber: 3
      },
      {
        type: 'action_category',
        id: 'deception',
        label: 'Deception',
        actionType: 'submenu',
        displayNumber: 4
      },
      {
        type: 'action_category',
        id: 'diplomacy',
        label: 'Diplomacy',
        actionType: 'submenu',
        displayNumber: 5
      },
      {
        type: 'action_category',
        id: 'intimidation',
        label: 'Intimidation',
        actionType: 'submenu',
        displayNumber: 6
      },
      {
        type: 'action_category',
        id: 'medicine',
        label: 'Medicine',
        actionType: 'submenu',
        displayNumber: 7
      },
      {
        type: 'action_category',
        id: 'thievery',
        label: 'Thievery',
        actionType: 'submenu',
        displayNumber: 8
      },
      {
        type: 'action_category',
        id: 'survival',
        label: 'Survival',
        actionType: 'submenu',
        displayNumber: 9
      },
      {
        type: 'action_category',
        id: 'crafting',
        label: 'Crafting',
        actionType: 'submenu',
        displayNumber: 10
      },
      {
        type: 'action_category',
        id: 'general',
        label: 'General',
        actionType: 'submenu',
        displayNumber: 11
      }
    ];
  }

  /**
   * Get actions for a specific category
   */
  static getActionsByCategory(actor, category) {
    debugLog('PF2e getActionsByCategory called for:', actor.name, 'category:', category);
    
    if (!game.pf2e?.actions) {
      debugLog('PF2e actions not available');
      return [];
    }
    
    // Define actions by skill category
    const actionCategories = {
      athletics: ['climb', 'disarm', 'forceOpen', 'grapple', 'highJump', 'longJump', 'reposition', 'shove', 'swim', 'trip', 'whirlingThrow'],
      acrobatics: ['balance', 'maneuverInFlight', 'squeeze', 'tumbleThrough', 'escape'],
      stealth: ['avoidNotice', 'concealAnObject', 'hide', 'sneak'],
      deception: ['createADiversion', 'feint', 'impersonate', 'lie', 'createForgery'],
      diplomacy: ['gatherInformation', 'makeAnImpression', 'request', 'bonMot'],
      intimidation: ['coerce', 'demoralize'],
      medicine: ['administerFirstAid', 'treatDisease', 'treatPoison', 'treatWounds'],
      thievery: ['palmAnObject', 'disableDevice', 'pickALock', 'steal'],
      survival: ['seek', 'senseDirection', 'track', 'subsist', 'commandAnAnimal'],
      crafting: ['craft', 'repair', 'decipherWriting'],
      general: ['encouragingWords', 'raiseAShield', 'restForTheNight', 'earnIncome', 'steelYourResolve', 'takeABreather', 'senseMotive', 'arcaneSlam', 'tamper', 'perform']
    };
    
    const categoryActions = actionCategories[category] || [];
    const actions = [];
    
    // Build menu items for this category
    categoryActions.forEach((actionKey, index) => {
      if (game.pf2e.actions[actionKey]) {
        actions.push({
          type: 'pf2e_action',
          id: actionKey,
          label: this.formatActionName(actionKey),
          actionType: 'pf2e_action',
          actionKey: actionKey,
          displayNumber: index + 1
        });
      }
    });
    
    debugLog('PF2e actions for category extracted:', actions.length);
    return actions;
  }

  /**
   * Format action names for display (camelCase to Title Case)
   */
  static formatActionName(actionKey) {
    // Convert camelCase to Title Case
    return actionKey
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  }

  /**
   * Get abilities from PF2e actor
   */
  static getAbilities() {
    return [
      { type: 'ability', id: 'str', label: 'Strength', actionType: 'ability', abilityKey: 'str' },
      { type: 'ability', id: 'dex', label: 'Dexterity', actionType: 'ability', abilityKey: 'dex' },
      { type: 'ability', id: 'con', label: 'Constitution', actionType: 'ability', abilityKey: 'con' },
      { type: 'ability', id: 'int', label: 'Intelligence', actionType: 'ability', abilityKey: 'int' },
      { type: 'ability', id: 'wis', label: 'Wisdom', actionType: 'ability', abilityKey: 'wis' },
      { type: 'ability', id: 'cha', label: 'Charisma', actionType: 'ability', abilityKey: 'cha' }
    ];
  }

  /**
   * Get saving throws from PF2e actor
   */
  static getSavingThrows() {
    return [
      { type: 'save', id: 'fortitude', label: 'Fortitude', actionType: 'save' },
      { type: 'save', id: 'reflex', label: 'Reflex', actionType: 'save' },
      { type: 'save', id: 'will', label: 'Will', actionType: 'save' }
    ];
  }

  /**
   * Alias for getSavingThrows to match QuickMenuManager expectations
   */
  static getSaves() {
    return this.getSavingThrows();
  }

  /**
   * Get character statistics
   */
  static getStats() {
    return [
      { type: 'stat', id: 'initiative', label: 'Initiative', actionType: 'initiative' },
      { type: 'stat', id: 'perception', label: 'Perception', actionType: 'skill', skillKey: 'perception' }
    ];
  }

  /**
   * Get ordinal suffix for numbers (1st, 2nd, 3rd, etc.)
   */
  static getOrdinal(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
}
