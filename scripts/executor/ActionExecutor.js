/**
 * ActionExecutor - Shared action execution engine
 * Extracted from QuickMenuManager so both the menu and chat commands
 * can execute the same actions through a single code path.
 */

import { debugLog } from '../module.js';
import { isOwnMessage } from '../chat/RollTotals.js';
import { cardItemId } from '../chat/CardNotes.js';
import { armAnnouncement } from './Announcer.js';
import { canOfferUpcast, findUpcastLevel, planUpcast, slotsAt, ordinal,
         upcastPrompt, upcastConfirmation, noSlotsMessage } from '../spells/Upcast.js';
import { playEarcon } from '../tts/Earcons.js';
import { useOutcome, usesLeftLine, LAST_ONE } from './UseOutcome.js';
import { healingOf } from './Healing.js';
import { switchBuffOn } from './BuffOn.js';
import { BuffWatch } from './BuffWatch.js';
import { alliesWithin, isGroupBuff, allyReport } from './Allies.js';
import { composeUseLine } from './UseReport.js';
import { spellDetailLine } from '../chat/SpellDetail.js';
import { rolledNotes } from '../chat/CardNotes.js';
import { poolReadLine } from '../chat/StateSpeech.js';
import { firstWithStock, stockLine, ammoReadLine } from '../character/Stock.js';

/**
 * Actions slow enough that silence between the keypress and the result reads as
 * "nothing happened". Josh, 2026-10-09: Punch takes about 2.5 s, spells 1.2 to
 * 2.1 s; he heard nothing, pressed again, and got two attacks. Until 0.17.0
 * these spoke their name the instant they were accepted - and that name, with
 * interrupt on, cut off the previous command's result every time (Josh,
 * 2026-10-29). His rule now: when he uses something he hears the result, not
 * the name. The menu has already said the name while he arrowed to it, and the
 * falling tone says it went; a chat command gets the short "ack" blip instead,
 * which goes through the AudioContext and cancels nothing.
 */
const ACKNOWLEDGED = new Set(['attack', 'strike', 'maneuver', 'spell', 'item', 'item_activate', 'item_consume']);

export class ActionExecutor {

  /**
   * Execute an action item against an actor
   * @param {Object} actionItem - The action item with actionType and relevant keys
   * @param {Actor} actor - The Foundry actor to execute against
   * @param {{source?: 'menu'|'chat'}} [context] where the command came from
   */
  async execute(actionItem, actor, { source = 'menu' } = {}) {
    debugLog('ActionExecutor: executing', actionItem.actionType, actionItem.label);

    // Any new command withdraws a pending up-cast offer. 0.14.0's documentation
    // said this happened and it did not: /6dis, then /per, then Y within 30
    // seconds would still spend a 7th and cast Disintegrate.
    //
    // Josh, 2026-10-09: the withdrawal was silent, and a "y" typed after it
    // went to chat as a public message. Now he hears it, and a Y or N that
    // follows is caught and answered instead of posted.
    const withdrew = this.withdrawUpcast();
    if (withdrew) this._tts()?.speak('Offer withdrawn.', { interrupt: false, queue: true });

    if (!actor) {
      this._fail('No character assigned.');
      return;
    }

    if (source === 'chat' && ACKNOWLEDGED.has(actionItem.actionType)) {
      this._earcon('ack');
    }

    switch (actionItem.actionType) {
      case 'skill':
        await this.executeSkillRoll(actionItem, actor);
        break;
      case 'attack':
      case 'strike':
        await this.executeAttackRoll(actionItem, actor);
        break;
      case 'spell':
        await this.executeSpellCast(actionItem, actor);
        break;
      case 'item':
        await this.executeItemUse(actionItem, actor);
        break;
      case 'save':
        await this.executeSaveRoll(actionItem, actor);
        break;
      case 'ability':
        await this.executeAbilityCheck(actionItem, actor);
        break;
      case 'initiative':
        await this.executeInitiativeRoll(actionItem, actor);
        break;
      case 'stabilize':
        await this.executeStabilize(actionItem, actor);
        break;
      case 'caster_level':
        await this.executeCasterLevelCheck(actionItem, actor);
        break;
      case 'pool_read':
        this.executePoolRead(actionItem, actor);
        break;
      case 'ammo_read':
        this.executeAmmoRead(actionItem, actor);
        break;
      case 'concentration':
        await this.executeConcentrationCheck(actionItem, actor);
        break;
      case 'maneuver':
        await this.executeManeuver(actionItem, actor);
        break;
      case 'pf2e_action':
        await this.executePF2eAction(actionItem, actor);
        break;
      case 'item_equip':
        await this.executeItemEquip(actionItem, actor);
        break;
      case 'item_unequip':
        await this.executeItemUnequip(actionItem, actor);
        break;
      case 'item_activate':
        await this.executeItemActivate(actionItem, actor);
        break;
      case 'item_consume':
        await this.executeItemConsume(actionItem, actor);
        break;
      case 'item_inspect':
        await this.executeItemInspect(actionItem, actor);
        break;
      default:
        console.warn('ActionExecutor: unknown action type:', actionItem.actionType);
        this._earcon('error');
    }
  }

  // ─── Helpers ──────────────────────────────────────────────

  _tts() {
    return game.folkenQuickMenu?.tts;
  }

  _isPF2e() {
    return game.folkenQuickMenu?.systemDetector?.isPF2e();
  }

  _volume() {
    return this._tts()?.liveVolume ?? 1;
  }

