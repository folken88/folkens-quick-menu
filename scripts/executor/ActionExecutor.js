/**
 * ActionExecutor - Shared action execution engine
 * Extracted from QuickMenuManager so both the menu and chat commands
 * can execute the same actions through a single code path.
 */

import { debugLog } from '../module.js';

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

  _hookRollResult() {
    return Hooks.once("createChatMessage", (message) => {
      if (message.rolls?.[0]?.total && this._tts()) {
        this._tts().announceRollResult(message.rolls[0].total);
      }
    });
  }

  _hookAttackResult() {
    return Hooks.once("createChatMessage", (message) => {
      if (message.rolls && this._tts()) {
        this._tts().announceAttackResult(message);
      }
    });
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
      Hooks.off("createChatMessage", hookId);
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
      Hooks.off("createChatMessage", hookId);
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

    // PF1: check preparation
    const preparedCount = spell.system.preparation?.value || 0;
    if (preparedCount <= 0 && spell.system.level > 0) {
      this._tts()?.speak('None prepared');
      return;
    }

    const hookId = this._hookRollResult();
    try {
      await spell.use({ skipDialog: true });
    } catch (error) {
      console.error('Error casting spell:', error);
      this._tts()?.speak('Cast failed');
      Hooks.off("createChatMessage", hookId);
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
      Hooks.off("createChatMessage", hookId);
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
      Hooks.off("createChatMessage", hookId);
    }
  }

  // ─── Initiative ───────────────────────────────────────────

  async executeInitiativeRoll(actionItem, actor) {
    const hookId = this._hookRollResult();
    try {
      await actor.rollInitiative({ skipDialog: true });
    } catch (error) {
      console.error("Initiative roll error:", error);
      Hooks.off("createChatMessage", hookId);
    }
  }

  // ─── Stabilize ────────────────────────────────────────────

  async executeStabilize(actionItem, actor) {
    const hookId = this._hookRollResult();
    try {
      await actor.rollSkill('hea', { skipDialog: true });
    } catch (error) {
      console.error("Stabilize check error:", error);
      Hooks.off("createChatMessage", hookId);
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
      Hooks.off("createChatMessage", hookId);
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
      Hooks.off("createChatMessage", hookId);
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
      Hooks.off("createChatMessage", hookId);
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
      Hooks.off("createChatMessage", hookId);
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
      Hooks.off("createChatMessage", hookId);
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
