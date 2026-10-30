/**
 * TTSManager - Text-to-Speech functionality
 * Handles speech synthesis for menu navigation
 */

import { debugLog, getSetting } from '../module.js';
import { stripMarkup, expandForSpeech } from '../chat/StateSpeech.js';
import { pickVoice, voiceChoices } from './VoiceChoice.js';
import { extractRollTotals, renderAttackTotals, describeShape, shouldBeTerse } from '../chat/RollTotals.js';
import { SpeechQueue } from './SpeechQueue.js';
import { playEarcon } from './Earcons.js';

export class TTSManager {
  constructor() {
    this.speechSynthesis = window.speechSynthesis;
    this.defaultVoice = null;
    this.lastAliveTs = Date.now();

    // Live, persisted reading rate & voice volume for the browser voice — parity with the
    // poker/dungeon blind mode: [ / ] adjust speed, - / = adjust volume, announced and
    // remembered across reloads (localStorage). Seeded once from the ttsSpeed setting.
    this.RATE_MIN = 0.8; this.RATE_MAX = 2.5;
    this.VOL_MIN = 0.1;  this.VOL_MAX = 1.0;
    this.liveRate = this._loadNum('folken-qm-tts-rate', ((getSetting('ttsSpeed') || 120) / 100), this.RATE_MIN, this.RATE_MAX);
    this.liveVolume = this._loadNum('folken-qm-tts-volume', 1.0, this.VOL_MIN, this.VOL_MAX);

    // Our own queue in front of Chrome's. Nothing is handed to the engine
    // while it is still talking, because Chrome silently drops such a line
    // while firing its events as if it had spoken (Josh, 2026-10-29).
    if (this.speechSynthesis) {
      this.queue = new SpeechQueue({
        engine: this.speechSynthesis,
        speakNow: (entry, handlers) => this._speakNow(entry, handlers),
        onVoiceDown: () => this._voiceDown(),
      });
    }

    // Initialize when voices are loaded
    this.initializeVoices();
    if (this.speechSynthesis) this._startEngineWatch();
  }

  /* ---------- Live rate / volume (persisted, poker-parity) ---------- */

  _loadNum(key, fallback, min, max) {
    try {
      const v = Number(localStorage.getItem(key));
      if (Number.isFinite(v) && v > 0) return Math.max(min, Math.min(max, v));
    } catch (_) {}
    return Math.max(min, Math.min(max, fallback));
  }

  _saveNum(key, val) { try { localStorage.setItem(key, String(val)); } catch (_) {} }

  /** Set reading speed (0.8–2.5) for the browser voice, persist, and read it back aloud. */
  setRate(newRate, announce = true) {
    const r = Math.max(this.RATE_MIN, Math.min(this.RATE_MAX, Number(newRate) || this.liveRate));
    this.liveRate = Math.round(r * 100) / 100;
    this._saveNum('folken-qm-tts-rate', this.liveRate);
    if (announce) this.speak(`Reading speed ${this.liveRate.toFixed(2)}.`, { interrupt: true, urgent: true });
  }
  nudgeRate(delta) { this.setRate(this.liveRate + delta); }

  /** Set browser-voice volume (0.1–1.0), persist, and confirm aloud (at the new volume). */
  setVolume(newVolume, announce = true) {
    const v = Math.max(this.VOL_MIN, Math.min(this.VOL_MAX, Number(newVolume) || this.liveVolume));
    this.liveVolume = Math.round(v * 100) / 100;
    this._saveNum('folken-qm-tts-volume', this.liveVolume);
    if (announce) this.speak(`Voice volume ${Math.round(this.liveVolume * 100)} percent.`, { interrupt: true, urgent: true });
  }
  nudgeVolume(delta) { this.setVolume(this.liveVolume + delta); }

  /**
   * Initialize available voices
   */
  initializeVoices() {
    // Wait for voices to be loaded
    if (this.speechSynthesis.getVoices().length === 0) {
      this.speechSynthesis.addEventListener('voiceschanged', () => {
        this.loadVoices();
      });
    } else {
      this.loadVoices();
    }
  }

