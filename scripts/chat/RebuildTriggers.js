/**
 * Which item updates change a command's code. A rename moves it (8.40: /ggp
 * to /gree) and so does identification (1.1: the real name replaces the
 * unidentified one). Quantity, uses and active flips never do, so they must
 * not trigger a rebuild. Pure, so it is testable in node.
 */
export function itemChangeNeedsRebuild(changed) {
  if (!changed || typeof changed !== 'object') return false;
  return changed.name !== undefined
    || changed.system?.identified !== undefined
    || changed.system?.unidentified?.name !== undefined;
}
