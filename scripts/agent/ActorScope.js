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