  /**
   * Load and set default voice
   */
  loadVoices() {
    const voices = this.speechSynthesis.getVoices();
    debugLog('Available voices:', voices.length);

    let preferred = '';
    try { preferred = getSetting('ttsVoice') || ''; } catch (_) {}

    this.defaultVoice = pickVoice(voices, preferred);
    if (this.defaultVoice) debugLog('Selected voice:', this.defaultVoice.name);

    // Fill the settings dropdown now that the browser has told us what exists.
    // Registration happens at init, long before the voice list is ready.
    try {
      const setting = game.settings.settings.get('folken-games-quick-menu.ttsVoice');
      if (setting) setting.choices = voiceChoices(voices);
    } catch (_) { /* non-fatal */ }
  }

  /**
   * Speak text using TTS — routes through provider chain:
   * 1. Talking Actors (if active and actor has a voice)
   * 2. ElevenLabs (if API key configured)
   * 3. Browser Web Speech API (fallback)
   */
  speak(text, options = {}) {
    if (!getSetting('enableTTS') || !text) return;

    // Last line of defence. PF1 hands back enriched roll notes carrying anchor
    // markup; one of those reached the voice in 0.8.0 and Josh heard the raw
    // link code read out. Callers strip at the source, but nothing should be
    // able to put markup into his ear by forgetting to.
    text = expandForSpeech(stripMarkup(text));
    if (!text) return;

    // The same line twice within a tenth of a second is a doubled keypress -
    // a screen reader can deliver one press as two keydowns - not two
    // requests. Different lines are never dropped: the queue takes them all.
    const now = Date.now();
    if (text === this._lastText && now - (this.lastSpeak || 0) < 100) {
      debugLog('TTS duplicate, skipping:', text);
      return;
    }
    this.lastSpeak = now;
    this._lastText = text;

    debugLog('Speaking:', text);

    // Nothing cuts a line off except menu navigation (interrupt: true) and the
    // stop key. A result waits its turn and is spoken once Chrome is silent.
    // Until 0.17.0 every item, attack and power spoke its name with interrupt
    // on when used, which cancelled the previous command's result mid-word;
    // Josh's log showed eight attack results ended by "interrupted" the
    // moment the next name started.

    const provider = getSetting('ttsProvider') || 'auto';

    // Try Talking Actors first (auto or explicit)
    if (provider === 'auto') {
      if (this._speakViaTalkingActors(text)) return;
      if (this._speakViaElevenLabs(text)) return;
    } else if (provider === 'elevenlabs') {
      if (this._speakViaElevenLabs(text)) return;
    }

    // Fallback: browser Web Speech API
    this._speakViaBrowser(text, options);
  }

  /**
   * Try to speak via acd-talking-actors-forked module.
   * Uses the current actor's configured ElevenLabs voice.
   * @returns {boolean} true if handled
   */
  _speakViaTalkingActors(text) {
    try {
      const talkingActors = game.modules.get('acd-talking-actors-forked');
      if (!talkingActors?.active) return false;

      const actor = game.folkenQuickMenu?.menuManager?.getCurrentActor();
      if (!actor) return false;

      // Check if the actor has a voice configured via Talking Actors flags
      const voiceId = actor.getFlag('acd-talking-actors-forked', 'voiceId')
                   || actor.getFlag('acd-talking-actors', 'voiceId');
      if (!voiceId) return false;

      // Use the Talking Actors API if available
      const taApi = game.modules.get('acd-talking-actors-forked')?.api
                 || window.TalkingActorsApi;
      if (taApi?.speak) {
        taApi.speak(actor, text);
        debugLog('TTS via Talking Actors:', voiceId);
        return true;
      }
    } catch (error) {
      debugLog('Talking Actors TTS failed, falling back:', error);
    }
    return false;
  }

  /**
   * Try to speak via ElevenLabs API directly.
   * @returns {boolean} true if handled
   */
  _speakViaElevenLabs(text) {
    try {
      const apiKey = getSetting('elevenlabsApiKey');
      const voiceId = getSetting('elevenlabsVoiceId');
      if (!apiKey || !voiceId) return false;

      // Fire and forget — don't block the UI
      this._elevenLabsSpeak(apiKey, voiceId, text);
      debugLog('TTS via ElevenLabs:', voiceId);
      return true;
    } catch (error) {
      debugLog('ElevenLabs TTS failed, falling back:', error);
    }
    return false;
  }

