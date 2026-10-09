/**
 * Arming a one-shot "read me the result of this roll" listener.
 *
 * This lives apart from ActionExecutor, and takes its hook and timer plumbing
 * as arguments, so it can be exercised in node with fakes. It is here because
 * this exact code has now broken twice:
 *
 *  - 0.12.0 and earlier used Hooks.once with no checks, so a roll that produced
 *    no chat card left the listener armed forever, and it would read out the
 *    next card from anybody - including another player's roll.
 *  - 0.13.0 fixed that and introduced a worse one: a blanket find-and-replace
 *    across the executor rewrote the Hooks.off call inside the helper itself
 *    into hookId.off(), where hookId is the number Hooks.on returns. Every roll
 *    then threw before announcing, and nothing was ever unregistered. Counting
 *    the call sites said it was fine; nothing exercised it.
 *
 * So the lifecycle is a unit with tests now, rather than a closure nobody can
 * reach.
 */

/**
 * @param {object}   deps
 * @param {object}   deps.hooks     { on(event, fn) -> id, off(event, id) }
 * @param {object}   deps.timers    { set(fn, ms) -> id, clear(id) }
 * @param {function} deps.isOwn     (message) => boolean
 * @param {function} deps.handler   (message) => void, called once
 * @param {number}   [deps.timeout] give up after this long
 * @param {string}   [deps.event]
 * @returns {{off: function, isPending: function}}
 */
export function armAnnouncement({
  hooks,
  // Wrapped, not passed by reference. A bare `setTimeout` called as
  // `timers.set(...)` loses its window receiver and throws "Illegal invocation"
  // in a browser - which node does not reproduce, so the unit tests passed while
  // the real default path was broken. Caught by running it in the live client.
  timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) },
  isOwn = () => true,
  handler,
  timeout = 20000,
  event = 'createChatMessage',
} = {}) {
  let finished = false;
  let timer = null;
  let hookId = null;

  const off = () => {
    if (finished) return;
    finished = true;
    if (timer !== null) timers.clear(timer);
    // The actual unregister. Foundry returns a NUMBER from Hooks.on, so this
    // has to be hooks.off(event, id) - never id.off().
    if (hookId !== null) hooks.off(event, hookId);
  };

  hookId = hooks.on(event, (message) => {
    if (finished) return;
    // Someone else's card: stay armed, we are still waiting for our own.
    if (!isOwn(message)) return;
    off();
    try {
      handler?.(message);
    } catch (error) {
      console.error('folken-games-quick-menu | announcement failed:', error);
    }
  });

  timer = timers.set(off, timeout);

  return { off, isPending: () => !finished };
}
