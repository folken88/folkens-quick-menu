/**
 * FolkenGames Quick Menu - Main Module Entry Point
 * A TTS-based hierarchical character navigation system
 */

import { QuickMenuManager } from './menu/QuickMenuManager.js';
import { CharacterDataExtractor } from './character/CharacterDataExtractor.js';
import { CharacterDataExtractorPF2e } from './character/CharacterDataExtractorPF2e.js';
import { TTSManager } from './tts/TTSManager.js';
import { KeyboardHandler } from './input/KeyboardHandler.js';
import { SystemDetector } from './system/SystemDetector.js';

// Module constants
const MODULE_ID = 'folken-games-quick-menu';

/**
 * Initialize the Quick Menu module
 */
Hooks.once('init', async function() {
  console.log(`${MODULE_ID} | Initializing FolkenGames Quick Menu`);
  
  // Register module settings
  registerSettings();
  
  // Initialize core managers
  game.folkenQuickMenu = {
    menuManager: new QuickMenuManager(),
    characterData: null, // Will be set after system detection
    tts: new TTSManager(),
    keyboard: new KeyboardHandler()
  };
});

/**
 * Setup the Quick Menu when ready
 */
Hooks.once('ready', async function() {
  console.log(`${MODULE_ID} | Setting up FolkenGames Quick Menu`);
  
  // Initialize system detector
  game.folkenQuickMenu.systemDetector = new SystemDetector();
  
  // Check system compatibility
  if (!game.folkenQuickMenu.systemDetector.checkCompatibility()) {
    console.warn(`${MODULE_ID} | Unsupported system detected: ${game.system.id}`);
    // Continue anyway for testing purposes
  }
  
  // Set appropriate character data extractor based on system
  if (game.folkenQuickMenu.systemDetector.isPF2e()) {
    game.folkenQuickMenu.characterData = CharacterDataExtractorPF2e;
    console.log(`${MODULE_ID} | Using PF2e data extractor`);
  } else {
    game.folkenQuickMenu.characterData = new CharacterDataExtractor();
    console.log(`${MODULE_ID} | Using PF1 data extractor`);
  }
  
  // Initialize the menu system
  await game.folkenQuickMenu.menuManager.initialize();
  
  // Setup keyboard listeners
  game.folkenQuickMenu.keyboard.initialize();
  
  console.log(`${MODULE_ID} | FolkenGames Quick Menu ready!`);
  
  // Add testing command for PF2e development
  if (game.folkenQuickMenu.systemDetector.isPF2e()) {
    window.debugPF2eActor = function() {
      const actor = game.folkenQuickMenu.menuManager.getCurrentActor();
      if (actor) {
        game.folkenQuickMenu.systemDetector.debugActorStructure(actor);
      } else {
        console.log('No actor found. Assign a character or select a token.');
      }
    };
    console.log(`${MODULE_ID} | PF2e testing mode: Use debugPF2eActor() in console to inspect actor data`);
  }
});

/**
 * Register module settings
 */
function registerSettings() {
  // Enable/disable the module
  game.settings.register(MODULE_ID, 'enabled', {
    name: 'Enable Quick Menu',
    hint: 'Enable or disable the Quick Menu system',
    scope: 'client',
    config: true,
    type: Boolean,
    default: true
  });
  
  // TTS settings
  game.settings.register(MODULE_ID, 'enableTTS', {
    name: 'Enable Text-to-Speech',
    hint: 'Enable TTS announcements for menu navigation',
    scope: 'client',
    config: true,
    type: Boolean,
    default: true
  });
  
  // TTS Speed setting
  game.settings.register(MODULE_ID, 'ttsSpeed', {
    name: 'TTS Speaking Speed',
    hint: 'Text-to-speech rate multiplier (100% = normal, 120% = faster)',
    scope: 'client',
    config: true,
    type: Number,
    default: 120,
    range: {
      min: 50,
      max: 200,
      step: 10
    }
  });
  
  // Debug mode
  game.settings.register(MODULE_ID, 'debugMode', {
    name: 'Debug Mode',
    hint: 'Enable debug logging and visual UI for development',
    scope: 'client',
    config: true,
    type: Boolean,
    default: false
  });
  
  // Visual UI toggle
  game.settings.register(MODULE_ID, 'showVisualUI', {
    name: 'Show Visual UI',
    hint: 'Display the compact visual interface positioned near tokens',
    scope: 'client',
    config: true,
    type: Boolean,
    default: true
  });
  
  // Activation key
  game.settings.register(MODULE_ID, 'activationKey', {
    name: 'Activation Key',
    hint: 'Key combination to open the Quick Menu (e.g., "Backquote", "F1")',
    scope: 'client',
    config: true,
    type: String,
    default: 'Backquote'
  });
}

/**
 * Utility function to get module setting
 */
export function getSetting(key) {
  return game.settings.get(MODULE_ID, key);
}

/**
 * Utility function to set module setting
 */
export function setSetting(key, value) {
  return game.settings.set(MODULE_ID, key, value);
}

/**
 * Debug logging utility
 */
export function debugLog(...args) {
  if (getSetting('debugMode')) {
    console.log(`${MODULE_ID} | DEBUG:`, ...args);
  }
}
