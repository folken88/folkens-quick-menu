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
 * Then he found what kills the voice (2026-10-31 and 2026-11-01, 575 lab
 * cancels and a logged game): speechSynthesis.cancel() landing on a line Chrome
 * has been handed but has not started, or in the same instant it starts, jams
 * the engine - sometimes for eight seconds, sometimes until Chrome is quit. A
 * cancel 1 ms or more after the start event never did, 575 of 575. The 0.17.0
 * queue cancelled at once on every interrupt, so R in Favorites ("removed", then
 * the redraw's name in the same tick) and an arrow landing right on a hand-off
 * both did it. So now:
 *
 *  - a cancel waits until the line has started, plus a margin (20 ms, his
 *    choice: twenty times the measured edge, and only ever paid when a key
 *    lands on a hand-off);
 *  - an idle engine is never cancelled, and neither is speech that is not ours;
 *  - a line that never starts gets one cancel and one more try; if that does
 *    not bring the voice back, the voice is declared down and the engine is
 *    left alone until something starts again.
 *
 * Because onstart and onend are not proof a line was heard - and Chrome drops
 * onend altogether under load and after a cancel - this never waits on them
 * alone. A poll notices a line whose end event never came.
 */

const DEFAULT_TIMERS = { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) };

export class SpeechQueue {
  /**
   * @param {object}   deps
   * @param {object}   deps.engine          window.speechSynthesis, or a fake with speaking/pending/cancel()
   * @param {function} deps.speakNow        (entry, handlers) => void; builds and speaks one utterance
   * @param {object}   [deps.timers]        { set(fn, ms) -> id, clear(id) }
   * @param {function} [deps.now]           () => ms
   * @param {number}   [deps.gapMs]         silence required before the next line (Josh's test used 150)
   * @param {number}   [deps.pollMs]        how often to look for a lost end event
   * @param {number}   [deps.settleMs]      how long after speak() before an idle engine means "ended"
   * @param {number}   [deps.cancelMarginMs] how long after onstart a cancel may land
   * @param {number}   [deps.stuckMs]       how long a handed line may sit unstarted before it counts as stuck
   * @param {number}   [deps.deadRetryMs]   how often to try a line once the voice is declared down
   * @param {function} [deps.onVoiceDown]   called once per dead stretch
   */
  constructor({
    engine,
    speakNow,
    timers = DEFAULT_TIMERS,
    now = () => Date.now(),
    gapMs = 100,
    pollMs = 250,
    settleMs = 500,
    cancelMarginMs = 20,
    stuckMs = 8000,
    deadRetryMs = 3000,
    onVoiceDown = () => {},
  }) {
    this.engine = engine;
    this.speakNow = speakNow;
    this.timers = timers;
    this.now = now;
    this.gapMs = gapMs;
    this.pollMs = pollMs;
    this.settleMs = settleMs;
    this.cancelMarginMs = cancelMarginMs;
    this.stuckMs = stuckMs;
    this.deadRetryMs = deadRetryMs;
    this.onVoiceDown = onVoiceDown;

    /** @type {Array<{text: string, kind: string, options: object, started: boolean, retried: boolean}>} */
    this.items = [];
    this.current = null;
    this.lastEndTs = 0;
    /** Lines in a row that were handed over and never started. */
    this.stuckStreak = 0;
    this.voiceDownAnnounced = false;
    /** The voice is down: hand lines over on a slow clock and never cancel. */
    this.dead = false;
    this._timer = null;
    this._cancelTimer = null;
    /** When we began waiting on a busy engine with nothing of ours in hand. */
    this.waitingSince = null;
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
    const entry = {
      text, kind: kind ?? (interrupt ? 'nav' : 'report'), options,
      started: false, startedAt: 0, retried: false, spokenAt: 0, cancelPending: false,
    };
    if (interrupt) {
      this.items = this.items.filter(e => e.kind !== 'nav');
      this.items.unshift(entry);
      this._requestCancel();
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
    if (this.current) {
      this._requestCancel();
    } else if (this.engine.speaking || this.engine.pending) {
      // Not a line of ours - another module's. The player asked for silence,
      // and nothing of ours is in Chrome's hands to be jammed.
      try { this.engine.cancel(); } catch (_) {}
    }
    this.pump();
    return wasPlaying;
  }

  /** Drop everything, playing and waiting. Not bound to any key by default. */
  clear() {
    this.items = [];
    this._requestCancel();
  }

  /**
   * Hand the next line to the engine, but only once it is silent and has been
   * for gapMs. Called on every change and from the poll.
   */
  pump() {
    if (this.current) { this._schedule(this.pollMs); return; }
    if (!this.items.length) return;
    // A dead engine claims to be speaking forever; waiting on it would mean
    // never finding out when it comes back. The poll treats a wait this long
    // as a stuck line.
    if (!this.dead && (this.engine.speaking || this.engine.pending)) {
      this.waitingSince ??= this.now();
      this._schedule(this.pollMs);
      return;
    }
    this.waitingSince = null;
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
    if (!entry) return;
    entry.started = true;
    entry.startedAt = this.now();
    this.stuckStreak = 0;
    this.voiceDownAnnounced = false;
    this.dead = false;
    // A cancel asked for before the line started waits for this moment.
    if (entry.cancelPending && this.current === entry) this._scheduleCancel(entry);
  }

  /** The engine finished (or was cut off on) this line. */
  noteEnd(entry) {
    if (entry && this.current !== entry) return;
    this._clearCancelTimer();
    this.current = null;
    this.lastEndTs = this.now();
    this._schedule(this.gapMs);
  }

  /**
   * The line in Chrome's hands never started. Kept public so the behaviour can
   * be driven from a test; the poll calls it after stuckMs.
   *
   * One cancel per stuck stretch, and the line gets one more try. If that line
   * does not start either, the cancel did not help and more of them only make
   * it worse (Josh, 2026-10-31: 21 watchdog cancels in a four-minute dead
   * stretch, every one landing on an unstarted line). So the voice is declared
   * down, the alarm sounds, and the engine is not cancelled again. Lines keep
   * going out on a slow clock, because a line that starts is how we learn the
   * voice is back.
   */
  noteReset() {
    const cur = this.current;
    this._clearCancelTimer();
    this.stuckStreak++;
    this.current = null;
    this.lastEndTs = this.now();
    if (this.stuckStreak === 1) {
      // Only an unstarted line of OURS is spared. With nothing of ours in hand
      // the engine is wedged on something foreign: cancel it, as stopCurrent does.
      if (!cur || cur.started) {
        try { this.engine.cancel(); } catch (_) {}
      } else if (typeof this.engine.resume === 'function') {
        // Never cancel a line Chrome has not started: that is what kills the
        // voice. Nudge a paused engine instead and let the retry go out.
        try { this.engine.resume(); } catch (_) {}
      }
      if (cur && !cur.started && !cur.retried) {
        cur.retried = true;
        this.items.unshift(cur);
      }
    } else {
      this.dead = true;
      if (!this.voiceDownAnnounced) {
        this.voiceDownAnnounced = true;
        try { this.onVoiceDown(); } catch (_) { /* the tone is best effort */ }
      }
    }
    this._schedule(this.gapMs);
  }

  /**
   * Cut off the line playing now - but never before Chrome has started it,
   * and never on an idle engine.
   */
  _requestCancel() {
    const cur = this.current;
    if (!cur || cur.cancelPending) return;
    cur.cancelPending = true;
    if (cur.started) this._scheduleCancel(cur);
    // Not started yet: noteStart will come back here. If it never does, the
    // stuck handling takes over; cancelling now is what jams the engine.
  }

  _scheduleCancel(cur) {
    const wait = this.cancelMarginMs - (this.now() - cur.startedAt);
    this._clearCancelTimer();
    if (wait <= 0) { this._cancelNow(cur); return; }
    this._cancelTimer = this.timers.set(() => { this._cancelTimer = null; this._cancelNow(cur); }, wait);
  }

  _cancelNow(cur) {
    if (this.current !== cur) return;
    try { this.engine.cancel(); } catch (_) {}
    this.current = null;
    this.lastEndTs = this.now();
    this._schedule(this.gapMs);
  }

  _clearCancelTimer() {
    if (this._cancelTimer !== null) { this.timers.clear(this._cancelTimer); this._cancelTimer = null; }
  }

  /**
   * The poll. Chrome drops onend under load and after a cancel; when the line
   * we handed it has gone quiet with no end event, it is over. A line that has
   * sat unstarted for stuckMs is stuck.
   */
  _tick() {
    this._timer = null;
    const cur = this.current;
    if (cur) {
      const age = this.now() - cur.spokenAt;
      const idle = !(this.engine.speaking || this.engine.pending);
      if (!cur.started && age >= (this.dead ? this.deadRetryMs : this.stuckMs)) {
        this.noteReset();
      } else if (idle && age >= this.settleMs) {
        this.noteEnd(cur);
      }
    } else if (this.items.length && !this.dead && this.waitingSince !== null
               && this.now() - this.waitingSince >= this.stuckMs) {
      // Nothing of ours in hand, lines waiting, and the engine has claimed to
      // be busy for stuckMs. Josh, 2026-10-29: a dead Chrome reports speaking
      // with nothing coming out. Same remedy: one cancel, then the alarm.
      this.waitingSince = null;
      this.noteReset();
    }
    this.pump();
  }

  _schedule(ms) {
    if (this._timer !== null) this.timers.clear(this._timer);
    this._timer = this.timers.set(() => this._tick(), Math.max(0, ms));
  }
}
