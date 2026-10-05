import { ownedFrom, pickActor, pickPreferringMine, splitOwnership } from "./ActorScope.js";
import { snapshotActor } from "./Snapshot.js";
import { summary, spellsByLevel, consumables, search, money } from "./Report.js";
import { renderCharacter, renderInventory } from "./TextRender.js";

/**
 * The public surface on game.modules.get("folken-games-quick-menu").api
 *
 * Built for a blind player's AI assistant. Every entry point resolves through
 * pickActor(), so nothing outside the caller's own characters is reachable.
 *
 * There is deliberately NO journal access: the client holds GM-only journal
 * text that the interface hides, and surfacing it would spoil the player's own
 * campaign.
 */
export function buildApi(moduleId) {
  const owned = () => ownedFrom(game.actors?.contents ?? []);
  const isGM = () => !!game.user?.isGM;

  /**
   * A GM owns every actor in the world, so the ordinary split would hand back
   * the entire bestiary as "your characters" - 132 of them in Iron Gods. Read
   * aloud that is worse than useless, so a GM gets only their assigned
   * character and must name anyone else explicitly.
   */
  const split = () => {
    const assignedId = game.user?.character?.id ?? null;
    if (isGM()) {
      return { mine: game.user?.character ? [game.user.character] : [], shared: [] };
    }
    return splitOwnership(game.actors?.contents ?? [], game.user?.id, assignedId);
  };

  const snap = who => {
    const assignedId = game.user?.character?.id ?? null;
    if (isGM()) {
      if (!who) {
        if (game.user?.character) return snapshotActor(game.user.character);
        throw new Error('You are logged in as a GM, so every actor in the world is "yours". Name the one you want, for example getCharacter("Olbryn").');
      }
      const wanted = String(who).toLowerCase();
      const hit = game.actors.get(who)
        ?? game.actors.find(a => a.name.toLowerCase() === wanted);
      if (!hit) throw new Error(`No actor named "${who}" in this world.`);
      return snapshotActor(hit);
    }
    const { mine, shared } = split();
    return snapshotActor(pickPreferringMine(mine, shared, assignedId, who));
  };

  return {
    version: game.modules.get(moduleId)?.version ?? "unknown",

    /**
     * Orientation. gmOnline matters: several PF1 automations only run on a GM
     * client and fail silently with nobody connected, which a blind player
     * cannot see happen.
     */
    whoAmI() {
      const { mine, shared } = split();
      const out = {
        user: game.user?.name ?? null,
        character: game.user?.character?.name ?? null,
        myCharacters: mine.map(a => a.name),
        // Owned only because the world left them owned by everybody. Not the
        // player's characters; do not offer them unless asked for by name.
        alsoOwnedByEveryone: shared.map(a => a.name),
        gmOnline: game.users?.activeGM?.name ?? null,
      };
      if (isGM()) {
        out.isGM = true;
        out.note = 'You are a GM. This API serves one character at a time; name the one you want rather than listing the world.';
      }
      return out;
    },

    getCharacter(who) { return summary(snap(who)); },
    getSpells(who) { return spellsByLevel(snap(who)); },
    getConsumables(who) { return consumables(snap(who)); },
    getMoney(who) { return money(snap(who)); },
    getBuffs(who) { return snap(who).buffs; },
    getInventory(who) { return snap(who).items; },

    /** Search this character's own items by name or description text. */
    find(query, who) { return search(snap(who), query); },

    /** Full description text of one item, markup stripped, ready to read aloud. */
    describe(itemName, who) {
      const hit = search(snap(who), itemName)[0];
      if (!hit) throw new Error(`No item matching "${itemName}" on that character.`);
      return { name: hit.name, type: hit.type, text: hit.description || "(no description)" };
    },

    /** Plain text, built to be saved to a file and re-read later. */
    exportCharacter(who) { return renderCharacter(snap(who)); },
    exportInventory(who) { return renderInventory(snap(who)); },
  };
}
