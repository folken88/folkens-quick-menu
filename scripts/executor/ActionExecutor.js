/**
 * ActionExecutor - Shared action execution engine
 * Extracted from QuickMenuManager so both the menu and chat commands
 * can execute the same actions through a single code path.
 */

import { debugLog } from '../module.js';
import { isOwnMessage } from '../chat/RollTotals.js';
import { armAnnouncement } from './Announcer.js';
import { canOfferUpcast, findUpcastLevel, planUpcast, slotsAt,
         upcastPrompt, upcastConfirmation, noSlotsMessage } from '../spells/Upcast.js';

export class ActionExecutor {

  /**
   * Execute an action item against an actor
   * @param {Object} actionItem - The action item with actionType and relevant keys
   * @param {Actor} actor - The Foundry actor to execute against
   */
  async execute(actionItem, actor) {
    debugLog('ActionExecutor: executing', actionItem.actionType, actionItem.label);

    if (!actor) {
      ui.notifications.warn('No character selected or assigned');
      return;
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
    }
  }

  // ─── Helpers ──────────────────────────────────────────────

  _tts() {
    return game.folkenQuickMenu?.tts;
  }

  _isPF2e() {
    return game.folkenQuickMenu?.systemDetector?.isPF2e();
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
    if (!item) return;

    const useOptions = { skipDialog: true };
    if (actionItem.fullAttack) useOptions.fullAttack = true;

    const hookId = this._hookAttackResult();
    try {
      await item.use(useOptions);
    } catch (error) {
      console.error("Attack roll error:", error);
      hookId.off();
    }
  }

  // ─── Spell ────────────────────────────────────────────────

  async executeSpellCast(actionItem, actor) {
    const spell = actor.items.get(actionItem.itemId);
    if (!spell) return;

    if (this._isPF2e()) {
      await this._executePF2eSpellCast(spell, actionItem, actor);
      return;
    }

    const book = spell.spellbook;
    const level = spell.system?.level ?? 0;

    // A spontaneous caster who has run out at this level can borrow a higher
    // slot, if he says so. Ask before spending anything.
    if (book?.spontaneous && level > 0 && slotsAt(book, level) <= 0) {
      if (canOfferUpcast(book, level)) {
        this._offerUpcast(spell, actor, level, findUpcastLevel(book, level));
      } else {
        this._tts()?.speak(noSlotsMessage(level), { interrupt: true });
      }
      return;
    }

    // Prepared casters: nothing prepared means nothing to cast.
    if (!book?.spontaneous) {
      const prepared = spell.system.preparation?.value || 0;
      if (prepared <= 0 && level > 0) {
        this._tts()?.speak('None prepared');
        return;
      }
    }

    const hookId = this._hookRollResult();
    try {
      await spell.use({ skipDialog: true });
      this._tts()?.speak(`${spell.name}, cast`, { interrupt: false, queue: true });
    } catch (error) {
      console.error('Error casting spell:', error);
      this._tts()?.speak('Cast failed');
      hookId.off();
    }
  }

  // ─── Up-casting ──────────────────────────

