/**
 * CollisionResolver - Handles interactive abbreviation collision resolution
 * via chat whispers and TTS, guiding the blind player step by step.
 */

import { debugLog } from '../module.js';

export class CollisionResolver {
  constructor() {
    /** @type {{ abbreviation: string, items: Object[], timeout: number }|null} */
    this.pending = null;
    /** @type {Array<[string, Object[]]>} remaining collisions to walk through */
    this.queue = [];
  }

  /**
   * Whether we're currently waiting for a collision choice.
   */
  get hasPending() {
    return this.pending !== null;
  }

  /**
   * Start a collision resolution prompt.
   * Whispers the options to the player and announces via TTS.
   * @param {string} abbreviation
   * @param {Object[]} items - The colliding action items
   */
  initiatePrompt(abbreviation, items) {
    // Clear any existing pending resolution
    if (this.pending) {
      clearTimeout(this.pending.timeout);
    }

    const remaining = this.queue.length;
    const progressNote = remaining > 0 ? ` (${remaining} more after this)` : '';

    // Build whisper message
    const lines = [`<strong>Conflict for /${abbreviation}:${progressNote}</strong>`];
    items.forEach((item, i) => {
      lines.push(`&nbsp; <strong>${i + 1}.</strong> ${item.label} (${item.actionType})`);
    });
    lines.push(`<br>Type <strong>/1</strong> or <strong>/2</strong> to pick which keeps <strong>/${abbreviation}</strong>.`);
    lines.push(`The other will become <strong>/${abbreviation}2</strong>.`);

    this._whisper(lines.join('<br>'));

    // TTS announcement
    const tts = game.folkenQuickMenu?.tts;
    if (tts) {
      const names = items.map((item, i) => `${i + 1}, ${item.label}`).join('. ');
      tts.speak(`Conflict for ${abbreviation.split('').join(' ')}. ${names}. Type the number to choose.`);
    }

    // Store pending state with 60-second timeout (longer for walkthrough)
    this.pending = {
      abbreviation,
      items,
      timeout: setTimeout(() => {
        this.pending = null;
        this.queue = [];
        debugLog('CollisionResolver: timeout expired, clearing queue');
      }, 60000)
    };
  }

  /**
   * Handle a numeric choice from the player.
   * @param {number} number - The player's choice (1-indexed)
   * @returns {boolean} true if the choice was handled
   */
  async handleChoice(number) {
    if (!this.pending) return false;

    const { abbreviation, items } = this.pending;

    if (number < 1 || number > items.length) {
      this._whisper(`Invalid choice. Pick 1-${items.length}.`);
      game.folkenQuickMenu?.tts?.speak(`Invalid. Pick 1 through ${items.length}.`);
      return true;
    }

    const chosen = items[number - 1];
    clearTimeout(this.pending.timeout);
    this.pending = null;

    const actor = game.folkenQuickMenu?.menuManager?.getCurrentActor();
    if (actor) {
      // Save the choice to actor flags (don't execute — this is a scan walkthrough)
      await game.folkenQuickMenu.abbreviationResolver.saveCollisionChoice(
        actor, abbreviation, chosen, items
      );

      // Announce what was saved
      const others = items.filter(i => i.id !== chosen.id);
      const tts = game.folkenQuickMenu?.tts;
      if (tts) {
        const otherNames = others.map((o, i) => `${o.label} is now /${abbreviation}${i + 2}`).join('. ');
        tts.speak(`${chosen.label} keeps /${abbreviation}. ${otherNames}.`);
      }
    }

    // Advance to next collision in the queue
    this._advanceQueue();

    return true;
  }

  /**
   * Walk through all unresolved collisions sequentially.
   * Called after /scan completes.
   * @param {Map<string, Object[]>} collisions
   */
  async walkCollisions(collisions) {
    if (collisions.size === 0) return;

    const entries = Array.from(collisions.entries());
    // Queue all except the first (which we'll prompt immediately)
    this.queue = entries.slice(1);

    const [abbrev, items] = entries[0];
    this.initiatePrompt(abbrev, items);
  }

  /**
   * Advance to the next collision in the queue.
   */
  _advanceQueue() {
    if (this.queue.length === 0) {
      // All done!
      const tts = game.folkenQuickMenu?.tts;
      if (tts) {
        tts.speak('All conflicts resolved.');
      }
      this._whisper('<strong>All conflicts resolved.</strong> Your commands are ready.');
      return;
    }

    // Small delay so the previous TTS announcement finishes
    setTimeout(() => {
      const [abbrev, items] = this.queue.shift();
      this.initiatePrompt(abbrev, items);
    }, 2000);
  }

  /**
   * Send a whisper to the current user.
   * @param {string} content - HTML content
   */
  _whisper(content) {
    ChatMessage.create({
      whisper: [game.user.id],
      content: `<div class="fqm-collision-prompt">${content}</div>`,
      speaker: { alias: 'Quick Menu' }
    });
  }
}