  /** The Poker Dungeon's earcon, at the player's own volume. Never throws. */
  _earcon(kind) {
    try { playEarcon(kind, { volume: this._volume() }); } catch (_) { /* never break a command */ }
  }

  /**
   * A failure, heard at once: the error earcon, then the reason if there is one.
   * The sound comes first because it is separate from the speech engine and
   * cannot be dropped, cleared or lost the way a spoken line can.
   */
  _fail(reason) {
    this._earcon('error');
    if (reason) this._tts()?.speak(reason, { interrupt: false, queue: true });
  }

  /**
   * The item a command means. Josh, 2026-10-29: Ser had two Potion of Cure
   * Light Wounds stacks, one at 0 and one at 1, and the command only ever used
   * the first, so /pclw said "None left." with a potion still in the bag. The
   * resolver records the other stacks with the same name as alternates, and
   * the first with anything in it is used.
   */
  _pickItem(actor, actionItem) {
    const ids = [actionItem.itemId, ...(actionItem.alternates ?? [])];
    return firstWithStock(ids.map(id => actor.items.get(id)));
  }

  /** Every stack a command covers, as they are now. */
  _stacks(actor, item, actionItem) {
    const ids = new Set([item.id, ...(actionItem?.alternates ?? [])]);
    if (actionItem?.itemId) ids.add(actionItem.itemId);
    return [...ids].map(id => actor.items.get(id)).filter(Boolean);
  }

  /** A command whose item has gone since the last /scan. */
  _missing() {
    this._fail('Not found. Type slash scan.');
  }

  /**
   * Options for every PF1 use(). Area spells, scrolls and wands otherwise stop
   * and wait for a template to be placed on the map - Josh, 2026-10-09: "/saf
   * and /wcs wait silently for a template to be placed on the map, which I
   * can't do by ear." Skipping placement still resolves the effect.
   */
  _useOptions(extra = {}) {
    return { skipDialog: true, ...(this._skipTemplates() ? { measureTemplate: false } : {}), ...extra };
  }

  _skipTemplates() {
    try { return game.settings.get('folken-games-quick-menu', 'skipTemplates') !== false; } catch (_) { return true; }
  }

  /**
   * Use an item or spell through PF1, with the template really skipped.
   *
   * Josh found it, 2026-10-09: PF1 11.11 ignores the measureTemplate option.
   * It decides for itself, from its own client setting "Place measure template
   * on quick rolls", so /wcs and /saf still sat waiting for a shape to be
   * placed on the map. PF1 does fire pf1CreateActionUse after making that
   * decision and before acting on it, so the Quick Menu turns the template off
   * there - for its own uses only, without touching anyone's settings.
   */
  async _pf1Use(doc, extra = {}) {
    this._installTemplateGuard();
    const skip = this._skipTemplates();
    if (skip) this._suppressTemplates = (this._suppressTemplates || 0) + 1;
    try {
      return await doc.use(this._useOptions(extra));
    } finally {
      if (skip) this._suppressTemplates = Math.max(0, (this._suppressTemplates || 1) - 1);
    }
  }

  _installTemplateGuard() {
    if (this._templateGuard || typeof Hooks === 'undefined') return;
    this._templateGuard = Hooks.on('pf1CreateActionUse', (actionUse) => {
      if (this._suppressTemplates > 0 && actionUse?.shared) actionUse.shared.useMeasureTemplate = false;
      if (this._singleAttacks > 0) this._makeSingleAttack(actionUse);
    });
  }

  /**
   * The Normal entry under Slash rolled a full attack. Josh, 2026-11-01:
   * Normal Punch gave two swings, Normal Pair O Deez all five.
   *
   * Read in PF1 11.11's own pf1.js: process() fires pf1CreateActionUse, then
   * sets shared.fullAttack = true itself, and with skipDialog hands an empty
   * formData to alterRollData, where `fullAttack ??= true` becomes the real
   * decision. So setting shared here is overwritten; the one place that
   * sticks is the formData alterRollData is given.
   */
  _makeSingleAttack(actionUse) {
    const original = actionUse?.alterRollData;
    if (typeof original !== 'function') return;
    actionUse.alterRollData = async function (formData = {}) {
      formData.fullAttack = false;
      return original.call(this, formData);
    };
  }

  /** The charge cost of the item's first action; 0 when it has none. */
  _chargeCost(item) {
    const live = item?.defaultAction ?? item?.actions?.contents?.[0];
    const raw = live?.uses ?? item?.system?.actions?.[0]?.uses;
    const cost = Number(raw?.autoDeductChargesCost);
    return Number.isFinite(cost) ? cost : 0;
  }

  /** Is this item's action healing? PF1 marks it as actionType "heal". */
  _isHealing(item) {
    return healingOf(item);
  }

