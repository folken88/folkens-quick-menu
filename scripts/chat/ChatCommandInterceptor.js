/**
 * ChatCommandInterceptor - Hooks into Foundry's chatMessage to intercept
 * /commands and route them through the AbbreviationResolver → ActionExecutor pipeline.
 *
 * Game constants (skills, saves, ability checks, initiative) work immediately.
 * Character-specific items (spells, attacks, gear, feats) require /scan first.
 */

import { debugLog } from '../module.js';
import { CollisionResolver } from './CollisionResolver.js';

const MODULE_ID = 'folken-games-quick-menu';

export class ChatCommandInterceptor {
  /**
   * @param {import('./AbbreviationResolver.js').AbbreviationResolver} resolver
   * @param {import('../executor/ActionExecutor.js').ActionExecutor} executor
   */
  constructor(resolver, executor) {
    this.resolver = resolver;
    this.executor = executor;
    this.collisionResolver = new CollisionResolver();
  }

  /**
   * Register the chatMessage hook.
   */
  register() {
    Hooks.on('chatMessage', (chatLog, message, chatData) => {
      return this._handleChatMessage(chatLog, message, chatData);
    });
    debugLog('ChatCommandInterceptor: registered chatMessage hook');
  }

  /**
   * Core message handler. Returns false to consume the message, true to pass through.
   */
  _handleChatMessage(chatLog, message, chatData) {
    const trimmed = message.trim();

    // Check if chat commands are enabled
    try {
      if (!game.settings.get('folken-games-quick-menu', 'enableChatCommands')) return true;
    } catch (e) {
      // Setting not registered yet — allow commands by default
    }

    // Skip non-/ messages and HTML pastes
    if (!trimmed.startsWith('/') || trimmed.startsWith('<')) return true;

    // Only intercept commands Foundry doesn't recognize (same pattern as advanced-macros)
    let [parsedCommand] = chatLog.constructor.parse(trimmed);
    if (parsedCommand !== 'invalid') return true;

    // Parse the /command and optional args
    const match = trimmed.match(/^\/([a-zA-Z0-9]+)(?:\s+(.*))?$/);
    if (!match) return true;

    const command = match[1].toLowerCase();
    const args = (match[2] || '').trim();

    debugLog('ChatCommandInterceptor: intercepted', trimmed);

    // ─── Meta commands ──────────────────────────────────────

    if (command === 'scan') {
      this._handleScan();
      return false;
    }

    if (command === 'fqm') {
      this._handleFqmCommand(args);
      return false;
    }

    if (command === 'list') {
      this._handleList(args);
      return false;
    }

    if (command === 'find') {
      this._handleFind(args);
      return false;
    }

    // ─── Collision resolution (numeric response) ────────────

    if (this.collisionResolver.hasPending && /^\d+$/.test(command)) {
      this.collisionResolver.handleChoice(parseInt(command, 10));
      return false;
    }

    // ─── Resolve abbreviation ───────────────────────────────

    // If resolver hasn't been built yet, try to build it now
    if (!this.resolver.isBuilt) {
      const actor = game.folkenQuickMenu?.menuManager?.getCurrentActor();
      if (actor) {
        // Synchronous-safe: buildForActor is async but we can kick it off
        // and for this first command, fall through. It'll work next time.
        this.resolver.buildForActor(actor);
        debugLog('ChatCommandInterceptor: triggered lazy build for', actor.name);
      }
      // Can't resolve yet — pass through
      return true;
    }

    const result = this.resolver.resolve(command);

    if (result.found) {
      const actor = game.folkenQuickMenu?.menuManager?.getCurrentActor();
      if (!actor) {
        this._whisper('No character assigned or token selected.');
        game.folkenQuickMenu?.tts?.speak('No character assigned or token selected.');
        return false;
      }
      this.executor.execute(result.actionItem, actor);
      return false;
    }

    if (result.collision) {
      this.collisionResolver.initiatePrompt(command, result.items);
      return false;
    }

    // Not recognized by us — pass through to Foundry/other modules
    return true;
  }

  // ─── /scan ──────────────────────────────────────────────────

