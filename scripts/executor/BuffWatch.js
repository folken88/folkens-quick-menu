/**
 * Every buff that switches on during a use is said, whoever switched it.
 *
 * Josh, 8.36 / 4.6: Tobias's Auto Buff module switches a linked buff on when
 * an item or spell is used, and the Quick Menu said nothing about it; our own
 * buff potions were said, Auto Buff's were not. So the Quick Menu watches the
 * actor's buff items for a short window after each use, without depending on
 * Auto Buff: a buff that becomes active is said once, "Haste on.".
 *
 * 10.28: used for someone else ("o"), the buff belongs on the other creature,
 * not on us - so in revert mode a buff switched on here is switched back off,
 * and nothing is said.
 *
 * Hooks and timers are passed in, so the rule can be tested in node.
 */
export class BuffWatch {
  /**
   * @param {object}   deps
   * @param {object}   deps.hooks    Foundry's Hooks (on returns an id; off(event, id))
   * @param {string}   deps.actorId  whose buffs are watched
   * @param {function} deps.speak    (line) => void
   * @param {object}   [deps.timers] { set(fn, ms), clear(id) }
   */
  constructor({ hooks, actorId, speak,
                // Wrapped, not passed by reference: a bare setTimeout called as
                // timers.set(...) throws "Illegal invocation" in a browser.
                timers = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) } } = {}) {
    this.hooks = hooks;
    this.actorId = actorId;
    this.speak = speak;
    this.timers = timers;
    this._current = null;
  }

  /**
   * Watch for `windowMs`. A second open() closes the first window.
   * @returns {{close: function}}
   */
  open({ windowMs = 4000, revert = false } = {}) {
    this._current?.close();
    const seen = new Set();
    let closed = false;
    let timer = null;
    const ids = [];

    const handle = (item) => {
      if (closed || item?.type !== 'buff' || item.parent?.id !== this.actorId) return;
      const key = String(item.name ?? '').toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      if (revert) {
        // Not thrown into Foundry's hook loop: a failed revert is a warning.
        Promise.resolve()
          .then(() => item.update({ 'system.active': false }))
          .catch((error) => console.warn('folken-games-quick-menu | buff revert failed:', error));
        return;
      }
      this.speak?.(`${item.name} on.`);
    };

    const watchWindow = {
      close: () => {
        if (closed) return;
        closed = true;
        if (timer !== null) this.timers.clear(timer);
        for (const [event, id] of ids) this.hooks.off(event, id);
        if (this._current === watchWindow) this._current = null;
      },
    };

    ids.push(['updateItem', this.hooks.on('updateItem', (item, changed) => {
      if (changed?.system?.active === true) handle(item);
    })]);
    ids.push(['createItem', this.hooks.on('createItem', (item) => {
      if (item?.system?.active === true) handle(item);
    })]);
    timer = this.timers.set(() => watchWindow.close(), windowMs);
    this._current = watchWindow;
    return watchWindow;
  }
}