  /**
   * Arm a reader for the card a command is about to make.
   *
   * Josh found the first leak by reading the code, 2026-10-07: a hook armed for
   * initiative with no combat running was never removed and would have read
   * whatever card came next, possibly another player's. So only our own cards
   * are considered, and every reader gives up after its timeout.
   *
   * Until 0.20.0 only one was ever pending: arming a new one cancelled the
   * last. Josh, 8.46: a skill typed while a many-dice spell was still rolling
   * dropped the spell's reader, and its damage was never read. Now an item
   * reader (spell, item, attack) is never dropped by another command; it ends
   * when its card comes, when it times out, or when its own failure path
   * switches it off. Readers are told apart by what they match.
   *
   * A card goes to one reader only. Foundry hands the same message object to
   * every listener in the order they were armed, so the oldest reader that
   * matches claims it and the rest leave it alone - two Punches in a row get a
   * card each instead of both reading the first.
   *
   * `timers` is a seam for tests; `this._timers` lets a test supply a clock for
   * every reader an executor arms.
   *
   * @returns {{off: function, isPending: function, done: Promise, itemId: ?string}}
   */
  _armReader({ handler, match = () => true, itemId = null, timeout = 600000, waitMs = 0,
               onWaiting = null, onTimeout = null, timers = this._timers } = {}) {
    this._readers ??= new Set();
    this._claimed ??= new WeakSet();
    let reader = null;
    const forget = () => { if (reader) this._readers.delete(reader); };
    const armed = armAnnouncement({
      hooks: Hooks,
      timers,
      isOwn: (message) => isOwnMessage(message, game.user?.id),
      match: (message) => !(message && this._claimed.has(message)) && match(message),
      handler: (message) => {
        if (message && typeof message === 'object') this._claimed.add(message);
        forget();
        handler?.(message);
      },
      timeout,
      waitMs,
      onWaiting,
      onTimeout: () => { forget(); onTimeout?.(); },
    });
    reader = {
      ...armed,
      itemId,
      off: () => { forget(); armed.off(); },
    };
    this._readers.add(reader);
    this._pending = reader;
    return reader;
  }

  /** Is any command still waiting for its card? */
  get hasPendingReader() {
    return (this._readers?.size ?? 0) > 0;
  }

  /** The oldest pending reader waiting for this item's card, or null. */
  _itemReaderFor(itemId) {
    if (itemId === null || itemId === undefined) return null;
    for (const reader of this._readers ?? []) {
      if (reader.itemId === itemId && reader.isPending()) return reader;
    }
    return null;
  }

  /**
   * A reader for a command whose card carries no item to tell it by: skills,
   * saves, plain /r rolls. It takes only cards no item reader is waiting for,
   * so it cannot steal a slow spell's card.
   *
   * Only one generic reader is kept: arming one switches off the previous, so a
   * roll that produced no card cannot still be waiting, oldest in line, and
   * steal the next command's card. It gives up silently after 20 seconds.
   */
  _announceOnce(handler, opts = {}) {
    if (this._generic?.isPending()) this._generic.off();
    this._generic = this._armReader({
      handler,
      match: (message) => !this._itemReaderFor(cardItemId(message)),
      timeout: 20000,
      ...opts,
    });
    return this._generic;
  }

  /**
   * A reader that waits for this item's card and nothing else. Ten minutes,
   * because a card held up by a hidden tab or stalled dice is still worth
   * hearing (8.44). The wait line comes at 8 seconds: Josh measured key to
   * card at 3.4 to 6.2 seconds on Punch with Dice So Nice, so anything shorter
   * would speak it on nearly every attack. If no card ever comes it says so,
   * rather than leaving silence.
   */
  _armItemReader(item, handler) {
    return this._armReader({
      handler,
      match: (message) => cardItemId(message) === item.id,
      itemId: item.id,
      timeout: 600000,
      waitMs: 8000,
      onWaiting: () => this._tts()?.speak(`${item.name}, waiting on the dice.`, { interrupt: false, queue: true }),
      onTimeout: () => this._tts()?.speak(`${item.name}, no result.`, { interrupt: false, queue: true }),
    });
  }

  _hookRollResult() {
    return this._announceOnce((message) => {
      const total = message.rolls?.[0]?.total;
      if (total !== undefined && total !== null) this._tts()?.announceRollResult(total);
    });
  }

  /**
   * Read the next plain roll of ours: /r 1d20, /d, /h. Josh asked in the
   * 0.16.0 round; these go to Foundry or PF1, not through an executor, so the
   * interceptor arms the reader when it sees one go past.
   */
  announceNextRoll() {
    return this._hookRollResult();
  }

  /** Maneuvers and PF2e attacks have no item in hand and use the generic reader. */
  _hookAttackResult(item = null) {
    const handler = (message) => this._tts()?.announceAttackResult(message);
    return item?.id ? this._armItemReader(item, handler) : this._announceOnce(handler);
  }

  /**
   * Spells and items. Their cards carry rolls the same way attacks do, so they
   * use the same reader - the plain one only looks at message.rolls, which is
   * why spell damage was never read out. Quiet when the card has no roll at
   * all: Shield or Mage Armor have nothing to report beyond the name already
   * spoken when the cast was accepted.
   */
  _hookSpellResult(item = null, handler = null) {
    const healing = this._isHealing(item);
    handler ??= (message) =>
      this._tts()?.announceAttackResult(message, { quietIfNone: true, healing, item });
    return item?.id ? this._armItemReader(item, handler) : this._announceOnce(handler);
  }

  /**
   * One BuffWatch per actor (8.36, 4.6). Every use opens its window, so a buff
   * that switches on - by our potion, wand or scroll, or by Auto Buff - is said
   * once, and used for someone else is switched back off (10.28).
   */
  _buffWatch(actor) {
    this._buffWatches ??= new Map();
    const id = actor?.id ?? null;
    let watch = this._buffWatches.get(id);
    if (!watch) {
      watch = new BuffWatch({
        hooks: Hooks,
        actorId: id,
        speak: (line) => this._sayBuff(line),
        ...(this._timers ? { timers: this._timers } : {}),
      });
      this._buffWatches.set(id, watch);
    }
    return watch;
  }

