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
import { spellOut } from './chat/AbbreviationGenerator.js';
import { buildApi } from './agent/AgentApi.js';
import { itemChangeNeedsRebuild } from './chat/RebuildTriggers.js';

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

  // Dice So Nice went silent in fresh tabs (Josh, 2026-10-09). It queues its
  // sound preloads on game.audio.pending, which Foundry runs once, on the
  // first click or key - and anything queued after that is never run, so the
  // dice animate in silence. Josh's own workaround each session was to run the
  // queue by hand. This does the same: once audio is unlocked, anything left
  // waiting is run. It only ever runs what was already meant to run.
  setInterval(() => {
    try {
      const audio = game.audio;
      if (!audio || audio.locked || !Array.isArray(audio.pending) || !audio.pending.length) return;
      for (const fn of audio.pending.splice(0)) {
        try { fn(); } catch (_) { /* one bad preload must not stop the rest */ }
      }
    } catch (_) { /* never let this break anything */ }
  }, 2000);

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

  // A gained item gets its command at once, and the command is spoken. Josh,
  // 2026-11-01: "When I gain something new, the voice tells me its code out
  // loud, once." Until 0.18.0 this only whispered "type /scan", which he
  // never heard, and the rebuild at the next reload moved his Perception
  // command for a potion. Under the tier rule nothing existing can move, so
  // rebuilding here is safe.
  Hooks.on('createItem', async (item) => {
    const resolver = game.folkenQuickMenu.abbreviationResolver;
    if (item.parent?.id !== resolver.currentActorId) return;
    try { await resolver.buildForActor(item.parent); } catch (error) {
      console.warn(`${MODULE_ID} | rebuild after new item failed:`, error);
    }
    const code = resolver.codeForItemId(item.id);
    if (code) {
      ChatMessage.create({
        whisper: [game.user.id],
        content: `<em>${item.name}</em> added: <strong>/${code}</strong>.`,
        speaker: { alias: 'Quick Menu' }
      });
      game.folkenQuickMenu.tts?.speak(`${item.name} is slash ${spellOut(code)}.`);
    } else {
      // A buff, a passive, a gem: nothing to type, so nothing to say aloud.
      ChatMessage.create({
        whisper: [game.user.id],
        content: `<em>${item.name}</em> added. No command: it has nothing to use.`,
        speaker: { alias: 'Quick Menu' }
      });
    }
  });

  // A rename or an identification moves codes. buildForActor speaks every
  // code that moved, so nothing moves silently (8.40, 1.1).
  Hooks.on('updateItem', async (item, changed) => {
    const resolver = game.folkenQuickMenu.abbreviationResolver;
    if (item.parent?.id !== resolver.currentActorId) return;
    if (!itemChangeNeedsRebuild(changed)) return;
    try { await resolver.buildForActor(item.parent); } catch (error) {
      console.warn(`${MODULE_ID} | rebuild after item update failed:`, error);
    }
  });

  Hooks.on('deleteItem', async (item) => {
    const resolver = game.folkenQuickMenu.abbreviationResolver;
    if (item.parent?.id !== resolver.currentActorId) return;
    try { await resolver.buildForActor(item.parent); } catch (_) {}
    ChatMessage.create({
      whisper: [game.user.id],
      content: `<em>${item.name}</em> removed.`,
      speaker: { alias: 'Quick Menu' }
    });
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
  game.settings.register(MODULE_ID, 'menuNumbers', {
    name: 'Speak item numbers in the menu',
    hint: "Say the item's number before its name, as 0.19 did. Off: letters jump straight to items.",
    scope: 'client',
    config: true,
    type: Boolean,
    default: false
  });

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

  // Area spells, scrolls and wands otherwise stop and wait for a template to be
  // placed on the map, which cannot be done by ear (Josh, 2026-10-09).
  game.settings.register(MODULE_ID, 'skipTemplates', {
    name: 'Skip Template Placement',
    hint: 'On (default): area spells, scrolls and wands cast at once without asking you to place a template on the map; the GM places it if it matters. Off: PF1 asks for the template as usual.',
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

  // Which synthesised voice reads the menu.
  //
  // Josh, 2026-10-08: the module was speaking as "Google UK English Female" and
  // he could not make out "Climb" in the Skills list - it came through as "ply".
  // The old rule picked the first English voice with "female" in its name, which
  // is how a remote, lower-quality voice won. Choices are filled in once the
  // browser has loaded its voice list.
  game.settings.register(MODULE_ID, 'ttsVoice', {
    name: 'Menu Voice',
    hint: 'Which voice reads the menu and command results. Automatic prefers a voice installed on your computer, which is usually clearer than an online one. Kept separate from your screen reader voice on purpose, so you can tell them apart.',
    scope: 'client',
    config: true,
    type: String,
    default: '',
    choices: { '': 'Automatic (a local English voice)' }
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
  // Josh, 2026-10-09: Control is also VoiceOver's stop key, so one press
  // silenced both voices. Each player chooses their own.
  game.settings.register(MODULE_ID, 'ttsStopKey', {
    name: 'Stop Speech Key',
    hint: 'Stops the Quick Menu voice. "Control", "Alt" (Option on a Mac), "Shift" or "Meta" mean that key pressed and released on its own; anything else is a key code such as "F8" or "Pause", pressed with no modifiers, and works even while typing. S also stops the voice while it is talking and you are not typing.',
    scope: 'client',
    config: true,
    type: String,
    default: 'Control'
  });

  game.settings.register(MODULE_ID, 'chatFocusKey', {
    name: 'Jump-to-Chat Key',
    hint: 'KeyboardEvent.code that moves focus to the chat prompt (fixes v14 announcing the chat box as "new line"). Default: Backslash. Speech speed and volume keys are configurable above.',
    scope: 'client',
    config: true,
    type: String,
    default: 'Backslash'
  });

  // Spoken detail on the fly. Josh, 2026-10-30; Tobias, 2026-11-01.
  game.settings.register(MODULE_ID, 'detailKey', {
    name: 'Spoken Detail Key',
    hint: 'KeyboardEvent.code that cycles Spoken Detail: auto, short, full. Default: F9.',
    scope: 'client',
    config: true,
    type: String,
    default: 'F9'
  });

  // The open menu's jobs, on Shift plus a letter, because the plain letters
  // are type-ahead (Josh, 2026-10-31). Each is its own setting so nobody is
  // stuck with a key that clashes on their machine.
  const jobs = [
    ['favoriteKey', 'Add to Favorites Key (with Shift)', 'KeyF'],
    ['unfavoriteKey', 'Remove from Favorites Key (with Shift)', 'KeyR'],
    ['prepareKey', 'Prepare Spell Key (with Shift)', 'KeyP'],
    ['unprepareKey', 'Unprepare Spell Key (with Shift)', 'KeyU'],
  ];
  for (const [key, name, def] of jobs) {
    game.settings.register(MODULE_ID, key, {
      name,
      hint: `KeyboardEvent.code, pressed with Shift while the menu is open. Default: ${def}.`,
      scope: 'client',
      config: true,
      type: String,
      default: def
    });
  }
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
