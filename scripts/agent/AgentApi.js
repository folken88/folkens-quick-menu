import { ownedFrom, pickActor } from "./ActorScope.js";
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
  const snap = who => snapshotActor(pickActor(owned(), game.user?.character?.id ?? null, who));

  return {
    version: game.modules.get(moduleId)?.version ?? "unknown",

    /**
     * Orientation. gmOnline matters: several PF1 automations only run on a GM
     * client and fail silently with nobody connected, which a blind player
     * cannot see happen.
     */
    whoAmI() {
      return {
        user: game.user?.name ?? null,
        character: game.user?.character?.name ?? null,
        myCharacters: owned().map(a => a.name),
        gmOnline: game.users?.activeGM?.name ?? null,
      };
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