  /**
   * Ask, and remember what we asked, so a Y or N in chat can answer it.
   *
   * The offer expires. A yes that arrives five minutes later, after he has moved
   * on, must not quietly spend a slot - same reasoning as the announcement hook.
   */
  _offerUpcast(spell, actor, level, upcastLevel) {
    this.cancelUpcast();

    this.pendingUpcast = {
      spellId: spell.id,
      actorId: actor.id,
      level,
      upcastLevel,
      spellName: spell.name,
    };
    this.pendingUpcast.timer = setTimeout(() => this.cancelUpcast(), 30000);

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

  cancelUpcast({ announce = false } = {}) {
    if (!this.pendingUpcast) return;
    if (this.pendingUpcast.timer) clearTimeout(this.pendingUpcast.timer);
    this.pendingUpcast = null;
    if (announce) this._tts()?.speak('Cancelled.', { interrupt: true });
  }

  /**
   * Spend a higher slot and cast.
   *
   * PF1 always charges the slot at the spell's own level and offers no way to
   * point it at a different one, so the slot is lent at that level and taken
   * from the higher one in a single update. PF1 then spends the lent slot as
   * usual. Afterwards the lent level is read back: if PF1 did not deduct it -
   * auto-deduct can be switched off - it is put right here rather than leaving
   * a slot he never earned on a sheet he cannot see.
   */
  async confirmUpcast() {
    const pending = this.pendingUpcast;
    if (!pending) return;
    this.cancelUpcast();

    const actor = game.actors.get(pending.actorId);
    const spell = actor?.items.get(pending.spellId);
    if (!spell) { this._tts()?.speak('That spell is gone.'); return; }

    const bookKey = spell.system?.spellbook || 'primary';
    const book = spell.spellbook;

    // Re-check: slots may have moved since we asked.
    if (slotsAt(book, pending.upcastLevel) <= 0) {
      this._tts()?.speak(noSlotsMessage(pending.level), { interrupt: true });
      return;
    }

    const plan = planUpcast(bookKey, pending.level, pending.upcastLevel, book);
    const hookId = this._hookRollResult();
    try {
      await actor.update(plan.updates);
      await spell.use({ skipDialog: true });

      // Did PF1 take the lent slot back?
      const [path, expected] = Object.entries(plan.expectedAfterCast)[0];
      const actual = foundry.utils.getProperty(actor, path);
      if (typeof actual === 'number' && actual !== expected) {
        await actor.update({ [path]: expected });
      }

      this._tts()?.speak(upcastConfirmation(spell.name, pending.upcastLevel),
        { interrupt: false, queue: true });
    } catch (error) {
      console.error('Up-cast failed:', error);
      hookId.off();
      // Put the slots back exactly as they were.
      try {
        await actor.update({
          [`system.attributes.spells.spellbooks.${bookKey}.spells.spell${pending.level}.value`]: slotsAt(book, pending.level),
          [`system.attributes.spells.spellbooks.${bookKey}.spells.spell${pending.upcastLevel}.value`]: slotsAt(book, pending.upcastLevel),
        });
      } catch (_) { /* nothing more we can do */ }
      this._tts()?.speak('Up-cast failed. Slots unchanged.', { interrupt: true });
    }
  }

  // ─── Item ─────────────────────────────────────────────────

  async executeItemUse(actionItem, actor) {
    const item = actor.items.get(actionItem.itemId);
    if (!item) return;

    if (this._isPF2e()) {
      await this._executePF2eItemUse(item, actionItem, actor);
    } else {
      await item.use({ skipDialog: true });
    }
    // Blind confirmation: using an item posts its card/description to chat silently otherwise.
    this._tts()?.speak(`${item.name} sent to chat`, { interrupt: false, queue: true });
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
      this._tts()?.speak('Combat maneuvers are not available for this character');
      return;
    }

    const hookId = this._hookAttackResult();
    try {
      await actor.rollAttack({ maneuver: true, skipDialog: true });
    } catch (error) {
      console.error('Combat maneuver error:', error);
      this._tts()?.speak('Maneuver failed');
      hookId.off();
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
    if (!item) { this._tts()?.speak('Item not found'); return; }
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
    if (!item) { this._tts()?.speak('Item not found'); return; }
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
    } else {
      const item = actor.items.get(actionItem.itemId);
      if (!item) return;
      try {
        await item.use({ skipDialog: true });
        this._tts()?.speak(`${item.name} activated`, { interrupt: false, queue: true });
      } catch (error) {
        console.error("Item activation error:", error);
        this._tts()?.speak('Activation failed');
      }
    }
  }

  async executeItemConsume(actionItem, actor) {
    if (this._isPF2e()) {
      await this._executePF2eItemUse(null, actionItem, actor);
    } else {
      const item = actor.items.get(actionItem.itemId);
      if (!item) return;
      try {
        await item.use({ skipDialog: true });
        this._tts()?.speak(`${item.name} consumed`, { interrupt: false, queue: true });
      } catch (error) {
        console.error("Item consumption error:", error);
        this._tts()?.speak('Consumption failed');
      }
    }
  }

  // ─── Item Inspect ─────────────────────────────────────────

  async executeItemInspect(actionItem, actor) {
    const item = actor.items.get(actionItem.itemId);
    if (item) {
      item.sheet.render(true);
      this._tts()?.speak(`Inspecting ${item.name}`);
    } else {
      this._tts()?.speak('Item not found');
    }
  }
}
