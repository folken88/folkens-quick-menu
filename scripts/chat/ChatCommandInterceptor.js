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

    // Only intercept bare /commands (no spaces except for /fqm subcommands)
    const match = trimmed.match(/^\/([a-zA-Z0-9]+)(?:\s+(.*))?$/);
    if (!match) return true;

    const command = match[1].toLowerCase();
    const args = (match[2] || '').trim();

    // ─── Meta commands ──────────────────────────────────────

    if (command === 'scan') {
      this._handleScan();
      return false;
    }

    if (command === 'fqm') {
      this._handleFqmCommand(args);
      return false;
    }

    // ─── Collision resolution (numeric response) ────────────

    if (this.collisionResolver.hasPending && /^\d+$/.test(command)) {
      this.collisionResolver.handleChoice(parseInt(command, 10));
      return false;
    }

    // ─── Resolve abbreviation ───────────────────────────────

    if (!this.resolver.isBuilt) {
      // Game constants aren't loaded yet — pass through
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

    // Not recognized — pass through to Foundry or other modules
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
    if (!this.resolver.isBuilt) {
      this._whisper('No scan data. Type <strong>/scan</strong> first.');
      return;
    }

    const all = this.resolver.listAll();
    if (all.length === 0) {
      this._whisper('No commands registered.');
      return;
    }

    // Group by action type
    const groups = {};
    for (const entry of all) {
      const group = entry.actionType || 'other';
      if (!groups[group]) groups[group] = [];
      groups[group].push(entry);
    }

    const lines = ['<strong>All registered commands:</strong>'];
    for (const [group, entries] of Object.entries(groups)) {
      lines.push(`<br><strong>${group.toUpperCase()}:</strong>`);
      for (const e of entries) {
        lines.push(`&nbsp; /${e.abbrev} → ${e.label}`);
      }
    }
    this._whisper(lines.join('<br>'));
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
      '<strong>/fqm list</strong> — Show all registered commands',
      '<strong>/fqm rename [old] [new]</strong> — Rename a command abbreviation',
      '<strong>/fqm reset</strong> — Clear all custom aliases',
      '<strong>/fqm help</strong> — Show this help',
      '',
      'Skills, saves, and ability checks work without scanning.',
      'Spells, attacks, items, and feats require <strong>/scan</strong> first.',
    ];
    this._whisper(lines.join('<br>'));
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