  /**
   * A buff line waits while a use line is still to come, so the name is heard
   * first: "Potion of Shield. 1 left." then "Shield on." Auto Buff switches the
   * buff on well inside the 1.5 s the use line waits for its card.
   */
  _sayBuff(line) {
    if (!line) return;
    if ((this._buffHolds ?? 0) > 0) { (this._heldBuffLines ??= []).push(line); return; }
    this._tts()?.speak(line, { interrupt: false, queue: true });
  }

  _holdBuffLines() {
    this._buffHolds = (this._buffHolds ?? 0) + 1;
  }

  /** Always called once per hold (a finally), so a held line is never lost. */
  _releaseBuffLines() {
    this._buffHolds = Math.max(0, (this._buffHolds ?? 1) - 1);
    if (this._buffHolds > 0) return;
    const held = this._heldBuffLines ?? [];
    this._heldBuffLines = [];
    for (const line of held) this._sayBuff(line);
  }

  /**
   * Haste and its kind reach allies within 15 feet (10.28): each ally the player
   * owns who has a buff of the spell's name has it switched on; the rest are
   * named. Said after the use line. Never throws, and does nothing off the map.
   */
  async _hasteAllies(item, actor) {
    try {
      if (!isGroupBuff(item) || !globalThis.canvas?.ready) return;
      const casterToken = actor?.getActiveTokens?.()?.[0];
      if (!casterToken) return;
      const grid = canvas.grid;
      const measure = (a, b) => grid.measurePath
        ? grid.measurePath([a.center, b.center]).distance
        : grid.measureDistance(a.center, b.center);
      const hits = alliesWithin(canvas.tokens?.placeables ?? [], casterToken, 15, measure);
      const name = String(item.name ?? '').trim().toLowerCase();
      for (const hit of hits) {
        if (!hit.owned) continue;
        const buffs = hit.actor.itemTypes?.buff ?? hit.actor.items?.filter?.((i) => i.type === 'buff') ?? [];
        const buff = buffs.find((b) => String(b.name ?? '').trim().toLowerCase() === name);
        if (!buff) continue;
        await buff.update({ 'system.active': true });
        hit.switched = true;
      }
      this._sayBuff(allyReport(hits, item.name));
    } catch (error) {
      console.warn('folken-games-quick-menu | allies buff failed:', error);
    }
  }

  /** How long the use line waits for the card (10.16); tests replace it. */
  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  _createPF2eFakeEvent() {
    return {
      preventDefault: () => {},
      stopPropagation: () => {},
      type: 'click',
      target: null,
      shiftKey: true,
      ctrlKey: false,
      altKey: false,
      metaKey: false
    };
  }

  // ─── Skill ────────────────────────────────────────────────

  async executeSkillRoll(actionItem, actor) {
    if (this._isPF2e()) {
      this._tts()?.speak('PF2e skill rolls not yet implemented');
      return;
    }

    const skillKey = actionItem.skillKey || actionItem.id;
    const rollOptions = { skipDialog: true };

    // PF1 11.11 reads neither take10 nor take20; its option is staticRoll.
    // Josh, 2026-11-01: Take 10 on Perception gave 21, 22 and 21 - plain d20s.
    if (actionItem.take10) rollOptions.staticRoll = 10;
    else if (actionItem.take20) rollOptions.staticRoll = 20;

    const hookId = this._hookRollResult();
    try {
      await actor.rollSkill(skillKey, rollOptions);
    } catch (error) {
      console.error("Skill check error:", error);
      this._fail(`${actionItem.label || 'Roll'} failed.`);
      hookId.off();
    }
  }

  // ─── Attack ───────────────────────────────────────────────

  async executeAttackRoll(actionItem, actor) {
    if (this._isPF2e()) {
      await this._executePF2eAttack(actionItem, actor);
      return;
    }

    const item = actor.items.get(actionItem.itemId);
    if (!item) { this._missing(); return; }

    const hookId = this._hookAttackResult(item);
    try {
      // PF1 ignores a fullAttack option on use(); the Normal entry is made a
      // single attack through the pf1CreateActionUse hook instead.
      const single = actionItem.fullAttack === false;
      if (single) this._singleAttacks = (this._singleAttacks || 0) + 1;
      let outcome;
      try {
        outcome = useOutcome(await this._pf1Use(item));
      } finally {
        if (single) this._singleAttacks = Math.max(0, (this._singleAttacks || 1) - 1);
      }
      if (!outcome.ok) { hookId.off(); this._fail(outcome.reason); }
    } catch (error) {
      console.error("Attack roll error:", error);
      hookId.off();
      this._fail(`${item.name} failed.`);
    }
  }

  // ─── Spell ────────────────────────────────────────────────

  async executeSpellCast(actionItem, actor) {
    const spell = actor.items.get(actionItem.itemId);
    if (!spell) { this._missing(); return; }

    if (this._isPF2e()) {
      await this._executePF2eSpellCast(spell, actionItem, actor);
      return;
    }

    const book = spell.spellbook;
    const level = spell.system?.level ?? 0;

    // A spontaneous caster out of slots at this level can fill a higher one -
    // the rules as written. Ask before spending anything.
    if (book?.spontaneous && level > 0 && slotsAt(book, level) <= 0) {
      if (canOfferUpcast(book, level)) {
        this._offerUpcast(spell, actor, level, findUpcastLevel(book, level));
      } else {
        this._fail(noSlotsMessage(level));
      }
      return;
    }

    // Prepared books, spell-like books and at-will spells: ask PF1 how many
    // casts remain, rather than second-guessing its preparation data.
    if (!book?.spontaneous && level > 0) {
      const uses = typeof spell.getSpellUses === 'function'
        ? spell.getSpellUses()
        : (spell.system?.preparation?.value || 0);
      if (!(uses > 0)) { this._fail('None left.'); return; }
    }

    await this._cast(spell);
  }

