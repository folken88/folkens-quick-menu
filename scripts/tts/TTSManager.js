/**
 * TTSManager - Text-to-Speech functionality
 * Handles speech synthesis for menu navigation
 */

import { debugLog, getSetting } from '../module.js';

export class TTSManager {
  constructor() {
    this.speechSynthesis = window.speechSynthesis;
    this.defaultVoice = null;
    this.speaking = false;
    this.queue = [];
    
    // Initialize when voices are loaded
    this.initializeVoices();
  }

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
    
    // Try to find a good default voice (English, preferably female for accessibility)
    this.defaultVoice = voices.find(voice => 
      voice.lang.startsWith('en') && voice.name.toLowerCase().includes('female')
    ) || voices.find(voice => 
      voice.lang.startsWith('en')
    ) || voices[0];
    
    if (this.defaultVoice) {
      debugLog('Selected default voice:', this.defaultVoice.name);
    }
  }

  /**
   * Speak text using TTS
   */
  speak(text, options = {}) {
    if (!getSetting('enableTTS') || !text) return;
    
    // Prevent rapid TTS calls that cause interruption errors
    const now = Date.now();
    if (now - (this.lastSpeak || 0) < 50) {
      debugLog('TTS call too rapid, skipping:', text);
      return;
    }
    this.lastSpeak = now;
    
    debugLog('Speaking:', text);
    
    // Stop current speech if interrupting
    if (options.interrupt !== false) {
      this.stop();
    }
    
    // Create utterance
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Set voice and properties
    if (this.defaultVoice) {
      utterance.voice = this.defaultVoice;
    }
    
    // Get base rate from settings (convert percentage to decimal)
    const baseRate = (getSetting('ttsSpeed') || 120) / 100;
    
    // Adjust rate based on content length for better comprehension
    let rate = options.rate || baseRate;
    if (text.length > 100) {
      rate *= 0.9; // Slow down slightly for longer content
    }
    if (text.length > 200) {
      rate *= 0.85; // Slow down more for very long content
    }
    
    utterance.rate = Math.max(0.5, Math.min(3.0, rate)); // Clamp between 0.5x and 3.0x
    utterance.pitch = options.pitch || 1.0;
    utterance.volume = options.volume || 0.8;
    
    // Handle events
    utterance.onstart = () => {
      this.speaking = true;
      debugLog('TTS started speaking');
    };
    
    utterance.onend = () => {
      this.speaking = false;
      debugLog('TTS finished speaking');
      this.processQueue();
    };
    
    utterance.onerror = (event) => {
      console.error('TTS error:', event.error);
      this.speaking = false;
      this.processQueue();
    };
    
    // Speak or queue
    if (this.speaking && options.queue !== false) {
      this.queue.push(utterance);
    } else {
      this.speechSynthesis.speak(utterance);
    }
  }

  /**
   * Stop current speech
   */
  stop() {
    if (this.speechSynthesis.speaking) {
      this.speechSynthesis.cancel();
    }
    this.speaking = false;
    this.queue = [];
  }

  /**
   * Process speech queue
   */
  processQueue() {
    if (this.queue.length > 0 && !this.speaking) {
      const nextUtterance = this.queue.shift();
      this.speechSynthesis.speak(nextUtterance);
    }
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
    const baseRate = (getSetting('ttsSpeed') || 120) / 100;
    
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
    
    // Use a clear, direct announcement of the result
    this.speak(total.toString(), { 
      interrupt: false, 
      queue: true,
      volume: 1.0 
    });
  }

  /**
   * Announce detailed attack results (to hit + damage)
   */
  announceAttackResult(chatMessage) {
    if (!getSetting('enableTTS') || !chatMessage.rolls) return;
    
    debugLog('Announcing attack result:', chatMessage);
    
    let announcement = '';
    const rolls = chatMessage.rolls;
    
    // Look for attack roll (usually first) and damage rolls
    if (rolls.length > 0) {
      const attackRoll = rolls[0];
      if (attackRoll?.total !== undefined) {
        announcement += `${attackRoll.total} to hit`;
        
        // Look for damage rolls (usually subsequent rolls)
        if (rolls.length > 1) {
          const damageRolls = rolls.slice(1);
          const damageTotal = damageRolls.reduce((sum, roll) => sum + (roll.total || 0), 0);
          
          if (damageTotal > 0) {
            announcement += `, ${damageTotal} damage`;
          }
        }
      }
    }
    
    // Fall back to just the first roll total if we can't parse properly
    if (!announcement && rolls[0]?.total !== undefined) {
      announcement = rolls[0].total.toString();
    }
    
    if (announcement) {
      this.speak(announcement, { 
        interrupt: false, 
        queue: true,
        volume: 1.0 
      });
    }
  }

  /**
   * Announce error or warning
   */
  announceError(message) {
    const baseRate = (getSetting('ttsSpeed') || 120) / 100;
    
    this.speak(`Error: ${message}`, { 
      interrupt: true, 
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