  /**
   * ElevenLabs text-to-speech API call.
   */
  async _elevenLabsSpeak(apiKey, voiceId, text) {
    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5
          }
        })
      });

      if (!response.ok) {
        console.error('ElevenLabs API error:', response.status);
        return;
      }

      const audioBlob = await response.blob();
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audio.onended = () => URL.revokeObjectURL(audioUrl);
      audio.play();
    } catch (error) {
      console.error('ElevenLabs playback error:', error);
    }
  }

  /**
   * Speak via browser Web Speech API (original behavior).
   */
  _speakViaBrowser(text, options = {}) {
    if (!this.queue) return;
    this.queue.enqueue(text, {
      interrupt: options.interrupt === true,
      rate: options.rate,
      pitch: options.pitch,
      volume: options.volume,
    });
  }

  /**
   * Build one utterance and hand it to Chrome. Only the queue calls this, and
   * only once the engine is silent. The queue hears about start and end so it
   * knows when to send the next line; the watchdog hears about every word so
   * it knows the engine is alive.
   */
  _speakNow(entry, handlers) {
    const { text, options = {} } = entry;
    const utterance = new SpeechSynthesisUtterance(text);

    if (this.defaultVoice) {
      utterance.voice = this.defaultVoice;
    }

    // Base rate from the live, player-adjustable value (, / . keys)
    let rate = options.rate || this.liveRate;
    if (text.length > 100) rate *= 0.9;
    if (text.length > 200) rate *= 0.85;

    utterance.rate = Math.max(0.5, Math.min(3.0, rate));
    utterance.pitch = options.pitch || 1.0;
    utterance.volume = options.volume ?? this.liveVolume; // live, player-adjustable ( - / = keys )

    const alive = () => { this.lastAliveTs = Date.now(); };
    utterance.onstart = () => { alive(); handlers.onstart?.(); };
    utterance.onboundary = alive;
    utterance.onend = () => { alive(); handlers.onend?.(); };
    utterance.onerror = (event) => {
      alive();
      if (event?.error !== 'interrupted' && event?.error !== 'canceled') console.error('TTS error:', event.error);
      handlers.onerror?.(event);
    };

    this.speechSynthesis.speak(utterance);
  }

  /**
   * The stop key: silence the line playing now. Everything waiting still
   * plays, in order. Josh, 2026-10-29: "If Option cleared the line too, it
   * would throw away the Perception result, which is the very thing I'm trying
   * to avoid."
   * @returns {boolean} whether anything was actually playing
   */
  stop() {
    this.lastAliveTs = Date.now();
    if (this.queue) return this.queue.stopCurrent();
    const busy = !!(this.speechSynthesis.speaking || this.speechSynthesis.pending);
    try { this.speechSynthesis.cancel(); } catch (_) {}
    return busy;
  }

  /** Drop everything, playing and waiting. */
  stopAll() {
    this.lastAliveTs = Date.now();
    if (this.queue) this.queue.clear();
    else try { this.speechSynthesis.cancel(); } catch (_) {}
  }

  /** Is anything speaking or queued right now? */
  get isSpeaking() {
    if (this.queue) return this.queue.busy;
    return !!(this.speechSynthesis?.speaking || this.speechSynthesis?.pending);
  }

  /**
   * The two engine workarounds the Poker Dungeon needed, both independent of
   * any state of ours so neither can desync:
   *  - Chrome silently pauses speech after about 15 s of output; resume() every
   *    8 s un-pauses it and does nothing otherwise.
   *  - A cancel() landing mid-utterance can wedge Chrome's engine for good: it
   *    claims to be speaking with a dead queue. If it says it is busy and no
   *    word has started for 8 s, cancel() clears it.
   */
  _startEngineWatch() {
    if (this._engineWatch) return;
    this.lastAliveTs = Date.now();
    this._engineWatch = [
      setInterval(() => { try { this.speechSynthesis.resume(); } catch (_) {} }, 8000),
      setInterval(() => {
        const eng = this.speechSynthesis;
        if (!(eng.speaking || eng.pending)) return;
        if (Date.now() - (this.lastAliveTs || 0) < 8000) return;
        console.warn('folken-games-quick-menu | speech engine wedged, resetting');
        try { eng.cancel(); } catch (_) {}
        this.lastAliveTs = Date.now();
        this.queue?.noteReset();
      }, 3000),
    ];
  }

  /**
   * The voice is dead: the watchdog has reset three times running and nothing
   * has started. Josh, 2026-10-29, the second time in a fortnight: after a long
   * session Chrome reported speaking with nothing coming out, every voice in
   * every tab, and only quitting Chrome brought it back. The Quick Menu cannot
   * say so, but its tones go through the AudioContext and still play, so a
   * sound he has never heard before means "the voice is down", and a whisper
   * in chat says what to do about it.
   */
  _voiceDown() {
    console.warn('folken-games-quick-menu | speech engine is not producing sound; quit and reopen Chrome');
    try { playEarcon('voiceDown', { volume: this.liveVolume }); } catch (_) {}
    try {
      ChatMessage.create({
        whisper: [game.user.id],
        content: '<div class="fqm-chat-msg"><strong>The Quick Menu voice is down.</strong> Chrome\'s speech engine has stopped making sound. Quit Chrome completely and reopen it.</div>',
        speaker: { alias: 'Quick Menu' },
      });
    } catch (_) { /* the tone is what matters */ }
  }

  /**
   * Check if TTS is available
   */
  isAvailable() {
    return 'speechSynthesis' in window;
  }

  /**
   * Get available voices
   */
  getVoices() {
    return this.speechSynthesis.getVoices();
  }

  /**
   * Set voice by name
   */
  setVoice(voiceName) {
    const voices = this.getVoices();
    const voice = voices.find(v => v.name === voiceName);
    if (voice) {
      this.defaultVoice = voice;
      debugLog('Voice changed to:', voiceName);
      return true;
    }
    return false;
  }

  /**
   * Clean up skill names for TTS to remove redundant words
   */
  cleanupSkillName(name) {
    if (!name) return name;
    
    // Remove "Knowledge" prefix from knowledge skills to save time
    // "Knowledge (Arcana)" becomes "Arcana"
    // "Knowledge (Geography)" becomes "Geography" 
    // "Knowledge Nobility" becomes "Nobility"
    
    // Debug log to see what we're working with
    debugLog('Original skill name:', name);
    
    let cleaned = name;
    
    if (name.toLowerCase().includes('knowledge')) {
      // More aggressive replacement - handle all knowledge formats
      cleaned = name
        .replace(/^Knowledge\s*\([^)]+\)/i, (match) => {
          // Extract content from parentheses: "Knowledge (Arcana)" -> "Arcana"
          const content = match.match(/\(([^)]+)\)/);
          return content ? content[1] : match;
        })
        .replace(/^Knowledge\s+(.+)/i, '$1')  // "Knowledge Nobility" -> "Nobility"
        .trim();
    }
    
    debugLog('Cleaned skill name:', cleaned);
    return cleaned;
  }

  /**
   * Announce menu navigation
   */
  announceNavigation(direction, currentItem) {
    if (!currentItem) return;
    
    let message = '';
    switch (direction) {
      case 'up':
      case 'down':
        message = this.cleanupSkillName(currentItem.label);
        break;
      case 'forward':
        message = `Entering ${this.cleanupSkillName(currentItem.label)}`;
        break;
      case 'back':
        message = 'Back';
        break;
      case 'open':
        message = 'Quick Menu opened';
        break;
      case 'close':
        message = 'Quick Menu closed';
        break;
      default:
        message = this.cleanupSkillName(currentItem.label);
    }
    
    this.speak(message, { interrupt: true });
  }

  /**
   * Announce a complete menu listing
   */
  announceMenuListing(menuName, items) {
    if (!items || items.length === 0) {
      this.speak(`${menuName}. No items available.`, { interrupt: true });
      return;
    }
    
    // Create a well-paced menu announcement
    let message = `${menuName}. Available options: `;
    
    // Filter out header items and format the list
    const validItems = items.filter(item => item.type !== 'header');
    const itemList = validItems
      .map((item, index) => `${index + 1}, ${this.cleanupSkillName(item.label)}`)
      .join('. ');
    
    message += itemList;
    
    // Add navigation hint
    if (validItems.length > 3) {
      message += '. Use arrow keys or numbers to navigate.';
    }
    
    // Use base rate multiplied by 0.9 for menu listings
    const baseRate = this.liveRate;
    
    this.speak(message, { 
      interrupt: true, 
      rate: baseRate * 0.9 // Slightly slower for menu listings
    });
  }

  /**
   * Announce action execution
   */
  announceAction(actionType, actionName) {
    let message = '';
    
    switch (actionType) {
      case 'skill':
        message = `Rolling ${actionName}`;
        break;
      case 'attack':
        message = `Attacking with ${actionName}`;
        break;
      case 'spell':
        message = `Casting ${actionName}`;
        break;
      case 'item':
        message = `Using ${actionName}`;
        break;
      case 'save':
        message = `Rolling ${actionName}`;
        break;
      case 'ability':
        message = `Rolling ${actionName}`;
        break;
      case 'initiative':
        message = `Rolling ${actionName}`;
        break;
      default:
        message = `Executing ${actionName}`;
    }
    
    this.speak(message, { interrupt: false, queue: true });
  }

  /**
   * Announce dice roll result
   */
  announceRollResult(total) {
    if (!getSetting('enableTTS') || total === undefined || total === null) return;
    
    debugLog('Announcing roll result:', total);
    
    // Queued behind the name, and at the player's own volume. Until 0.15.0 the
    // results forced full volume, so turning the voice down with the minus key
    // made everything quieter except the one thing he most needed to hear.
    this.speak(total.toString(), { interrupt: false, queue: true });
  }

  /**
   * Announce an attack or maneuver result.
   *
   * This read only chatMessage.rolls until 0.12.0, which PF1 leaves empty on an
   * attack card, so every weapon attack and every /cmb rolled from the menu was
   * silent. Josh found it through /cmb because that command was new; the attack
   * path had the same defect all along.
   *
   * extractRollTotals tries each shape the numbers might be in. When none
   * matches it says the roll happened rather than inventing a number, and logs
   * the card shape so the real path can be identified from a console instead of
   * guessed at a third time.
   */
  announceAttackResult(chatMessage, { quietIfNone = false, healing = false } = {}) {
    if (!getSetting('enableTTS') || !chatMessage) return;

    const totals = extractRollTotals(chatMessage);

    // Short while a combat is running, fuller outside it. A full attack can be
    // five numbers in a row; mid-fight they should arrive bare, and out of
    // combat there is room to label them.
    let mode = 'auto';
    try { mode = getSetting('verbosity') || 'auto'; } catch (_) {}
    const terse = shouldBeTerse(mode, !!game.combat);

    const line = renderAttackTotals(totals, { terse, healing });

    if (line) {
      debugLog('attack total read from', totals.source);
      this.speak(line, { interrupt: false, queue: true });
      return;
    }

    // A spell or item with nothing to roll - Shield, Mage Armor - has no number,
    // and that is not an error. Its name was spoken when it was accepted.
    if (quietIfNone) return;

    console.warn('folken-games-quick-menu | no roll total found on this card:',
      describeShape(chatMessage));
    this.speak('Rolled. Result is in chat.', { interrupt: false, queue: true });
  }

  /**
   * Announce error or warning
   */
  announceError(message) {
    const baseRate = this.liveRate;
    
    this.speak(`Error: ${message}`, {
      interrupt: false,
      rate: baseRate * 0.9,
      pitch: 0.8
    });
  }

  /**
   * Test TTS functionality
   */
  test() {
    if (this.isAvailable()) {
      this.speak('Text to speech is working correctly.');
      return true;
    } else {
      console.warn('Text-to-speech is not available in this browser');
      return false;
    }
  }
}