  async _handleScan() {
    const actor = game.folkenQuickMenu?.menuManager?.getCurrentActor();
    if (!actor) {
      this._whisper('No character selected or assigned. Select a token or assign a character first.');
      game.folkenQuickMenu?.tts?.speak('No character found.');
      return;
    }

    game.folkenQuickMenu?.tts?.speak('Scanning your character.');

    await this.resolver.buildForActor(actor);

    const total = this.resolver.count;
    const conflicts = this.resolver.collisionCount;

    // Whisper summary
    const lines = [`<strong>Scan complete for ${actor.name}.</strong>`];
    lines.push(`${total} commands ready.`);
    if (conflicts > 0) {
      lines.push(`<strong>${conflicts} conflict${conflicts > 1 ? 's' : ''}</strong> to resolve.`);
    }
    lines.push(`<br>Type <strong>/fqm list</strong> to see all commands.`);
    this._whisper(lines.join('<br>'));

    // TTS summary
    const tts = game.folkenQuickMenu?.tts;
    if (tts) {
      let msg = `Scan complete. ${total} commands ready.`;
      if (conflicts > 0) {
        msg += ` ${conflicts} conflict${conflicts > 1 ? 's' : ''} to resolve.`;
      }
      tts.speak(msg);
    }

    // Walk through collisions if any
    if (conflicts > 0) {
      this.collisionResolver.walkCollisions(this.resolver.collisions);
    }
  }

  // ─── /fqm subcommands ──────────────────────────────────────

  _handleFqmCommand(args) {
    const parts = args.split(/\s+/);
    const subcommand = (parts[0] || 'help').toLowerCase();

    switch (subcommand) {
      case 'list':
        this._fqmList();
        break;
      case 'rename':
        this._fqmRename(parts[1], parts[2]);
        break;
      case 'reset':
        this._fqmReset();
        break;
      case 'help':
      default:
        this._fqmHelp();
        break;
    }
  }

  _fqmList() {
    // Redirect to the new /list system
    this._handleList('');
  }

  // ─── /list [category] — TTS-friendly categorical browsing ─

  _handleList(args) {
    if (!this.resolver.isBuilt) {
      this._whisper('No scan data. Type <strong>/scan</strong> first.');
      game.folkenQuickMenu?.tts?.speak('No scan data. Type /scan first.');
      return;
    }

    const category = args.toLowerCase().trim();
    const all = this.resolver.listAll();

    // Group by action type
    const groups = {};
    for (const entry of all) {
      const group = this._categoryName(entry.actionType);
      if (!groups[group]) groups[group] = [];
      groups[group].push(entry);
    }

    const validCategories = Object.keys(groups);

    if (!category) {
      // No category specified — give a summary with available categories
      const summary = validCategories.map(g => `${g} (${groups[g].length})`).join(', ');
      const ttsMsg = `${all.length} commands. Say /list then a category: ${validCategories.join(', ')}. Or /find to search.`;
      this._whisper(`<strong>${all.length} commands registered.</strong><br>Categories: ${summary}<br><br>Type <strong>/list skills</strong>, <strong>/list spells</strong>, etc. Or <strong>/find fireball</strong> to search.`);
      game.folkenQuickMenu?.tts?.speak(ttsMsg);
      return;
    }

    // Find matching category (fuzzy: "skill" matches "skills", "atk" matches "attacks")
    const match = validCategories.find(g =>
      g.startsWith(category) || g === category || g.includes(category)
    );

    if (!match) {
      this._whisper(`Unknown category "<strong>${category}</strong>". Available: ${validCategories.join(', ')}`);
      game.folkenQuickMenu?.tts?.speak(`Unknown category. Available: ${validCategories.join(', ')}.`);
      return;
    }

    const entries = groups[match];
    // Whisper the list (for sighted GMs who might look)
    const lines = [`<strong>${match} (${entries.length}):</strong>`];
    for (const e of entries) {
      lines.push(`&nbsp; /${e.abbrev} → ${e.label}`);
    }
    this._whisper(lines.join('<br>'));

    // TTS reads them in a compact format
    const ttsItems = entries.map(e => `/${e.abbrev}, ${e.label}`).join('. ');
    game.folkenQuickMenu?.tts?.speak(`${match}. ${entries.length} commands. ${ttsItems}.`);
  }

  // ─── /find <search> — search all commands by name ──────────

