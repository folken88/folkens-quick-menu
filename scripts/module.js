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
import { ActionExecutor } from './executor/ActionExecutor.js';
import { AbbreviationResolver } from './chat/AbbreviationResolver.js';
import { ChatCommandInterceptor } from './chat/ChatCommandInterceptor.js';
import { buildApi } from './agent/AgentApi.js';

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
    keyboard: new KeyboardHandler(),
    actionExecutor: new ActionExecutor(),
    abbreviationResolver: new AbbreviationResolver(),
    chatInterceptor: null  // Initialized in ready hook
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

  // Agent API: a stable, owned-actor-scoped read surface for a player's AI
  // assistant. Exposed on the module object so it survives Foundry internals
  // changing underneath it.
  const self = game.modules.get(MODULE_ID);
  if (self) self.api = buildApi(MODULE_ID);
  console.log(`${MODULE_ID} | agent API ready`);

  // Accessibility: name the v14 chat prompt now and on every chat re-render
  applyChatInputAria();
  Hooks.on('renderChatLog', () => applyChatInputAria());
  Hooks.on('renderChatInput', () => applyChatInputAria());
  Hooks.on('changeSidebarTab', () => applyChatInputAria());

  // Initialize chat command system (always register — setting checked inside handler)
  game.folkenQuickMenu.chatInterceptor = new ChatCommandInterceptor(
    game.folkenQuickMenu.abbreviationResolver,
    game.folkenQuickMenu.actionExecutor
  );
  game.folkenQuickMenu.chatInterceptor.register();

  // Pre-build game constants (skills, saves, stats) for current actor
  try {
    const actor = game.folkenQuickMenu.menuManager.getCurrentActor();
    if (actor) {
      await game.folkenQuickMenu.abbreviationResolver.buildForActor(actor);
    }
  } catch (err) {
    console.warn(`${MODULE_ID} | Could not pre-build abbreviations:`, err);
  }

  // Suggest re-scan when actor gains or loses items
  Hooks.on('createItem', (item) => {
    const resolverId = game.folkenQuickMenu.abbreviationResolver.currentActorId;
    if (item.parent?.id === resolverId) {
      ChatMessage.create({
        whisper: [game.user.id],
        content: `<em>${item.name}</em> added. Type <strong>/scan</strong> to update your commands.`,
        speaker: { alias: 'Quick Menu' }
      });
    }
  });

  Hooks.on('deleteItem', (item) => {
    const resolverId = game.folkenQuickMenu.abbreviationResolver.currentActorId;
    if (item.parent?.id === resolverId) {
      ChatMessage.create({
        whisper: [game.user.id],
        content: `<em>${item.name}</em> removed. Type <strong>/scan</strong> to update your commands.`,
        speaker: { alias: 'Quick Menu' }
      });
    }
  });

  console.log(`${MODULE_ID} | Chat command system initialized`);

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
  
  // Chat commands
  game.settings.register(MODULE_ID, 'enableChatCommands', {
    name: 'Enable Chat Commands',
    hint: 'Enable /command shortcuts in chat (e.g., /per for Perception, /scan to build commands)',
    scope: 'client',
    config: true,
    type: Boolean,
    default: true
  });

  // TTS Provider
  game.settings.register(MODULE_ID, 'ttsProvider', {
    name: 'TTS Provider',
    hint: 'Auto tries Talking Actors → ElevenLabs → Browser. Or pick a specific provider.',
    scope: 'client',
    config: true,
    type: String,
    default: 'auto',
    choices: {
      auto: 'Auto (best available)',
      browser: 'Browser Speech API',
      elevenlabs: 'ElevenLabs API'
    }
  });

  // ElevenLabs API Key
  game.settings.register(MODULE_ID, 'elevenlabsApiKey', {
    name: 'ElevenLabs API Key',
    hint: 'Optional: Enter your ElevenLabs API key for high-quality TTS voices',
    scope: 'client',
    config: true,
    type: String,
    default: ''
  });

  // ElevenLabs Voice ID
  game.settings.register(MODULE_ID, 'elevenlabsVoiceId', {
    name: 'ElevenLabs Voice ID',
    hint: 'The ElevenLabs voice ID to use (if not using Talking Actors)',
    scope: 'client',
    config: true,
    type: String,
    default: ''
  });

  // Focus behaviour when the menu opens.
  //
  // Default ON: on Windows, NVDA and JAWS read a page in a browse mode that
  // keeps the arrow keys for themselves, and taking focus into a
  // role="application" region is the standard way to get them passed through.
  // Mac VoiceOver Quick Nav behaves the same way.
  //
  // Josh turns it OFF. His key log showed the arrows were always reaching the
  // page, so he does not need it - and taking focus drags his VoiceOver cursor
  // into the menu's off-screen box, which the page cannot put back afterwards
  // because it can only restore keyboard focus, not the VoiceOver cursor. He
  // asked for it to stay available rather than be removed, since it is what
  // other blind players may depend on.
  game.settings.register(MODULE_ID, 'grabFocusOnOpen', {
    name: 'Move Focus Into The Menu When It Opens',
    hint: 'On (default): the menu takes keyboard focus, which screen readers in browse mode (NVDA, JAWS, VoiceOver Quick Nav) need before they will pass arrow keys to it. Off: focus stays where you were, so your screen-reader cursor does not move - the menu still receives the arrow keys.',
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

  // How much detail the voice gives.
  //
  // Auto keys it to combat: short while a combat is running, fuller outside it.
  // Tobias, 2026-10-08. Tying it to combat rather than a hotkey means no new key
  // to collide with, and nothing to remember to press at the busiest moment.
  game.settings.register(MODULE_ID, 'verbosity', {
    name: 'Spoken Detail',
    hint: 'Auto: short while a combat is running, fuller out of combat. Short: always brief. Full: always the longer form, which labels each attack of a full attack.',
    scope: 'client',
    config: true,
    type: String,
    default: 'auto',
    choices: { auto: 'Auto (short in combat)', short: 'Always short', full: 'Always full' }
  });

  // Speech speed and volume keys.
  //
  // These were hard-wired to [ ] - = until 0.12.0. Foundry v13 core binds
  // BracketLeft and BracketRight to sendToBack and bringToFront, which I
  // confirmed in its own client-keybindings.mjs - so the module was silently
  // taking two of Foundry's bindings away from every player who installed it.
  // Tobias's rule, 2026-10-07: "if you report one then I think our quickmenu
  // has to move to a different command since foundry has no easy way to
  // re-write these."
  //
  // So speed moves to Comma and Period, which core leaves free, and all four
  // are settings now - a future collision is a per-player fix, not a release.
  // Minus and Equal are kept: core binds zoom to NumpadAdd/NumpadSubtract and
  // E/Q, not to the main-row keys, so there was never a clash there.
  game.settings.register(MODULE_ID, 'ttsSlowerKey', {
    name: 'Speech Slower Key',
    hint: 'KeyboardEvent.code that slows the reading voice. Default Comma. Was BracketLeft, which Foundry uses for Send to Back.',
    scope: 'client', config: true, type: String, default: 'Comma'
  });
  game.settings.register(MODULE_ID, 'ttsFasterKey', {
    name: 'Speech Faster Key',
    hint: 'KeyboardEvent.code that speeds up the reading voice. Default Period. Was BracketRight, which Foundry uses for Bring to Front.',
    scope: 'client', config: true, type: String, default: 'Period'
  });
  game.settings.register(MODULE_ID, 'ttsQuieterKey', {
    name: 'Voice Quieter Key',
    hint: 'KeyboardEvent.code that lowers the voice volume. Default Minus.',
    scope: 'client', config: true, type: String, default: 'Minus'
  });
  game.settings.register(MODULE_ID, 'ttsLouderKey', {
    name: 'Voice Louder Key',
    hint: 'KeyboardEvent.code that raises the voice volume. Default Equal.',
    scope: 'client', config: true, type: String, default: 'Equal'
  });

  // Jump-to-chat key (accessibility): focuses the chat prompt, which v14 leaves unnamed
  game.settings.register(MODULE_ID, 'chatFocusKey', {
    name: 'Jump-to-Chat Key',
    hint: 'KeyboardEvent.code that moves focus to the chat prompt (fixes v14 announcing the chat box as "new line"). Default: Backslash. Speech speed and volume keys are configurable above.',
    scope: 'client',
    config: true,
    type: String,
    default: 'Backslash'
  });
}

/**
 * Give the v14 chat prompt an accessible name. It is a ProseMirror element that ships
 * without one, so screen readers announce it as "new line". Re-applied on chat renders.
 */
export function applyChatInputAria() {
  try {
    document.querySelectorAll('.chat-input, prose-mirror.chat-input').forEach((el) => {
      if (!el.getAttribute('aria-label')) el.setAttribute('aria-label', 'Chat message');
      const inner = el.querySelector?.('[contenteditable="true"], .ProseMirror');
      if (inner && !inner.getAttribute('aria-label')) inner.setAttribute('aria-label', 'Chat message');
    });
  } catch (_) { /* non-fatal */ }
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