  /**
   * Cast through PF1 and report the truth. Returns whether it went through.
   *
   * There used to be a "Disintegrate, cast" line after this, spoken whatever
   * PF1 actually did - including when it refused. The name is now spoken the
   * moment the command is accepted, and only a failure is spoken after.
   */
  async _cast(spell) {
    const hookId = this._hookSpellResult(spell);
    try {
      const outcome = useOutcome(await this._pf1Use(spell));
      if (!outcome.ok) { hookId.off(); this._fail(outcome.reason); return false; }
      return true;
    } catch (error) {
      console.error('Error casting spell:', error);
      hookId.off();
      this._fail(`${spell.name} failed.`);
      return false;
    }
  }

  /**
   * /ki and friends: read a pool, never spend it. Josh, 2026-10-15: using /kp
   * to find out how much ki was left would spend a point.
   */
  executePoolRead(actionItem, actor) {
    const item = actor.items.get(actionItem.itemId);
    if (!item) { this._missing(); return; }
    const value = item.charges ?? item.system?.uses?.value;
    const max = item.maxCharges ?? item.system?.uses?.max;
    this._tts()?.speak(poolReadLine(actionItem.poolNoun || item.name.toLowerCase(), value, max), { interrupt: false, queue: true });
  }

  /**
   * /arro: read the ammunition, never spend it. Josh, 2026-10-29: the Verdant
   * Fang Bow already takes an arrow off per shot (two /vfb took Ser from 21 to
   * 17), and /arro took one off as well whenever it was typed, so every arrow
   * "spent" that way was counted twice.
   */
  executeAmmoRead(actionItem, actor) {
    const item = actor.items.get(actionItem.itemId);
    if (!item) { this._missing(); return; }
    this._tts()?.speak(ammoReadLine(item.name, item.system?.quantity), { interrupt: false, queue: true });
  }

  // ─── Up-casting ──────────────────────────

  /**
   * Ask, and remember what we asked, so a Y or N in chat can answer it.
   * The offer expires, and any other command withdraws it.
   */
  _offerUpcast(spell, actor, level, upcastLevel) {
    this.cancelUpcast();

    this.pendingUpcast = { spellId: spell.id, actorId: actor.id, level, upcastLevel, spellName: spell.name };
    this.pendingUpcast.timer = setTimeout(() => this._expireUpcast(), 30000);

    // Queued, not interrupting: the spell's name was spoken the moment the
    // command was accepted, and Josh heard "Disintegrate" cut off by the
    // prompt (2026-10-09). The question still comes last.
    const message = upcastPrompt(spell.name, level, upcastLevel);
    this._tts()?.speak(message, { interrupt: false, queue: true, urgent: true });
    try {
      ChatMessage.create({
        whisper: [game.user.id],
        content: `<div class="fqm-chat-msg">${message} <strong>Y</strong> or <strong>N</strong>.</div>`,
        speaker: { alias: 'Quick Menu' },
      });
    } catch (_) { /* the voice is what matters */ }
  }

  get hasPendingUpcast() {
    return !!this.pendingUpcast;
  }

  /**
   * Recently expired? A Y or N that arrives just after the offer lapsed should
   * be told so, not posted to chat as an ordinary message.
   */
  get recentlyExpiredUpcast() {
    return !!this._expiredAt && (Date.now() - this._expiredAt) < 15000;
  }

  _expireUpcast() {
    this.cancelUpcast();
    this._expiredAt = Date.now();
    this._lapseReason = 'Offer expired.';
  }

  /**
   * Withdraw a pending offer because another command came in. Returns whether
   * there was one. A Y or N in the next few seconds is then answered with
   * "Offer withdrawn." instead of being posted to chat.
   */
  withdrawUpcast() {
    if (!this.pendingUpcast) return false;
    this.cancelUpcast();
    this._expiredAt = Date.now();
    this._lapseReason = 'Offer withdrawn.';
    return true;
  }

  cancelUpcast({ announce = false } = {}) {
    if (!this.pendingUpcast) return;
    if (this.pendingUpcast.timer) clearTimeout(this.pendingUpcast.timer);
    this.pendingUpcast = null;
    if (announce) this._tts()?.speak('Cancelled.', { interrupt: true });
  }

  /** A Y or N that arrived after the offer expired. */
  answerExpiredUpcast() {
    this._expiredAt = null;
    this._fail(this._lapseReason || 'Offer expired.');
  }

  async confirmUpcast() {
    const pending = this.pendingUpcast;
    if (!pending) return;
    this.cancelUpcast();
    this._expiredAt = null;

    const actor = game.actors.get(pending.actorId);
    const spell = actor?.items.get(pending.spellId);
    if (!spell) { this._missing(); return; }
    await this._castWithSlot(spell, actor, pending.level, pending.upcastLevel);
  }

