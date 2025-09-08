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
      'hel': 'Heal',
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
   * Get spells for the actor
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

    // Create menu structure
    for (const [level, levelSpells] of Object.entries(spellsByLevel)) {
      const levelName = level === '0' ? 'Cantrips' : `Level ${level}`;
      
      if (levelSpells.length > 0) {
        // Add level header
        spells.push({
          id: `spell_level_${level}`,
          label: `--- ${levelName} ---`,
          type: 'header'
        });
        
        // Add spells for this level
        levelSpells.forEach(spell => {
          spells.push({
            id: `spell_${spell.id}`,
            label: spell.name,
            type: 'action',
            actionType: 'spell',
            itemId: spell.id,
            level: parseInt(level),
            school: spell.system.school || 'none'
          });
        });
      }
    }

    return spells;
  }

  /**
   * Get items for the actor
   */
  getItems(actor) {
    debugLog('Getting items for actor:', actor.name);
    
    const items = [];
    const usableItems = actor.items.filter(item => 
      ['consumable', 'equipment', 'loot'].includes(item.type) &&
      item.system.uses?.max > 0
    );

    usableItems.forEach(item => {
      items.push({
        id: `item_${item.id}`,
        label: item.name,
        type: 'action',
        actionType: 'item',
        itemId: item.id,
        quantity: item.system.quantity || 1,
        uses: item.system.uses || null
      });
    });

    return items.sort((a, b) => a.label.localeCompare(b.label));
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
}
