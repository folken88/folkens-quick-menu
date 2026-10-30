/**
 * Our own queue in front of Chrome's speech engine. Pure: the engine, the
 * clock and the timers are injected, so every Chrome behaviour below can be
 * replayed in node.
 *
 * Josh pinned down two ways a result went missing (2026-10-29), by ear, five
 * rounds each:
 *
 *  1. A line handed to Chrome while it is still speaking makes no sound at
 *     all, though Chrome fires onstart and onend for it as if it had spoken.
 *     /punc then /per three seconds later: 0 of 5 Perception totals heard. The
 *     same with a 12-second gap: 5 of 5. Waiting until speechSynthesis is
 *     silent, pausing 150 ms, then speaking: 5 of 5.
 *  2. A line spoken with interrupt cancels whatever is playing, and the thing
 *     playing was the previous command's result.
 *
 * So nothing is handed to the engine until it has gone quiet, and nothing cuts
 * a line off except menu navigation and the stop key. The stop key stops only
 * the line playing now; everything waiting still plays, in order. His own
 * example: /balr typed by mistake, then /per, then the stop key - Balrog's
 * report stops and Perception's result plays straight after.
 *
 * Because onstart and onend are not proof a line was heard - and Chrome drops
 * onend altogether under load and after a cancel - this never waits on them
 * alone. A poll notices a line whose end event never came, and the engine
 * watchdog in TTSManager reports a wedged engine through noteReset().
 */

const DEFAULT_TIMERS = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) };

export class SpeechQueue {
  /**
   * @param {object}   deps
   * @param {object}   deps.engine        window.speechSynthesis, or a fake with speaking/pending/cancel()
   * @param {function} deps.speakNow      (entry, handlers) => void; builds and speaks one utterance
   * @param {object}   [deps.timers]      { set(fn, ms) -> id, clear(id) }
   * @param {function} [deps.now]         () => ms
   * @param {number}   [deps.gapMs]       silence required before the next line (Josh's test used 150)
   * @param {number}   [deps.pollMs]      how often to look for a lost end event
   * @param {number}   [deps.settleMs]    how long after speak() before an idle engine means "ended"
   * @param {number}   [deps.deadAfterResets] watchdog resets in a row that mean the voice is dead
   * @param {function} [deps.onVoiceDown] called once per dead streak
   */
  constructor({
    engine,
    speakNow,
    timers = DEFAULT_TIMERS,
    now = () => Date.now(),
    gapMs = 150,
    pollMs = 250,
    settleMs = 500,
    deadAfterResets = 3,
    onVoiceDown = () => {},
  }) {
    this.engine = engine;
    this.speakNow = speakNow;
    this.timers = timers;
    this.now = now;
    this.gapMs = gapMs;
    this.pollMs = pollMs;
    this.settleMs = settleMs;
    this.deadAfterResets = deadAfterResets;
    this.onVoiceDown = onVoiceDown;

    /** @type {Array<{text: string, kind: string, options: object, started: boolean, retried: boolean}>} */
    this.items = [];
    this.current = null;
    this.lastEndTs = 0;
    this.resetStreak = 0;
    this.voiceDownAnnounced = false;
    this._timer = null;
  }

  /** Is anything playing or waiting? */
  get busy() {
    return !!(this.current || this.items.length || this.engine.speaking || this.engine.pending);
  }

  /** How many lines are waiting, not counting the one playing. */
  get pending() {
    return this.items.length;
  }

  /**
   * Add a line.
   *
   * interrupt: true is for menu navigation only - the names Josh hears while
   * arrowing. It cuts off whatever is playing, replaces any navigation line
   * still waiting (arrowing quickly should not read every item passed), and
   * goes to the head of the line. Reports already waiting keep their place
   * behind it; none is thrown away.
   */
  enqueue(text, { interrupt = false, kind = null, ...options } = {}) {
    const entry = { text, kind: kind ?? (interrupt ? 'nav' : 'report'), options, started: false, retried: false, spokenAt: 0 };
    if (interrupt) {
      this.items = this.items.filter(e => e.kind !== 'nav');
      this.items.unshift(entry);
      this._cancelCurrent();
    } else {
      this.items.push(entry);
    }
    this.pump();
  }

  /**
   * The stop key: silence the line playing now and nothing else. Whatever is
   * waiting still plays, in order.
   * @returns {boolean} whether anything was actually playing
   */
  stopCurrent() {
    const wasPlaying = !!(this.current || this.engine.speaking || this.engine.pending);
    this._cancelCurrent();
    this.pump();
    return wasPlaying;
  }

  /** Drop everything, playing and waiting. Not bound to any key by default. */
  clear() {
    this.items = [];
    this._cancelCurrent();
  }

  /**
   * Hand the next line to the engine, but only once it is silent and has been
   * for gapMs. Called on every change and from the poll.
   */
  pump() {
    if (this.current) { this._schedule(this.pollMs); return; }
    if (!this.items.length) return;
    if (this.engine.speaking || this.engine.pending) { this._schedule(this.pollMs); return; }
    const wait = this.gapMs - (this.now() - this.lastEndTs);
    if (wait > 0) { this._schedule(wait); return; }

    const entry = this.items.shift();
    this.current = entry;
    entry.spokenAt = this.now();
    try {
      this.speakNow(entry, {
        onstart: () => this.noteStart(entry),
        onend: () => this.noteEnd(entry),
        onerror: () => this.noteEnd(entry),
      });
    } catch (_) {
      this.noteEnd(entry);
      return;
    }
    this._schedule(this.pollMs);
  }

  /** The engine began saying this line. The voice is alive. */
  noteStart(entry) {
    if (entry) entry.started = true;
    this.resetStreak = 0;
    this.voiceDownAnnounced = false;
  }

  /** The engine finished (or was cut off on) this line. */
  noteEnd(entry) {
    if (entry && this.current !== entry) return;
    this.current = null;
    this.lastEndTs = this.now();
    this._schedule(this.gapMs);
  }

  /**
   * The engine watchdog found Chrome claiming to speak with nothing coming out,
   * and cancelled. A line that never started is given one more try, so a
   * single hiccup does not throw a result away. Three resets in a row with
   * nothing starting means the voice is dead - Josh, 2026-10-29: only quitting
   * Chrome brings it back, and he cannot tell a dead voice from a quiet moment.
   */
  noteReset() {
    const entry = this.current;
    this.current = null;
    this.lastEndTs = this.now();
    this.resetStreak++;
    if (entry && !entry.started && !entry.retried) {
      entry.retried = true;
      this.items.unshift(entry);
    }
    if (this.resetStreak >= this.deadAfterResets && !this.voiceDownAnnounced) {
      this.voiceDownAnnounced = true;
      try { this.onVoiceDown(); } catch (_) { /* the tone is best effort */ }
    }
    this._schedule(this.gapMs);
  }

  _cancelCurrent() {
    try { this.engine.cancel(); } catch (_) {}
    this.current = null;
    this.lastEndTs = this.now();
  }

  /**
   * The poll. Chrome drops onend under load and after a cancel; when the line
   * we handed it has gone quiet with no end event, it is over.
   */
  _tick() {
    this._timer = null;
    const cur = this.current;
    if (cur && !(this.engine.speaking || this.engine.pending) && this.now() - cur.spokenAt >= this.settleMs) {
      this.noteEnd(cur);
    }
    this.pump();
  }

  _schedule(ms) {
    if (this._timer !== null) this.timers.clear(this._timer);
    this._timer = this.timers.set(() => this._tick(), Math.max(0, ms));
  }
}