  /**
   * The typed up-cast: /6cl7 casts Chain Lightning from a 7th-level slot, with
   * no prompt, whether or not 6th-level slots remain. Josh, 2026-10-09.
   */
  async castFromSlot(spell, actor, slotLevel) {
    this.cancelUpcast();
    if (!spell) { this._missing(); return; }
    const book = spell.spellbook;
    const level = spell.system?.level ?? 0;

    if (!book?.spontaneous) { this._fail('Only spontaneous casters choose a slot.'); return; }
    // Josh, 2026-10-09: /0as1 was allowed, spent a 1st-level slot and set the
    // cantrip count from empty (at will) to 0, which broke every cantrip.
    if (!(level >= 1)) { this._fail('Cantrips do not use slots.'); return; }
    if (!(slotLevel > level)) { this._fail(`A ${ordinal(slotLevel)} slot is not higher than ${ordinal(level)}.`); return; }
    if (slotsAt(book, slotLevel) <= 0) { this._fail(`No ${ordinal(slotLevel)} slots left.`); return; }

    this._earcon('ack');
    await this._castWithSlot(spell, actor, level, slotLevel);
  }

  /**
   * Spend a higher slot and cast.
   *
   * PF1 always charges the slot at the spell's own level and offers no way to
   * redirect it, so one slot is lent at that level and one taken from the
   * higher level in a single update; PF1 then spends the lent slot as usual.
   *
   * The counts are captured BEFORE the update. 0.14.0 read them afterwards from
   * the live spellbook object, which the update had already changed, so its
   * failure path "restored" the changed numbers - a failed up-cast would have
   * left a free slot at the spell's level and one fewer above it.
   */
  async _castWithSlot(spell, actor, level, slotLevel) {
    const bookKey = spell.system?.spellbook || 'primary';
    const book = spell.spellbook;
    if (slotsAt(book, slotLevel) <= 0) { this._fail(noSlotsMessage(level)); return; }

    const base = `system.attributes.spells.spellbooks.${bookKey}.spells`;
    const before = { own: slotsAt(book, level), higher: slotsAt(book, slotLevel) };
    const plan = planUpcast(bookKey, level, slotLevel, book);

    try {
      await actor.update(plan.updates);
    } catch (error) {
      console.error('Up-cast slot update failed:', error);
      this._fail('Up-cast failed. Slots unchanged.');
      return;
    }

    const cast = await this._cast(spell);
    if (!cast) {
      try {
        await actor.update({
          [`${base}.spell${level}.value`]: before.own,
          [`${base}.spell${slotLevel}.value`]: before.higher,
        });
      } catch (_) { /* _cast has already reported the failure */ }
      return;
    }

    // Did PF1 take the lent slot back? Auto-deduct can be switched off.
    const [path, expected] = Object.entries(plan.expectedAfterCast)[0];
    const actual = foundry.utils.getProperty(actor, path);
    if (typeof actual === 'number' && actual !== expected) {
      try { await actor.update({ [path]: expected }); } catch (_) {}
    }

    this._tts()?.speak(upcastConfirmation(spell.name, slotLevel), { interrupt: false, queue: true });
  }

  // ─── Item ─────────────────────────────────────────────────

  async executeItemUse(actionItem, actor) {
    const item = this._pickItem(actor, actionItem);
    if (!item) { this._missing(); return; }

    if (this._isPF2e()) {
      await this._executePF2eItemUse(item, actionItem, actor);
      return;
    }
    await this._useItem(item, actor, actionItem);
  }

  /**
   * Use an item through PF1 and report the truth.
   *
   * Josh, 2026-10-09: scrolls with quantity 0 showed "You don't have any more of
   * that item" on screen and said "sent to chat". PF1 returns a refusal code
   * rather than throwing, so it is checked. On success he hears one use line,
   * name first: "Rod, 7 fire damage. 2 of 3 left." (10.16). A card slower than
   * 1.5 s gets the name and count now and its result when it comes.
   */
  async _useItem(item, actor, actionItem = null, { forOther = false } = {}) {
    // The reader does nothing by itself: the use line below decides who speaks
    // the card, so its result is heard once (10.16).
    let lateCard = null;
    const reader = this._hookSpellResult(item, (message) => lateCard?.(message));
    // Any buff that switches on during this use is said after the use line;
    // for someone else it is switched back off (8.36, 10.28). The window is
    // left to expire on success, so Auto Buff's later updates are still heard.
    const watch = this._buffWatch(actor).open({ revert: forOther });
    this._holdBuffLines();
    try {
      const outcome = useOutcome(await this._pf1Use(item));
      if (!outcome.ok) { reader.off(); watch.close(); this._fail(outcome.reason); return; }

      // A buff potion, wand or scroll switches its buff on - the sheet's, or
      // one imported from the compendium. The watch hears it and says it.
      // Nothing to switch on is not an error. Not waited for: nothing about
      // buffs holds up the use line. Not for someone else: their buff is theirs.
      if (item.type === 'consumable' && !forOther) {
        Promise.resolve().then(() => switchBuffOn(actor, item, {
          packs: typeof game !== 'undefined' ? [...(game.packs ?? [])] : [],
          fromCompendium: (doc) => (typeof game !== 'undefined' && game.items?.fromCompendium)
            ? game.items.fromCompendium(doc, { clearFolder: true }) : doc.toObject(),
        })).catch((error) => console.warn('folken-games-quick-menu | buff switch failed:', error));
      }

      if (item.type === 'spell' && !forOther) await this._hasteAllies(item, actor);

      // Read AFTER the use, and across every stack with this name, so two
      // half-empty potion stacks are counted as one supply.
      const stacks = this._stacks(actor, item, actionItem);
      let count = '';
      if (!stacks.length) count = LAST_ONE;
      else {
        count = (stacks.length > 1 ? stockLine(stacks) : usesLeftLine(stacks[0])) || '';
        // A negative charge cost gives a point back. Josh, 2026-11-01: Regain
        // Grit said "2 of 3 left.", the same words as spending one.
        if (count && this._chargeCost(item) < 0) count = `Regained. ${count.replace(/ left\.$/, '.')}`;
      }

      // Most cards are up within a moment of the use; wait that long so the
      // result rides in the same line as the name and the count.
      const tts = this._tts();
      const healing = this._isHealing(item);
      const terse = tts?.terse ?? true;
      const detail = spellDetailLine(item, { terse });
      const speak = (line) => { if (line) this._tts()?.speak(line, { interrupt: false, queue: true }); };
      // One place builds the line. The first carries detail and count, with
      // or without a card; a late card adds only what it rolled, and nothing
      // when it rolled nothing (the use line already confirmed the use).
      const lineFor = (message, { late = false } = {}) => {
        const result = message ? (this._tts()?.resultLine?.(message, { healing }) ?? '') : '';
        const notes = message ? rolledNotes(message.content ?? '') : [];
        if (late) return (result || notes.length) ? composeUseLine({ name: item.name, result, notes }) : '';
        return composeUseLine({ name: item.name, result, notes, detail, count, forOther });
      };
      let msg = await Promise.race([reader.done, this._sleep(1500)]);
      // A card that landed as the wait ended has already finished the reader.
      if (!msg && !reader.isPending()) msg = await reader.done;
      if (msg) {
        reader.off();
        speak(lineFor(msg));
        return;
      }
      speak(lineFor(null));
      lateCard = (message) => speak(lineFor(message, { late: true }));
    } catch (error) {
      console.error('Item use error:', error);
      reader.off();
      watch.close();
      this._fail(`${item.name} failed.`);
    } finally {
      this._releaseBuffLines();
    }
  }

