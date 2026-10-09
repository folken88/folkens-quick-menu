/**
 * ChatCommandInterceptor - Hooks into Foundry's chatMessage to intercept
 * /commands and route them through the AbbreviationResolver → ActionExecutor pipeline.
 *
 * Game constants (skills, saves, ability checks, initiative) work immediately.
 * Character-specific items (spells, attacks, gear, feats) require /scan first.
 */

import { debugLog } from '../module.js';
import { CollisionResolver } from './CollisionResolver.js';
import { spellOut } from './AbbreviationGenerator.js';
import { parseYesNo, parseTypedUpcast, parseSlotReportCommand, slotReportLine } from '../spells/Upcast.js';
import { playEarcon } from '../tts/Earcons.js';
import { renderAC, renderCMD, renderActiveBuffs, renderInactiveBuffs } from './StateSpeech.js';

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
    // Foundry v13+ ProseMirror chat input serializes typed input to HTML ("<p>/per</p>").
    // Extract the plain text so slash-command detection sees "/per", not the markup —
    // otherwise the old startsWith('<') guard bailed and every command failed on v14.
    let text = typeof message === 'string' ? message : '';
    try {
      const div = document.createElement('div');
      div.innerHTML = text;
      text = div.textContent ?? text;
    } catch (_) { /* fall back to raw */ }
    const trimmed = text.trim();

    // Check if chat commands are enabled
    try {
      if (!game.settings.get('folken-games-quick-menu', 'enableChatCommands')) return true;
    } catch (e) {
      // Setting not registered yet — allow commands by default
    }

    // An up-cast offer is waiting for a yes or no. Josh types "Y", not "/y", so
    // this has to be checked before the slash-command guard below. Only a clear
    // yes or no is consumed; anything else falls through and is said in chat as
    // normal, because swallowing his actual words would be worse than missing
    // an answer.
    const executor = game.folkenQuickMenu?.actionExecutor;
    if (executor?.hasPendingUpcast) {
      const answer = parseYesNo(trimmed);
      if (answer === true) { executor.confirmUpcast(); return false; }
      if (answer === false) { executor.cancelUpcast({ announce: true }); return false; }
    } else if (executor?.recentlyExpiredUpcast && parseYesNo(trimmed) !== null) {
      // He answered, but too late. Say so rather than post a bare "Y" to the table.
      executor.answerExpiredUpcast();
      return false;
    }

    // Skip anything that isn't a slash command
    if (!trimmed.startsWith('/')) return true;

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

    // ─── State reads (situational awareness) ────────────────

    // Short forms are primary (blind players type little): /st /hp /cond /bf
    if (command === 'st' || command === 'stat' || command === 'status') { this._handleStatus(); return false; }
    if (command === 'hp') { this._handleHp(); return false; }
    if (command === 'ac') { this._handleAc(); return false; }
    if (command === 'cmd') { this._handleCmd(); return false; }
    if (command === 'cond' || command === 'conds' || command === 'conditions') { this._handleConditions(); return false; }
    if (command === 'bf' || command === 'buff' || command === 'buffs') { this._handleBuffs(); return false; }
    if (command === 'bfo') { this._handleInactiveBuffs(); return false; }

    // /sr0 to /sr9: spell slots left at a level (Josh, 2026-10-09).
    const slotLevel = parseSlotReportCommand(command);
    if (slotLevel !== null) { this._handleSlotReport(slotLevel); return false; }

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
        this.resolver.buildForActor(actor).then(() => {
          debugLog('ChatCommandInterceptor: lazy build complete for', actor.name);
        });
        this._whisper('Building command list... type your command again in a moment, or type <strong>/scan</strong>.');
        this._fail('Building commands. Try again in a moment.');
      } else {
        this._whisper('No character assigned or token selected.');
        this._fail('No character assigned.');
      }
      return false; // Swallow the command to prevent Foundry's "invalid command" error
    }

    const result = this.resolver.resolve(command);

    if (result.found) {
      const actor = game.folkenQuickMenu?.menuManager?.getCurrentActor();
      if (!actor) {
        this._whisper('No character assigned or token selected.');
        this._fail('No character assigned.');
        return false;
      }
      this.executor.execute(result.actionItem, actor);
      return false;
    }

    if (result.collision) {
      this.collisionResolver.initiatePrompt(command, result.items);
      return false;
    }

    // /6cl7: a spell's own command with a slot level on the end.
    const typed = parseTypedUpcast(command);
    if (typed) {
      const base = this.resolver.resolve(typed.base);
      if (base.found && base.actionItem?.actionType === 'spell') {
        const actor = game.folkenQuickMenu?.menuManager?.getCurrentActor();
        if (!actor) { this._fail('No character assigned.'); return false; }
        const spell = actor.items.get(base.actionItem.itemId);
        this.executor.castFromSlot(spell, actor, typed.slot);
        return false;
      }
    }

    // Not ours. Until 0.15.0 this passed through in silence, and Foundry's only
    // answer was a red notification he cannot see - a typo like /prc sounded
    // exactly like a roll that had not come back yet.
    if (!this._someoneElseHandles(command)) {
      this._fail(`No command, slash, ${spellOut(command)}.`);
    }
    // Still passed on, so any module that does know the command can run it.
    return true;
  }

  /**
   * Would something else answer this? A macro of that name (Advanced Macros runs
   * /MacroName) or a command another module has registered. Those must not
   * be met with an error sound for a command that is about to work.
   */
  _someoneElseHandles(command) {
    try {
      if (game.macros?.find?.(m => m.name?.toLowerCase() === command)) return true;
    } catch (_) {}
    try {
      const registered = game.chatCommands?.commands;
      if (registered?.has?.(`/${command}`) || registered?.has?.(command)) return true;
    } catch (_) {}
    return false;
  }

  /** The error earcon, then the reason - heard even if speech is busy. */
  _fail(reason) {
    const tts = game.folkenQuickMenu?.tts;
    try { playEarcon('error', { volume: tts?.liveVolume ?? 1 }); } catch (_) {}
    if (reason) tts?.speak(reason, { interrupt: true, urgent: true });
  }

  // ─── /sr0 to /sr9 ───────────────────────────────────────────

  /**
   * Spell slots left at one level. For a spontaneous book that is the slot
   * count; for a prepared one, how many of the spells prepared at that level
   * are still uncast. A character with more than one book hears each, named.
   */
  _handleSlotReport(level) {
    const actor = game.folkenQuickMenu?.menuManager?.getCurrentActor();
    if (!actor) { this._fail('No character assigned.'); return; }

    const books = actor.system?.attributes?.spells?.spellbooks ?? {};
    const inUse = Object.entries(books).filter(([, b]) => b?.inUse);
    if (!inUse.length) { this._fail('No spells.'); return; }

    const lines = inUse.map(([key, book]) => {
      let left = 0, total = 0;
      if (book.spontaneous) {
        const slot = book.spells?.[`spell${level}`] ?? {};
        left = Number(slot.value) || 0;
        total = Number(slot.max) || 0;
      } else {
        for (const spell of actor.items) {
          if (spell.type !== 'spell' || spell.system?.spellbook !== key) continue;
          if ((spell.system?.level ?? -1) !== level) continue;
          left += Number(spell.system?.preparation?.value) || 0;
          total += Number(spell.system?.preparation?.max) || 0;
        }
      }
      const line = slotReportLine({ level, spontaneous: !!book.spontaneous, left, total });
      return inUse.length > 1 ? `${book.label || key}: ${line}` : line;
    });

    const msg = lines.join(' ');
    this._whisper(`<strong>${actor.name}:</strong> ${msg}`);
    game.folkenQuickMenu?.tts?.speak(msg, { interrupt: true });
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

    // TTS spells each command out letter-by-letter so Josh hears exactly what to type
    const ttsItems = entries.map(e => `slash ${spellOut(e.abbrev)} for ${e.label}`).join('. ');
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

    const ttsItems = matches.map(e => `slash ${spellOut(e.abbrev)} for ${e.label}`).join('. ');
    game.folkenQuickMenu?.tts?.speak(`${matches.length} match${matches.length > 1 ? 'es' : ''}. ${ttsItems}.`);
  }

  // ─── State reads: /status /hp /conditions /buffs ───────────
  // These read the current actor's state and speak it. Kept as thin wrappers over
  // CharacterDataExtractor so the menu and (future) voice input can reuse the same reads.

  _stateActor() {
    const actor = game.folkenQuickMenu?.menuManager?.getCurrentActor();
    if (!actor) {
      this._whisper('No character assigned or token selected.');
      game.folkenQuickMenu?.tts?.speak('No character assigned or token selected.');
      return null;
    }
    return actor;
  }

  _handleStatus() {
    const actor = this._stateActor();
    if (!actor) return;
    const cd = game.folkenQuickMenu?.characterData;
    if (!cd?.getStatus) { game.folkenQuickMenu?.tts?.speak('Status not available for this system.'); return; }
    const s = cd.getStatus(actor);

    const parts = [];
    let hpLine = `${s.hp.value} of ${s.hp.max} hit points`;
    if (s.hp.temp) hpLine += `, ${s.hp.temp} temporary`;
    if (s.hp.nonlethal) hpLine += `, ${s.hp.nonlethal} nonlethal`;
    parts.push(hpLine);
    if (s.ac.normal != null) parts.push(`AC ${s.ac.normal}, touch ${s.ac.touch}, flat-footed ${s.ac.flatFooted}`);
    if (s.abilityDamage.length) parts.push('Ability damage: ' + s.abilityDamage.map(a => `${a.name} ${a.damage + a.drain}`).join(', '));
    parts.push(s.conditions.length ? `Conditions: ${s.conditions.join(', ')}` : 'No conditions');
    parts.push(s.buffs.length ? `Buffs: ${s.buffs.join(', ')}` : 'No active buffs');
    const msg = parts.join('. ') + '.';

    this._whisper(`<strong>Status — ${actor.name}</strong><br>${msg}`);
    game.folkenQuickMenu?.tts?.speak(msg);
  }

  _handleHp() {
    const actor = this._stateActor();
    if (!actor) return;
    const cd = game.folkenQuickMenu?.characterData;
    const hp = cd?.getHP ? cd.getHP(actor) : null;
    if (!hp) { game.folkenQuickMenu?.tts?.speak('HP not available.'); return; }
    let msg = `${hp.value} of ${hp.max} hit points`;
    if (hp.temp) msg += `, plus ${hp.temp} temporary`;
    if (hp.nonlethal) msg += `, ${hp.nonlethal} nonlethal`;
    msg += '.';
    this._whisper(`<strong>${actor.name}:</strong> ${msg}`);
    game.folkenQuickMenu?.tts?.speak(msg);
  }

  /**
   * AC, touch, flat-footed. Three numbers, nothing else.
   *
   * 0.8.0 also read CMD, the base 10, every contributing bonus and the roll
   * notes. Josh's verdict on that (2026-10-05): "It's like having a book read to
   * me while I'm trying to follow the table." The breakdown now lives on the
   * agent API, which is where he reconciles his sheet anyway.
   */
  _handleAc() {
    const actor = this._stateActor();
    if (!actor) return;
    const cd = game.folkenQuickMenu?.characterData;
    if (!cd?.getAC) { game.folkenQuickMenu?.tts?.speak('AC not available for this system.'); return; }
    const msg = renderAC(cd.getAC(actor));
    this._whisper(`<strong>${actor.name}:</strong> ${msg}`);
    game.folkenQuickMenu?.tts?.speak(msg);
  }

  /** CMD, on its own, because by ear it is not part of AC. */
  _handleCmd() {
    const actor = this._stateActor();
    if (!actor) return;
    const cd = game.folkenQuickMenu?.characterData;
    if (!cd?.getCMD) { game.folkenQuickMenu?.tts?.speak('CMD not available for this system.'); return; }
    const msg = renderCMD(cd.getCMD(actor));
    this._whisper(`<strong>${actor.name}:</strong> ${msg}`);
    game.folkenQuickMenu?.tts?.speak(msg);
  }

  _handleConditions() {
    const actor = this._stateActor();
    if (!actor) return;
    const cd = game.folkenQuickMenu?.characterData;
    const conds = cd?.getConditions ? cd.getConditions(actor) : [];
    const msg = conds.length ? `Conditions: ${conds.join(', ')}.` : 'No conditions.';
    this._whisper(`<strong>${actor.name}:</strong> ${msg}`);
    game.folkenQuickMenu?.tts?.speak(msg);
  }

  /** What is ON and affecting the character. */
  _handleBuffs() {
    const actor = this._stateActor();
    if (!actor) return;
    const cd = game.folkenQuickMenu?.characterData;
    const msg = renderActiveBuffs(cd?.getBuffs ? cd.getBuffs(actor) : []);
    this._whisper(`<strong>${actor.name}:</strong> ${msg}`);
    game.folkenQuickMenu?.tts?.speak(msg);
  }

  /** What is on the sheet but switched OFF - the list worth handing to someone. */
  _handleInactiveBuffs() {
    const actor = this._stateActor();
    if (!actor) return;
    const cd = game.folkenQuickMenu?.characterData;
    if (!cd?.getInactiveBuffs) { game.folkenQuickMenu?.tts?.speak('Not available for this system.'); return; }
    const msg = renderInactiveBuffs(cd.getInactiveBuffs(actor));
    this._whisper(`<strong>${actor.name}:</strong> ${msg}`);
    game.folkenQuickMenu?.tts?.speak(msg);
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
      maneuver: 'combat',
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
      this._fail('Say slash f q m rename, the old command, then the new one.');
      return;
    }

    const actor = game.folkenQuickMenu?.menuManager?.getCurrentActor();
    if (!actor) {
      this._whisper('No character selected.');
      this._fail('No character assigned.');
      return;
    }

    // Find the action item by the old abbreviation
    const result = this.resolver.resolve(oldAbbrev.toLowerCase());
    if (!result.found) {
      this._whisper(`No command found for <strong>/${oldAbbrev}</strong>.`);
      this._fail(`No command, slash, ${spellOut(oldAbbrev)}.`);
      return;
    }

    try {
      await this.resolver.saveAlias(actor, result.actionItem.id, newAbbrev);
    } catch (error) {
      console.error('Rename failed:', error);
      this._fail('Rename failed.');
      return;
    }
    this._whisper(`Renamed <strong>/${oldAbbrev}</strong> → <strong>/${newAbbrev}</strong> for ${result.actionItem.label}.`);
    game.folkenQuickMenu?.tts?.speak(`Renamed ${oldAbbrev} to ${newAbbrev}.`);
  }

  async _fqmReset() {
    const actor = game.folkenQuickMenu?.menuManager?.getCurrentActor();
    if (!actor) {
      this._whisper('No character selected.');
      this._fail('No character assigned.');
      return;
    }

    try {
      await this.resolver.clearAliases(actor);
    } catch (error) {
      console.error('Alias reset failed:', error);
      this._fail('Reset failed.');
      return;
    }
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
      '<strong>/st /hp /ac /cmd /cond</strong> — Read your status, hit points, AC, CMD, conditions',
      '<strong>/bf</strong> — Buffs that are ON. <strong>/bfo</strong> — Buffs on your sheet that are OFF',
      '<strong>/cmb</strong> — Roll a combat maneuver (trip, grapple, bull rush, disarm …)',
      '<strong>Y</strong> / <strong>N</strong> — Answer an up-cast offer when a spontaneous caster runs out of slots at a level',
      '<strong>/6cl7</strong> — Cast a spell from a higher slot: the spell\'s command, then the slot level',
      '<strong>/sr1</strong> to <strong>/sr9</strong> — Spell slots left at that level',
      '<strong>/fqm rename [old] [new]</strong> — Rename a command abbreviation',
      '<strong>/fqm reset</strong> — Clear all custom aliases',
      '<strong>/fqm help</strong> — Show this help',
      '',
      'Skills, saves, and ability checks work without scanning.',
      'Spells, attacks, items, and feats require <strong>/scan</strong> first.',
    ];
    this._whisper(lines.join('<br>'));
    game.folkenQuickMenu?.tts?.speak('Commands: /scan to scan character. /list to browse by category. /find to search. /st for status, /hp for hit points, /ac for armour class, /cmd for combat maneuver defense, /cmb to roll a maneuver, /cond for conditions, /bf for the buffs that are on, /bfo for the buffs that are off. /sr then a level for spell slots left. /fqm rename to rename a command. /fqm help for help.');
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
