/**
 * ActionExecutor - Shared action execution engine
 * Extracted from QuickMenuManager so both the menu and chat commands
 * can execute the same actions through a single code path.
 */

import { debugLog } from '../module.js';
import { isOwnMessage } from '../chat/RollTotals.js';
import { armAnnouncement } from './Announcer.js';
import { canOfferUpcast, findUpcastLevel, planUpcast, slotsAt, ordinal,
         upcastPrompt, upcastConfirmation, noSlotsMessage } from '../spells/Upcast.js';
import { playEarcon } from '../tts/Earcons.js';
import { useOutcome, usesLeftLine } from './UseOutcome.js';

/**
 * Actions slow enough that silence between the keypress and the result reads as
 * "nothing happened". Josh, 2026-10-09: Punch takes about 2.5 s, spells 1.2 to
 * 2.1 s; he heard nothing, pressed again, and got two attacks. These get their
 * name spoken the instant they are accepted. Skills, saves and checks answer in
 * a twentieth of a second, so they do not need it.
 */
const ACKNOWLEDGED = new Set(['attack', 'strike', 'maneuver', 'spell', 'item', 'item_activate', 'item_consume']);

export class ActionExecutor {

  /**
   * Execute an action item against an actor
   * @param {Object} actionItem - The action item with actionType and relevant keys
   * @param {Actor} actor - The Foundry actor to execute against
   */
  async execute(actionItem, actor) {
    debugLog('ActionExecutor: executing', actionItem.actionType, actionItem.label);

    // Any new command withdraws a pending up-cast offer. 0.14.0's documentation
    // said this happened and it did not: /6dis, then /per, then Y within 30
    // seconds would still spend a 7th and cast Disintegrate.
    this.cancelUpcast();

    if (!actor) {
      this._fail('No character assigned.');
      return;
    }

    if (ACKNOWLEDGED.has(actionItem.actionType) && actionItem.label) {
      this._tts()?.speak(actionItem.label, { interrupt: true, urgent: true });
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
    if (reason) this._tts()?.speak(reason, { interrupt: true, urgent: true });
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
    let skip = true;
    try { skip = game.settings.get('folken-games-quick-menu', 'skipTemplates') !== false; } catch (_) {}
    return { skipDialog: true, ...(skip ? { measureTemplate: false } : {}), ...extra };
  }

  /**
   * Announce the result of the roll we are about to make, once, and give up if
   * it never arrives.
   *
   * Josh found the bug by reading the code, 2026-10-07: executeInitiativeRoll
   * registered a one-time createChatMessage hook and then called rollInitiative.
   * With no combat running, PF1 makes no message and throws no error - so the
   * hook was never removed. It stayed armed, waiting, and would have read out
   * the total of whatever chat message came next, possibly another player's.
   *
   * Every executor had the same leak; initiative was simply the one that could
   * silently produce no message. Two guards now:
   *
   *  - only our own messages are considered, so an armed hook can never read
   *    out someone else's number even if it is still waiting;
   *  - the hook removes itself after a short wait, so it cannot stay armed.
   *
   * @returns {{off: function}} call off() to cancel early
   */
  /**
   * Arm a one-shot announcement for the roll we are about to make.
   *
   * Only one is ever pending. A previous one is cancelled first, so a roll that
   * produced no card cannot still be waiting when the next command runs and
   * steal its result. That is what makes the long window below safe.
   *
   * The window is 20 seconds because attack cards are slow: Josh measured key to
   * card at 3.4 to 6.2 seconds on Punch, because Dice So Nice animates the dice
   * first and PF1 only creates the card once they finish. The 5 seconds this
   * shipped with in 0.13.0 would have cut off some attack readouts.
   */
  _announceOnce(handler, { timeout = 20000 } = {}) {
    this._pending?.off();
    this._pending = armAnnouncement({
      hooks: Hooks,
      isOwn: (message) => isOwnMessage(message, game.user?.id),
      handler,
      timeout,
    });
    return this._pending;
  }

  _hookRollResult() {
    return this._announceOnce((message) => {
      const total = message.rolls?.[0]?.total;
      if (total !== undefined && total !== null) this._tts()?.announceRollResult(total);
    });
  }

  _hookAttackResult() {
    return this._announceOnce((message) => this._tts()?.announceAttackResult(message));
  }

  /**
   * Spells and items. Their cards carry rolls the same way attacks do, so they
   * use the same reader - the plain one only looks at message.rolls, which is
   * why spell damage was never read out. Quiet when the card has no roll at
   * all: Shield or Mage Armor have nothing to report beyond the name already
   * spoken when the cast was accepted.
   */
  _hookSpellResult() {
    return this._announceOnce((message) =>
      this._tts()?.announceAttackResult(message, { quietIfNone: true }));
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

    if (actionItem.take10) rollOptions.take10 = true;
    else if (actionItem.take20) rollOptions.take20 = true;

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

    const hookId = this._hookAttackResult();
    try {
      const outcome = useOutcome(await item.use(this._useOptions(actionItem.fullAttack ? { fullAttack: true } : {})));
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
    const hookId = this._hookSpellResult();
    try {
      const outcome = useOutcome(await spell.use(this._useOptions()));
      if (!outcome.ok) { hookId.off(); this._fail(outcome.reason); return false; }
      return true;
    } catch (error) {
      console.error('Error casting spell:', error);
      hookId.off();
      this._fail(`${spell.name} failed.`);
      return false;
    }
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

    const message = upcastPrompt(spell.name, level, upcastLevel);
    this._tts()?.speak(message, { interrupt: true, urgent: true });
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
    this._fail('Offer expired.');
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
    if (!(slotLevel > level)) { this._fail(`A ${ordinal(slotLevel)} slot is not higher than ${ordinal(level)}.`); return; }
    if (slotsAt(book, slotLevel) <= 0) { this._fail(`No ${ordinal(slotLevel)} slots left.`); return; }

    if (spell.name) this._tts()?.speak(spell.name, { interrupt: true, urgent: true });
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
    const item = actor.items.get(actionItem.itemId);
    if (!item) { this._missing(); return; }

    if (this._isPF2e()) {
      await this._executePF2eItemUse(item, actionItem, actor);
      return;
    }
    await this._useItem(item, actor);
  }

  /**
   * Use an item through PF1 and report the truth.
   *
   * Josh, 2026-10-09: scrolls with quantity 0 showed "You don't have any more of
   * that item" on screen and said "sent to chat". PF1 returns a refusal code
   * rather than throwing, so it is checked. On success he hears how many uses
   * are left - "2 of 3 left" - instead of "sent to chat".
   */
  async _useItem(item, actor) {
    const hookId = this._hookSpellResult();
    try {
      const outcome = useOutcome(await item.use(this._useOptions()));
      if (!outcome.ok) { hookId.off(); this._fail(outcome.reason); return; }

      const fresh = actor.items.get(item.id);
      if (!fresh) {
        this._tts()?.speak('That was the last one.', { interrupt: false, queue: true });
        return;
      }
      const left = usesLeftLine(fresh);
      if (left) this._tts()?.speak(left, { interrupt: false, queue: true });
    } catch (error) {
      console.error('Item use error:', error);
      hookId.off();
      this._fail(`${item.name} failed.`);
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
      await roll.evaluate({ async: true });
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
      await roll.evaluate({ async: true });
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
    const item = actor.items.get(actionItem.itemId);
    if (!item) { this._missing(); return; }
    await this._useItem(item, actor);
  }

  async executeItemConsume(actionItem, actor) {
    if (this._isPF2e()) {
      await this._executePF2eItemUse(null, actionItem, actor);
      return;
    }
    const item = actor.items.get(actionItem.itemId);
    if (!item) { this._missing(); return; }
    await this._useItem(item, actor);
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