  // ─── Save ─────────────────────────────────────────────────

  async executeSaveRoll(actionItem, actor) {
    if (this._isPF2e()) {
      this._tts()?.speak('PF2e saves not yet implemented');
      return;
    }

    const saveType = actionItem.saveType || actionItem.id;
    const hookId = this._hookRollResult();
    try {
      await actor.rollSavingThrow(saveType, { skipDialog: true });
    } catch (error) {
      console.error("Saving throw error:", error);
      this._fail(`${actionItem.label || 'Save'} failed.`);
      hookId.off();
    }
  }

  // ─── Ability Check ────────────────────────────────────────

  async executeAbilityCheck(actionItem, actor) {
    if (this._isPF2e()) {
      this._tts()?.speak('PF2e ability checks not yet implemented');
      return;
    }

    const abilityKey = actionItem.abilityKey || actionItem.id;
    const hookId = this._hookRollResult();
    try {
      await actor.rollAbilityTest(abilityKey, { skipDialog: true });
    } catch (error) {
      console.error("Ability check error:", error);
      this._fail(`${actionItem.label || 'Check'} failed.`);
      hookId.off();
    }
  }

  // ─── Initiative ───────────────────────────────────────────

  async executeInitiativeRoll(actionItem, actor) {
    // With no combat running, PF1 rolls nothing and says nothing. Silence is
    // indistinguishable from a broken command when you cannot see the screen.
    if (!game.combat) {
      this._tts()?.speak('No combat running.');
      return;
    }

    const hookId = this._hookRollResult();
    try {
      await actor.rollInitiative({ skipDialog: true });
    } catch (error) {
      console.error("Initiative roll error:", error);
      this._fail(`${'Initiative'} failed.`);
      hookId.off();
    }
  }

  // ─── Stabilize ────────────────────────────────────────────

  async executeStabilize(actionItem, actor) {
    const hookId = this._hookRollResult();
    try {
      await actor.rollSkill('hea', { skipDialog: true });
    } catch (error) {
      console.error("Stabilize check error:", error);
      this._fail(`${'Stabilize'} failed.`);
      hookId.off();
    }
  }

  // ─── Caster Level Check ───────────────────────────────────

  async executeCasterLevelCheck(actionItem, actor) {
    const casterLevel = actionItem.casterLevel || 1;
    const hookId = this._hookRollResult();
    try {
      const roll = new Roll(`1d20 + ${casterLevel}`);
      await roll.evaluate();
      await ChatMessage.create({
        rolls: [roll],
        flavor: `Caster Level Check (${actionItem.spellbook || 'Primary'})`,
        speaker: ChatMessage.getSpeaker({ actor })
      });
    } catch (error) {
      console.error("Caster level check error:", error);
      this._fail(`${'Caster level check'} failed.`);
      hookId.off();
    }
  }

  // ─── Concentration Check ──────────────────────────────────

  async executeConcentrationCheck(actionItem, actor) {
    const concentrationBonus = actionItem.concentrationBonus || 0;
    const hookId = this._hookRollResult();
    try {
      const roll = new Roll(`1d20 + ${concentrationBonus}`);
      await roll.evaluate();
      await ChatMessage.create({
        rolls: [roll],
        flavor: `Concentration Check (${actionItem.spellbook || 'Primary'})`,
        speaker: ChatMessage.getSpeaker({ actor })
      });
    } catch (error) {
      console.error("Concentration check error:", error);
      this._fail(`${'Concentration'} failed.`);
      hookId.off();
    }
  }

  // ─── Combat Maneuver (CMB) ─────────────────────

