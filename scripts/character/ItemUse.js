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

  // Charges or a declared activation make it usable even without an action.
  if ((item.system?.uses?.max ?? 0) > 0) return true;
  if (item.system?.activation?.type) return true;

  return false;
}
