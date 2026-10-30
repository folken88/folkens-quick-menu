/**
 * The queue in front of Chrome's speech engine, replaying what Josh measured by
 * ear on 2026-10-29. Each case is one of his findings.
 * Run: node test/speech-queue.test.mjs
 */
import assert from "node:assert/strict";
import { SpeechQueue } from "../scripts/tts/SpeechQueue.js";

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log("  ok -", name); };

/** A clock and timers we advance by hand. */
function makeClock() {
  let now = 1000;
  const due = [];
  let nextId = 1;
  return {
    now: () => now,
    timers: {
      set(fn, ms) { const id = nextId++; due.push({ id, at: now + ms, fn }); return id; },
      clear(id) { const i = due.findIndex(d => d.id === id); if (i >= 0) due.splice(i, 1); },
    },
    tick(ms) {
      const end = now + ms;
      for (;;) {
        due.sort((a, b) => a.at - b.at);
        const next = due[0];
        if (!next || next.at > end) break;
        due.shift();
        now = next.at;
        next.fn();
      }
      now = end;
    },
  };
}

/** Chrome, as Josh observed it: speaking is a flag; we decide when events fire. */
function makeEngine() {
  return {
    speaking: false, pending: false,
    spoken: [], cancels: 0, current: null,
    cancel() { this.cancels++; this.speaking = false; this.pending = false; const c = this.current; this.current = null; c?.handlers.onerror?.({ error: "interrupted" }); },
    // What our speakNow does: hand the line over and the engine starts talking.
    accept(entry, handlers) { this.spoken.push(entry.text); this.speaking = true; this.current = { entry, handlers }; },
    start() { this.current?.handlers.onstart?.(); },
    finish() { const c = this.current; this.current = null; this.speaking = false; c?.handlers.onend?.(); },
    // Chrome dropped the end event: the engine went quiet and said nothing.
    goQuietSilently() { this.current = null; this.speaking = false; },
  };
}

function setup(opts = {}) {
  const clock = makeClock();
  const engine = makeEngine();
  const alarms = [];
  const q = new SpeechQueue({
    engine, timers: clock.timers, now: clock.now,
    speakNow: (entry, handlers) => engine.accept(entry, handlers),
    onVoiceDown: () => alarms.push(clock.now()),
    ...opts,
  });
  return { clock, engine, q, alarms };
}

// --- finding 1: a line handed over while Chrome talks is never heard ---

t("a line that arrives while the engine is talking waits for silence plus 150 ms", () => {
  const { clock, engine, q } = setup();
  q.enqueue("Punch. 34 to hit, 16 damage.");
  engine.start();
  q.enqueue("23");                       // Perception, 3 seconds later in Josh's test
  assert.deepEqual(engine.spoken, ["Punch. 34 to hit, 16 damage."]);
  clock.tick(3000);
  assert.deepEqual(engine.spoken, ["Punch. 34 to hit, 16 damage."], "still waiting while Punch plays");
  engine.finish();
  clock.tick(100);
  assert.equal(engine.spoken.length, 1, "150 ms of silence first");
  clock.tick(60);
  assert.deepEqual(engine.spoken, ["Punch. 34 to hit, 16 damage.", "23"]);
});

t("a report never cancels the engine", () => {
  const { engine, q } = setup();
  q.enqueue("first");
  q.enqueue("second");
  q.enqueue("third");
  assert.equal(engine.cancels, 0);
});

t("reports play in the order they were asked for", () => {
  const { clock, engine, q } = setup();
  q.enqueue("a"); q.enqueue("b"); q.enqueue("c");
  engine.finish(); clock.tick(200);
  engine.finish(); clock.tick(200);
  engine.finish(); clock.tick(200);
  assert.deepEqual(engine.spoken, ["a", "b", "c"]);
});

// --- finding 2: nothing cuts a result off except navigation and the stop key ---

t("the stop key stops the line playing now; the one waiting still plays", () => {
  // Josh: /balr by mistake, then /per, then Option. Balrog stops, Perception plays.
  const { clock, engine, q } = setup();
  q.enqueue("Balrog. 2 attacks. First, 34 to hit, 16 damage. Second, 29 to hit, 12 damage.");
  engine.start();
  q.enqueue("23");
  assert.equal(q.stopCurrent(), true);
  assert.equal(engine.cancels, 1);
  clock.tick(200);
  assert.deepEqual(engine.spoken.at(-1), "23");
});

