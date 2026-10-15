/**
 * Whether an item is worth a chat command. Pure, so it can be tested in node.
 */

/**
 * Does this item actually do something when you trigger it?
 *
 * Tobias, 2026-10-07: "I agree we don't really need triggers for items that
 * don't have triggerable abilities. Waste of time/space/commands."
 *
 * Josh had found the symptom: /c6t and /o6 fired, but all they did was post the
 * Charisma +6 Tattoo's card to chat. The old test was
 * `uses.max > 0 || activation?.type || equipped`, and that trailing `|| equipped`
 * handed a command to every worn passive item on the sheet.
 *
 * PF1's own test is `ItemPF.hasAction`, which is `system.actions?.length > 0`.
 * The charge and activation checks stay as fallbacks so nothing genuinely usable
 * is lost if an item expresses itself differently.
 *
 * Fewer commands is not only tidier: every command removed is one less thing to
 * collide with, and one less entry to sit through when /list reads a category.
 */
export function isTriggerable(item) {
  if (!item) return false;

  // PF1's own definition, preferred.
  if (typeof item.hasAction === 'boolean') {
    if (item.hasAction) return true;
  } else if (Array.isArray(item.system?.actions) && item.system.actions.length > 0) {
    return true;
  }

  // Charges make it usable even without an action - but only REAL charges.
  //
  // 0.12.0 tested uses.max > 0, and Josh found the flaw (2026-10-09): PF1 gives
  // every item uses.max 1 by default, so the Arcane family workbook, Ring of
  // Wizardry, Spell Prism, the Wayfinder and the rest all slipped through and
  // got commands that could only post their own card. PF1's own test is
  // ItemPF.isCharged: single-use, or uses with a real period (per day, per week,
  // charges). A bare max of 1 with no period is just the default.
  if (typeof item.isCharged === 'boolean') {
    if (item.isCharged) return true;
  } else if (item.system?.uses?.per) {
    return true;
  }

  if (item.system?.activation?.type) return true;

  return false;
}

/** PF1 action types that make an attack roll. */
const ATTACK_ACTION_TYPES = new Set(['mwak', 'rwak', 'twak', 'msak', 'rsak', 'mcman', 'rcman']);

/**
 * Does any of the item's actions roll something - an attack, damage, healing or
 * a save? Reads PF1's live action getters when they exist, and the raw action
 * data otherwise, so it can be tested without Foundry.
 */
export function hasRollingAction(item) {
  const live = item?.actions?.contents;
  const list = Array.isArray(live) ? live : (Array.isArray(item?.system?.actions) ? item.system.actions : []);
  for (const action of list) {
    if (!action) continue;
    if (action.hasAttack === true || action.hasDamage === true || action.hasSave === true) return true;
    if (ATTACK_ACTION_TYPES.has(action.actionType)) return true;
    const parts = action.damage?.parts ?? [];
    if (parts.some(p => String(p?.formula ?? (Array.isArray(p) ? p[0] : '') ?? '').trim())) return true;
    if (action.save?.type) return true;
  }
  return false;
}

/**
 * Does a class feature, feat or racial ability earn a command?
 *
 * Josh, 2026-10-15: Ser's Sneak Attack had no command. It is a class feature
 * whose action rolls its damage, (ceil(@class.level / 2))d6, but it has no
 * uses per day - and the old test only let a feature in if it had daily uses
 * or an item-level activation, which PF1 11 no longer has (activation lives on
 * the action now). His correction an hour later set the rule: Light Steps has
 * an action too, but it never rolls anything, so it needs no command.
 *
 * So: a feature gets a command if it has real uses (ki pool, rage, anything
 * drawing on a pool through a charge link) or if its action rolls something.
 */
export function isUsefulFeature(item) {
  if (!item) return false;
  const charged = typeof item.isCharged === 'boolean' ? item.isCharged : !!item.system?.uses?.per;
  if (charged) return true;
  return hasRollingAction(item);
}
