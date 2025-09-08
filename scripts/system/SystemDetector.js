/**
 * SystemDetector - Detects which game system is currently active
 * Provides system-specific compatibility layer
 */

import { debugLog } from '../module.js';

export class SystemDetector {
  constructor() {
    this.currentSystem = null;
    this.systemInfo = null;
    this.detectSystem();
  }

  /**
   * Detect the current game system
   */
  detectSystem() {
    if (!game || !game.system) {
      debugLog('Game system not available yet');
      return;
    }

    this.currentSystem = game.system.id;
    this.systemInfo = {
      id: game.system.id,
      title: game.system.title || game.system.data?.title,
      version: game.system.version || game.system.data?.version
    };

    debugLog('Detected system:', this.systemInfo);
  }

  /**
   * Check if current system is PF1
   */
  isPF1() {
    return this.currentSystem === 'pf1';
  }

  /**
   * Check if current system is PF2e
   */
  isPF2e() {
    return this.currentSystem === 'pf2e';
  }

  /**
   * Check if current system is supported
   */
  isSupported() {
    return this.isPF1() || this.isPF2e();
  }

  /**
   * Get system-specific configuration
   */
  getSystemConfig() {
    switch (this.currentSystem) {
      case 'pf1':
        return {
          name: 'Pathfinder 1st Edition',
          hasSpellPreparation: true,
          skillFormat: 'object', // skills are in actor.system.skills as object
          attackFormat: 'items', // attacks are items
          spellFormat: 'items',  // spells are items
          usesKnowledgeSkills: true,
          hasSkillRanks: true,
          actionTypes: ['skill', 'attack', 'spell', 'item', 'save', 'ability', 'initiative']
        };
        
      case 'pf2e':
        return {
          name: 'Pathfinder 2nd Edition',
          hasSpellPreparation: true, // PF2e has spell slots
          skillFormat: 'object', // skills are in actor.system.skills as object  
          attackFormat: 'actions', // attacks are actions/strikes
          spellFormat: 'spells', // spells have different structure
          usesKnowledgeSkills: false, // PF2e uses Lore skills instead
          hasSkillRanks: false, // PF2e uses proficiency system
          actionTypes: ['skill', 'strike', 'spell', 'action', 'save', 'ability', 'initiative']
        };
        
      default:
        return {
          name: 'Unknown System',
          hasSpellPreparation: false,
          skillFormat: 'unknown',
          attackFormat: 'unknown',
          spellFormat: 'unknown',
          usesKnowledgeSkills: false,
          hasSkillRanks: false,
          actionTypes: []
        };
    }
  }

  /**
   * Get system-specific data paths
   */
  getDataPaths() {
    switch (this.currentSystem) {
      case 'pf1':
        return {
          skills: 'system.skills',
          attacks: 'items', // filtered by type
          spells: 'items',  // filtered by type
          abilities: 'system.abilities',
          saves: 'system.attributes.savingThrows',
          hp: 'system.attributes.hp',
          ac: 'system.attributes.ac'
        };
        
      case 'pf2e':
        return {
          skills: 'system.skills',
          attacks: 'system.actions.strikes', // or items filtered by type
          spells: 'system.spells', // different structure
          abilities: 'system.abilities',
          saves: 'system.saves',
          hp: 'system.attributes.hp',
          ac: 'system.attributes.ac'
        };
        
      default:
        return {};
    }
  }

  /**
   * Get debugging information about the current actor
   */
  debugActorStructure(actor) {
    if (!actor) {
      debugLog('No actor provided for debugging');
      return;
    }

    debugLog('=== ACTOR STRUCTURE DEBUG ===');
    debugLog('System:', this.systemInfo);
    debugLog('Actor name:', actor.name);
    debugLog('Actor type:', actor.type);
    
    // Skills structure
    debugLog('Skills structure:', actor.system?.skills);
    if (actor.system?.skills) {
      const skillKeys = Object.keys(actor.system.skills).slice(0, 5); // First 5 skills
      debugLog('Sample skills:', skillKeys);
      skillKeys.forEach(key => {
        debugLog(`Skill ${key}:`, actor.system.skills[key]);
      });
    }
    
    // Items structure  
    debugLog('Items count:', actor.items?.size || 0);
    if (actor.items?.size > 0) {
      const sampleItems = Array.from(actor.items).slice(0, 3);
      sampleItems.forEach(item => {
        debugLog(`Item "${item.name}" (${item.type}):`, {
          type: item.type,
          system: item.system,
          actionType: item.system?.actionType,
          attackBonus: item.system?.attackBonus,
          spellLevel: item.system?.level?.value || item.system?.level
        });
      });
    }

    // Abilities
    debugLog('Abilities:', actor.system?.abilities);
    
    // Saves
    debugLog('Saves (PF1):', actor.system?.attributes?.savingThrows);
    debugLog('Saves (PF2e):', actor.system?.saves);

    debugLog('=== END ACTOR DEBUG ===');
  }

  /**
   * Log system compatibility warnings
   */
  checkCompatibility() {
    if (!this.isSupported()) {
      console.warn(`FolkenGames Quick Menu: System "${this.currentSystem}" is not officially supported. Supported systems: PF1, PF2e`);
      return false;
    }

    debugLog(`FolkenGames Quick Menu: Compatible with ${this.getSystemConfig().name}`);
    return true;
  }
}