t("the stop key with nothing playing reports so", () => {
  const { q } = setup();
  assert.equal(q.stopCurrent(), false);
});

t("navigation cuts the current line off and goes ahead of waiting reports, which are kept", () => {
  const { clock, engine, q } = setup();
  q.enqueue("34 to hit, 16 damage.");
  engine.start();
  q.enqueue("23");                                  // a result waiting
  q.enqueue("3. Perception", { interrupt: true });  // he opened the menu and arrowed
  assert.equal(engine.cancels, 1);
  clock.tick(200);
  assert.equal(engine.spoken.at(-1), "3. Perception");
  engine.finish(); clock.tick(200);
  assert.equal(engine.spoken.at(-1), "23", "the waiting result was not thrown away");
});

t("arrowing quickly replaces the navigation line still waiting, not the reports", () => {
  const { clock, engine, q } = setup();
  q.enqueue("result one");
  engine.start();
  q.enqueue("1. Acrobatics", { interrupt: true });
  q.enqueue("2. Bluff", { interrupt: true });
  q.enqueue("3. Climb", { interrupt: true });
  clock.tick(200);
  assert.deepEqual(engine.spoken.slice(1), ["3. Climb"], "only the item he landed on");
});

// --- Chrome loses end events; the queue must not stall on them ---

t("a lost end event does not stall the queue", () => {
  const { clock, engine, q } = setup();
  q.enqueue("first");
  engine.start();
  engine.goQuietSilently();      // no onend ever comes
  q.enqueue("second");
  clock.tick(300);
  assert.equal(engine.spoken.length, 1, "give the engine a moment to really start");
  clock.tick(500);
  assert.deepEqual(engine.spoken, ["first", "second"]);
});

t("an engine that says it is busy with no line of ours is waited for, not cancelled", () => {
  const { clock, engine, q } = setup();
  engine.speaking = true;        // the screen reader, or another module
  q.enqueue("ours");
  clock.tick(2000);
  assert.deepEqual(engine.spoken, []);
  assert.equal(engine.cancels, 0);
  engine.speaking = false;
  clock.tick(400);
  assert.deepEqual(engine.spoken, ["ours"]);
});

// --- the watchdog: a wedged engine, and a dead one ---

t("a line the engine never started is tried once more after a reset", () => {
  const { clock, engine, q } = setup();
  q.enqueue("23");
  // watchdog: speaking true, no word for 8 s -> cancel, then tell the queue
  engine.speaking = false; engine.current = null;
  q.noteReset();
  clock.tick(200);
  assert.deepEqual(engine.spoken, ["23", "23"]);
  engine.speaking = false; engine.current = null;
  q.noteReset();
  clock.tick(200);
  assert.deepEqual(engine.spoken, ["23", "23"], "one retry, not a loop");
});

t("a line that had started is not repeated after a reset", () => {
  const { clock, engine, q } = setup();
  q.enqueue("long report");
  engine.start();
  engine.speaking = false; engine.current = null;
  q.noteReset();
  clock.tick(200);
  assert.deepEqual(engine.spoken, ["long report"]);
});

t("three resets with nothing starting raise the voice-down alarm once", () => {
  const { clock, engine, q, alarms } = setup();
  for (let i = 0; i < 5; i++) {
    q.enqueue(`line ${i}`);
    engine.speaking = false; engine.current = null;
    q.noteReset();
    clock.tick(200);
  }
  assert.equal(alarms.length, 1);
});

t("a line that starts clears the streak, so the alarm can sound again later", () => {
  const { clock, engine, q, alarms } = setup();
  const reset = () => { engine.speaking = false; engine.current = null; q.noteReset(); clock.tick(200); };
  q.enqueue("a"); reset(); reset(); reset();
  assert.equal(alarms.length, 1);
  q.enqueue("b"); engine.start(); engine.finish(); clock.tick(200);
  q.enqueue("c"); reset(); reset(); reset();
  assert.equal(alarms.length, 2);
});

t("busy reports both the line playing and the lines waiting", () => {
  const { clock, engine, q } = setup();
  assert.equal(q.busy, false);
  q.enqueue("a"); q.enqueue("b");
  assert.equal(q.busy, true);
  assert.equal(q.pending, 1);
  engine.finish(); clock.tick(200); engine.finish(); clock.tick(200);
  assert.equal(q.busy, false);
});

console.log(`${pass} assertions passed.`);