  _handleFind(args) {
    if (!this.resolver.isBuilt) {
      this._whisper('No scan data. Type <strong>/scan</strong> first.');
      game.folkenQuickMenu?.tts?.speak('No scan data. Type /scan first.');
      return;
    }

    const query = args.toLowerCase().trim();
    if (!query) {
      this._whisper('Usage: <strong>/find fireball</strong>');
      game.folkenQuickMenu?.tts?.speak('Say /find then what you are looking for.');
      return;
    }

    const all = this.resolver.listAll();
    const matches = all.filter(e =>
      e.label.toLowerCase().includes(query) || e.abbrev.includes(query)
    );

    if (matches.length === 0) {
      this._whisper(`No commands matching "<strong>${query}</strong>".`);
      game.folkenQuickMenu?.tts?.speak(`No matches for ${query}.`);
      return;
    }

    const lines = [`<strong>${matches.length} match${matches.length > 1 ? 'es' : ''} for "${query}":</strong>`];
    for (const e of matches) {
      lines.push(`&nbsp; /${e.abbrev} → ${e.label}`);
    }
    this._whisper(lines.join('<br>'));

    const ttsItems = matches.map(e => `/${e.abbrev}, ${e.label}`).join('. ');
    game.folkenQuickMenu?.tts?.speak(`${matches.length} match${matches.length > 1 ? 'es' : ''}. ${ttsItems}.`);
  }

  /**
   * Map action type codes to friendly category names.
   */
  _categoryName(actionType) {
    const names = {
      skill: 'skills',
      attack: 'attacks',
      strike: 'attacks',
      spell: 'spells',
      item: 'items',
      save: 'saves',
      ability: 'abilities',
      initiative: 'combat',
      stabilize: 'combat',
      caster_level: 'combat',
      concentration: 'combat',
      pf2e_action: 'actions',
      item_equip: 'items',
      item_unequip: 'items',
      item_activate: 'items',
      item_consume: 'items',
      item_inspect: 'items'
    };
    return names[actionType] || 'other';
  }

  async _fqmRename(oldAbbrev, newAbbrev) {
    if (!oldAbbrev || !newAbbrev) {
      this._whisper('Usage: <strong>/fqm rename [old] [new]</strong>');
      return;
    }

    const actor = game.folkenQuickMenu?.menuManager?.getCurrentActor();
    if (!actor) {
      this._whisper('No character selected.');
      return;
    }

    // Find the action item by the old abbreviation
    const result = this.resolver.resolve(oldAbbrev.toLowerCase());
    if (!result.found) {
      this._whisper(`No command found for <strong>/${oldAbbrev}</strong>.`);
      return;
    }

    await this.resolver.saveAlias(actor, result.actionItem.id, newAbbrev);
    this._whisper(`Renamed <strong>/${oldAbbrev}</strong> → <strong>/${newAbbrev}</strong> for ${result.actionItem.label}.`);
    game.folkenQuickMenu?.tts?.speak(`Renamed ${oldAbbrev} to ${newAbbrev}.`);
  }

  async _fqmReset() {
    const actor = game.folkenQuickMenu?.menuManager?.getCurrentActor();
    if (!actor) {
      this._whisper('No character selected.');
      return;
    }

    await this.resolver.clearAliases(actor);
    this._whisper(`All custom aliases cleared for <strong>${actor.name}</strong>. Type <strong>/scan</strong> to rebuild.`);
    game.folkenQuickMenu?.tts?.speak('All aliases cleared.');
  }

  _fqmHelp() {
    const lines = [
      '<strong>FolkenGames Quick Menu - Chat Commands</strong>',
      '',
      '<strong>/scan</strong> — Scan your character and build command list',
      '<strong>/list</strong> — Browse commands by category (e.g. /list skills, /list spells)',
      '<strong>/find [text]</strong> — Search commands (e.g. /find fire)',
      '<strong>/fqm rename [old] [new]</strong> — Rename a command abbreviation',
      '<strong>/fqm reset</strong> — Clear all custom aliases',
      '<strong>/fqm help</strong> — Show this help',
      '',
      'Skills, saves, and ability checks work without scanning.',
      'Spells, attacks, items, and feats require <strong>/scan</strong> first.',
    ];
    this._whisper(lines.join('<br>'));
    game.folkenQuickMenu?.tts?.speak('Commands: /scan to scan character. /list to browse by category. /find to search. /fqm rename to rename a command. /fqm help for help.');
  }

  // ─── Utility ───────────────────────────────────────────────

  _whisper(content) {
    ChatMessage.create({
      whisper: [game.user.id],
      content: `<div class="fqm-chat-msg">${content}</div>`,
      speaker: { alias: 'Quick Menu' }
    });
  }
}
