/**
 * Owned-actor scoping.
 *
 * Foundry ships every actor in the world to every client. A player who could
 * act on 5 actors still had 133 in game.actors, with full stat blocks. Scoping
 * is therefore OUR job, not something the permission layer does for us.
 * Everything the agent API exposes must come through here.
 */

/** Keep only actors this user owns. */
export function ownedFrom(actors) {
  return (actors ?? []).filter(a => a?.isOwner);
}

const OWNER = 3;

/**
 * Split owned actors into the ones that are genuinely this player's and the
 * ones they can only touch because the actor is owned by everybody.
 *
 * Worlds often leave shared props, vehicles and spare NPCs on default OWNER,
 * which makes a player look like they have five characters when they have one.
 * Reading that list aloud is noise, so the API reports them separately.
 */
export function splitOwnership(actors, userId, assignedId) {
  const mine = [], shared = [];
  for (const a of actors ?? []) {
    if (!a?.isOwner) continue;
    const explicit = (a.ownership?.[userId] ?? -1) >= OWNER;
    (explicit || a.id === assignedId ? mine : shared).push(a);
  }
  return { mine, shared };
}

const norm = s => String(s ?? "").trim().toLowerCase();

/**
 * Choose which owned actor a request refers to.
 *
 * @param {Array} owned            result of ownedFrom()
 * @param {string|null} assignedId game.user.character?.id
 * @param {string} [wanted]        a name or id the caller asked for
 */
export function pickActor(owned, assignedId, wanted) {
  if (!owned.length) throw new Error("You do not own any characters in this world.");

  if (wanted !== undefined && wanted !== null && String(wanted).length) {
    const w = norm(wanted);
    const hit = owned.find(a => a.id === wanted) ?? owned.find(a => norm(a.name) === w);
    if (hit) return hit;
    throw new Error(
      `"${wanted}" is not one of your characters. Yours: ${owned.map(a => a.name).join(", ")}`);
  }

  const assigned = owned.find(a => a.id === assignedId);
  if (assigned) return assigned;
  if (owned.length === 1) return owned[0];
  throw new Error(`Which character? ${owned.map(a => a.name).join(", ")}`);
}

/**
 * Same as pickActor, but when no character is named it ignores actors the
 * player only owns because the world left them owned by everybody.
 */
export function pickPreferringMine(mine, shared, assignedId, wanted) {
  if (wanted !== undefined && wanted !== null && String(wanted).length) {
    return pickActor([...mine, ...shared], assignedId, wanted);
  }
  if (mine.length) return pickActor(mine, assignedId);
  return pickActor(shared, assignedId);
}
