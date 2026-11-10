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
 * @param {function} [deps.match]   (message) => boolean; a card that is ours
 *                                  but fails this is left for another reader
 * @param {function} deps.handler   (message) => void, called once
 * @param {number}   [deps.timeout] give up after this long
 * @param {number}   [deps.waitMs]  if nothing matched by then, call onWaiting
 * @param {function} [deps.onWaiting] () => void, called at most once
 * @param {function} [deps.onTimeout] () => void, called once if the timeout
 *                                  ends the reader (not on off())
 * @param {string}   [deps.event]
 * @returns {{off: function, isPending: function, done: Promise<object|null>}}
 *          done resolves to the matched message, or null on timeout or off()
 */
export function armAnnouncement({
  hooks,
  // Wrapped, not passed by reference. A bare `setTimeout` called as
  // `timers.set(...)` loses its window receiver and throws "Illegal invocation"
  // in a browser - which node does not reproduce, so the unit tests passed while
  // the real default path was broken. Caught by running it in the live client.
  timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) },
  isOwn = () => true,
  // Several readers can be armed at once (8.46): a spell still rolling its dice
  // and a skill typed meanwhile. Each takes only the card it is waiting for.
  match = () => true,
  handler,
  timeout = 20000,
  waitMs = 0,
  onWaiting = null,
  onTimeout = null,
  event = 'createChatMessage',
} = {}) {
  let finished = false;
  let timer = null;
  let waitTimer = null;
  let hookId = null;
  let resolveDone;
  const done = new Promise((resolve) => { resolveDone = resolve; });

  const finish = (message) => {
    if (finished) return;
    finished = true;
    if (timer !== null) timers.clear(timer);
    if (waitTimer !== null) timers.clear(waitTimer);
    // The actual unregister. Foundry returns a NUMBER from Hooks.on, so this
    // has to be hooks.off(event, id) - never id.off().
    if (hookId !== null) hooks.off(event, hookId);
    resolveDone(message);
  };
  const off = () => finish(null);

  hookId = hooks.on(event, (message) => {
    if (finished) return;
    // Someone else's card, or ours for another reader: stay armed, we are
    // still waiting for our own.
    if (!isOwn(message)) return;
    let matched = false;
    try {
      matched = match(message);
    } catch (error) {
      // A broken predicate must not end the reader or the hook: stay armed.
      console.error('folken-games-quick-menu | announcement match failed:', error);
    }
    if (!matched) return;
    finish(message);
    try {
      handler?.(message);
    } catch (error) {
      console.error('folken-games-quick-menu | announcement failed:', error);
    }
  });

  timer = timers.set(() => {
    if (finished) return;
    finish(null);
    try {
      onTimeout?.();
    } catch (error) {
      console.error('folken-games-quick-menu | timeout line failed:', error);
    }
  }, timeout);
  // A card slower than this (hidden tab, Dice So Nice stalled, 8.44) is still
  // read when it comes; this only says once that we are still waiting.
  if (waitMs > 0 && typeof onWaiting === 'function') {
    waitTimer = timers.set(() => {
      waitTimer = null;
      if (finished) return;
      try {
        onWaiting();
      } catch (error) {
        console.error('folken-games-quick-menu | waiting line failed:', error);
      }
    }, waitMs);
  }

  return { off, isPending: () => !finished, done };
}
