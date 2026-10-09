/**
 * Short non-speech sounds - earcons - for things that should be heard at once.
 *
 * These are the Poker Dungeon's earcons, copied tone for tone from its blind
 * mode (blindMode.js, earcon()). Josh hears them every session there, so the
 * same sound means the same thing in poker, in the dungeon and in Foundry, and
 * there is nothing new to learn.
 *
 *   error  two low pulses, 220 Hz          - it did not happen
 *   ack    one high blip, 1200 Hz          - registered
 *   close  falling sweep, 900 to 600 Hz    - the menu has closed
 *   open   rising sweep, 600 to 900 Hz     - the menu has opened
 *
 * They are generated with WebAudio rather than played from files, so they are
 * separate from the speech engine: they cannot be dropped by the speech rate
 * limiter, cleared by an interrupting line, or lost when speech itself fails.
 * That is why a failure gets a sound first and words second.
 */

/** Poker's gain for every earcon. */
export const EARCON_GAIN = 0.10;

/** Tone plans: when each tone starts, how long it lasts, and its pitch. */
export const EARCONS = Object.freeze({
  error: [{ at: 0, dur: 0.10, from: 220 }, { at: 0.13, dur: 0.10, from: 220 }],
  ack:   [{ at: 0, dur: 0.08, from: 1200 }],
  close: [{ at: 0, dur: 0.10, from: 900, to: 600 }],
  open:  [{ at: 0, dur: 0.10, from: 600, to: 900 }],
});

/**
 * The tones for an earcon at a given volume. Pure, so the shape of every sound
 * is testable without a browser.
 *
 * Volume scales the gain only. Pitch and rhythm stay exactly as poker has them,
 * so the sound is recognisably the same; the module's own volume keys just make
 * it quieter or louder alongside the voice.
 */
export function earconPlan(kind, volume = 1) {
  const tones = EARCONS[kind];
  if (!tones) return [];
  const v = Number.isFinite(Number(volume)) ? Math.max(0, Math.min(1, Number(volume))) : 1;
  return tones.map(t => ({ ...t, to: t.to ?? null, gain: EARCON_GAIN * v }));
}

let sharedContext = null;

function audioContext() {
  try {
    if (!sharedContext) {
      const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!Ctor) return null;
      sharedContext = new Ctor();
    }
    // Browsers suspend audio until a key or click. Every command here arrives by
    // keypress, so resuming on use is enough.
    if (sharedContext.state === 'suspended') sharedContext.resume().catch(() => {});
    return sharedContext;
  } catch (_) {
    return null;
  }
}

/** Play an earcon. Never throws; a missing sound must not break a command. */
export function playEarcon(kind, { volume = 1 } = {}) {
  const plan = earconPlan(kind, volume);
  if (!plan.length) return false;
  const ctx = audioContext();
  if (!ctx) return false;
  try {
    const now = ctx.currentTime;
    for (const tone of plan) {
      const start = now + tone.at;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.setValueAtTime(tone.from, start);
      if (tone.to !== null) osc.frequency.linearRampToValueAtTime(tone.to, start + tone.dur);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(tone.gain, start + 0.01);
      gain.gain.linearRampToValueAtTime(0, start + tone.dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + tone.dur);
    }
    return true;
  } catch (_) {
    return false;
  }
}