  /**
   * One command for every maneuver. Josh, 2026-10-05: "Trip, bull rush,
   * grapple, disarm and the rest are all a d20 plus CMB, so one /cmb command
   * would cover every maneuver."
   *
   * PF1 has no rollCMB. rollAttack({ maneuver: true }) IS its combat-maneuver
   * roll - it builds the attack off system.attributes.cmbAbility and runs the
   * real pipeline, so the CMB total and any maneuver roll notes (Improved Trip's
   * +2 and the like) come through on the card without us reassembling them.
   */
  async executeManeuver(actionItem, actor) {
    if (this._isPF2e()) {
      this._tts()?.speak('PF2e maneuvers not yet implemented');
      return;
    }
    if (typeof actor.rollAttack !== 'function') {
      this._fail('No combat maneuvers for this character.');
      return;
    }

    const hookId = this._hookAttackResult();
    try {
      const outcome = useOutcome(await actor.rollAttack({ maneuver: true, ...this._useOptions() }));
      if (!outcome.ok) { hookId.off(); this._fail(outcome.reason); }
    } catch (error) {
      console.error('Combat maneuver error:', error);
      hookId.off();
      this._fail('Maneuver failed.');
    }
  }

  // ─── PF2e Attack ──────────────────────────────────────────

  async _executePF2eAttack(actionItem, actor) {
    const macroPath = actionItem.macroPath || `Actor.${actor.id}.Item.${actionItem.itemId}`;
    if (!macroPath || !actionItem.itemId) {
      this._tts()?.speak('Attack not available');
      return;
    }

    const hookId = this._hookAttackResult();
    try {
      await game.pf2e.rollItemMacro(macroPath, this._createPF2eFakeEvent());
    } catch (error) {
      console.error("PF2e attack error:", error);
      this._tts()?.speak('Attack failed');
      hookId.off();
    }
  }

  // ─── PF2e Spell Cast ─────────────────────────────────────

  async _executePF2eSpellCast(spell, actionItem, actor) {
    const macroPath = actionItem.macroPath || `Actor.${actor.id}.Item.${actionItem.itemId}`;
    if (!macroPath) {
      this._tts()?.speak('Spell not available');
      return;
    }

    const hookId = this._hookRollResult();
    try {
      await game.pf2e.rollItemMacro(macroPath, this._createPF2eFakeEvent());
    } catch (error) {
      console.error("PF2e spell cast error:", error);
      this._tts()?.speak('Spell cast failed');
      hookId.off();
    }
  }

  // ─── PF2e Item Use ────────────────────────────────────────

  async _executePF2eItemUse(item, actionItem, actor) {
    const macroPath = actionItem.macroPath || `Actor.${actor.id}.Item.${actionItem.itemId}`;
    if (!macroPath) {
      this._tts()?.speak('Item not available');
      return;
    }

    try {
      await game.pf2e.rollItemMacro(macroPath, this._createPF2eFakeEvent());
    } catch (error) {
      console.error("PF2e item use error:", error);
      this._tts()?.speak('Item use failed');
    }
  }

  // ─── PF2e Action ──────────────────────────────────────────

  async executePF2eAction(actionItem, actor) {
    const actionKey = actionItem.actionKey || actionItem.id;
    if (!game.pf2e?.actions?.[actionKey]) {
      this._tts()?.speak('Action not available');
      return;
    }

    const hookId = this._hookRollResult();
    try {
      await game.pf2e.actions[actionKey]({ event: this._createPF2eFakeEvent() });
    } catch (error) {
      console.error("PF2e action error:", error);
      this._tts()?.speak('Action failed');
      hookId.off();
    }
  }

  // ─── Item Equip/Unequip ───────────────────────────────────

  async executeItemEquip(actionItem, actor) {
    const item = actor.items.get(actionItem.itemId);
    if (!item) { this._missing(); return; }
    try {
      await item.update({ 'system.equipped.value': true });
      this._tts()?.speak(`${item.name} equipped`);
    } catch (error) {
      console.error("Item equip error:", error);
      this._tts()?.speak('Equip failed');
    }
  }

  async executeItemUnequip(actionItem, actor) {
    const item = actor.items.get(actionItem.itemId);
    if (!item) { this._missing(); return; }
    try {
      await item.update({ 'system.equipped.value': false });
      this._tts()?.speak(`${item.name} unequipped`);
    } catch (error) {
      console.error("Item unequip error:", error);
      this._tts()?.speak('Unequip failed');
    }
  }

  // ─── Item Activate/Consume ────────────────────────────────

  async executeItemActivate(actionItem, actor) {
    if (this._isPF2e()) {
      await this._executePF2eItemUse(null, actionItem, actor);
      return;
    }
    const item = this._pickItem(actor, actionItem);
    if (!item) { this._missing(); return; }
    await this._useItem(item, actor, actionItem);
  }

  async executeItemConsume(actionItem, actor) {
    if (this._isPF2e()) {
      await this._executePF2eItemUse(null, actionItem, actor);
      return;
    }
    const item = this._pickItem(actor, actionItem);
    if (!item) { this._missing(); return; }
    await this._useItem(item, actor, actionItem);
  }

  // ─── Item Inspect ─────────────────────────────────────────

  async executeItemInspect(actionItem, actor) {
    const item = actor.items.get(actionItem.itemId);
    if (item) {
      item.sheet.render(true);
      this._tts()?.speak(`Inspecting ${item.name}`);
    } else {
      this._missing();
    }
  }
}
