/**
 * AbbreviationGenerator - Pure functions for generating 3-4 letter abbreviations
 * from ability/skill/item/spell names.
 */

// Words to skip when building multi-word acronyms
const SKIP_WORDS = new Set(['of', 'the', 'a', 'an', 'and', 'or', 'in', 'on', 'to', 'for', 'with', 'at', 'by', 'from']);

// Foundry built-in chat commands and our meta-commands — never generate these as abbreviations
const RESERVED_COMMANDS = new Set([
  'r', 'roll', 'gmr', 'gmroll', 'br', 'blindroll', 'sr', 'selfroll',
  'pr', 'publicroll', 'ic', 'ooc', 'em', 'emote', 'me',
  'w', 'whisper', 'reply', 'gm', 'players', 'm', 'macro',
  'scan', 'fqm', 'list', 'find',
  'st', 'stat', 'status', 'hp', 'cond', 'conds', 'conditions', 'bf', 'buff', 'buffs'
]);

/**
 * Legacy abbreviation table matching the old folkens-macros-pf1 names exactly.
 * These take priority so Josh's muscle memory is preserved.
 */
const LEGACY_ABBREVIATIONS = {
  // PF1 skills (match system skill keys)
  'Acrobatics': 'acr',
  'Appraise': 'apr',
  'Bluff': 'blf',
  'Climb': 'clm',
  'Diplomacy': 'dip',
  'Disable Device': 'dev',
  'Disguise': 'dis',
  'Escape Artist': 'esc',
  'Fly': 'fly',
  'Handle Animal': 'han',
  'Heal': 'hea',
  'Intimidate': 'itm',
  'Intimidation': 'itm',
  'Knowledge (Arcana)': 'kar',
  'Knowledge (Dungeoneering)': 'kdu',
  'Knowledge (Engineering)': 'ken',
  'Knowledge (Geography)': 'kge',
  'Knowledge (History)': 'khi',
  'Knowledge (Local)': 'klo',
  'Knowledge (Nature)': 'kna',
  'Knowledge (Nobility)': 'kno',
  'Knowledge (Planes)': 'kpl',
  'Knowledge (Religion)': 'kre',
  'Linguistics': 'lin',
  'Perception': 'per',
  'Ride': 'rid',
  'Sense Motive': 'sen',
  'Sleight of Hand': 'sle',
  'Spellcraft': 'spl',
  'Stealth': 'ste',
  'Survival': 'sur',
  'Swim': 'swm',
  'Use Magic Device': 'umd',

  // PF2e skills
  'Athletics': 'ath',
  'Arcana': 'arc',
  'Crafting': 'cra',
  'Deception': 'dec',
  'Medicine': 'med',
  'Nature': 'nat',
  'Occultism': 'occ',
  'Performance': 'perf',
  'Religion': 'rel',
  'Society': 'soc',
  'Thievery': 'thi',

  // Ability checks
  'Strength': 'str',
  'Strength Check': 'str',
  'Dexterity': 'dex',
  'Dexterity Check': 'dex',
  'Constitution': 'con',
  'Constitution Check': 'con',
  'Intelligence': 'int',
  'Intelligence Check': 'int',
  'Wisdom': 'wis',
  'Wisdom Check': 'wis',
  'Charisma': 'cha',
  'Charisma Check': 'cha',

  // Saves
  'Fortitude': 'for',
  'Fortitude Save': 'for',
  'Reflex': 'ref',
  'Reflex Save': 'ref',
  'Will': 'wil',
  'Will Save': 'wil',

  // Combat
  'Initiative': 'init',
  'Stabilize': 'stab',
  'Concentration Check': 'conc',
  'Caster Level Check': 'clc',
};

/**
 * Overrides for system keys that are wrong or that collide.
 *
 * The raw PF1 key wins over everything else (step 1 below), so these are the
 * only way to correct it. Ratified by Tobias 2026-08-27: saves are three
 * letters because they are among the most-typed commands and every keystroke
 * costs a blind typist.
 */
const SAVE_KEY_OVERRIDES = { fort: 'for', will: 'wil', ref: 'ref' };

/**
 * PF1 uses the skill key "int" for Intimidate, which collides with the
 * Intelligence ability check. Abilities own the iconic three-letter set, so
 * Intimidate moves to "itm".
 */
const SKILL_KEY_OVERRIDES = { int: 'itm' };

/**
 * No aliases. Josh, 2026-10-04: "Why do we need multiple macros to fire the
 * same thing? One command per thing is easier to learn and leaves fewer codes
 * to clash with later." One name, one command.
 */
export const LEGACY_ALIASES = {};

/** Never hand back a command Foundry or our own meta-commands already own. */
function safe(abbrev) {
  const a = String(abbrev || '').toLowerCase();
  return RESERVED_COMMANDS.has(a) ? a + 'x' : a;
}

/**
 * Generate a 3-4 letter abbreviation for a name.
 *
 * Priority:
 *  1. System key (skillKey, saveType, abilityKey) if present on the action item
 *  2. Legacy table match
 *  3. Multi-word acronym (first letter of significant words, max 4)
 *  4. Single-word truncation (first 4 chars)
 *
 * @param {string} name - The display name
 * @param {Object} [actionItem] - Optional action item with system keys
 * @returns {string} lowercase abbreviation
 */
export function generateAbbreviation(name, actionItem = null) {
  if (!name) return '';

  // 0. Subskills abbreviate from their own name. Their skillKey is a path like
  //    "pro.subSkills.pro1", which would otherwise collapse every Profession
  //    onto the same command.
  if (actionItem && actionItem.abbrevHint) {
    const hint = String(actionItem.abbrevHint).replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toLowerCase();
    if (hint) return safe(hint);
  }

  // 1. System key takes priority for skills/saves/abilities, after correction
  if (actionItem) {
    if (actionItem.skillKey) {
      const k = actionItem.skillKey.toLowerCase();
      return safe(SKILL_KEY_OVERRIDES[k] || k);
    }
    if (actionItem.saveType) {
      const k = actionItem.saveType.toLowerCase();
      return safe(SAVE_KEY_OVERRIDES[k] || k);
    }
    if (actionItem.abilityKey) return safe(actionItem.abilityKey.toLowerCase());
  }

  // 2. Legacy table
  if (LEGACY_ABBREVIATIONS[name]) {
    return safe(LEGACY_ABBREVIATIONS[name]);
  }

  // 3. Multi-word acronym
  const words = name.split(/[\s\-\/]+/).filter(w => !SKIP_WORDS.has(w.toLowerCase()) && w.length > 0);

  if (words.length >= 2) {
    // Must go through safe(): "Scroll of Technomancy" reduces to "st", which
    // the status command already owns, and this path used to return early and
    // skip the reserved check entirely.
    const acronym = words.map(w => w[0].toLowerCase()).join('');
    return safe(acronym.slice(0, 4));
  }

  // 4. Single word: first 4 characters
  const result = name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toLowerCase();

  // 5. Never collide with Foundry built-in or meta-commands
  return safe(result);
}

/**
 * Build an abbreviation with `extra` additional letters taken from the last
 * significant word. Used to pull two things apart when they land on the same
 * code, rather than asking the player to pick a number.
 *
 *   Scroll of Technomancy -> st, ste, stec, stech
 *   Scroll of Teleport    -> st, ste, stel, stele
 *
 * extra = 0 reproduces the normal abbreviation, so nothing that already works
 * moves: Wand of Cure Light Wounds stays wclw.
 */
export function expandAbbreviation(name, extra = 0) {
  const words = String(name || '')
    .split(/[^A-Za-z0-9]+/)
    .filter(w => w && !SKIP_WORDS.has(w.toLowerCase()));
  if (!words.length) return '';
  if (words.length === 1) return safe(words[0].slice(0, 4 + extra).toLowerCase());
  const head = words.slice(0, -1).map(w => w[0].toLowerCase()).join('');
  const tail = words[words.length - 1].slice(0, 1 + extra).toLowerCase();
  return safe((head + tail).slice(0, 8));
}

/**
 * Second separation strategy: extend the FIRST word instead of the last.
 *
 * Needed when the last word is the one they share. "Detect Magic" and
 * "Dispel Magic" both end in Magic, so taking more of the last word gives
 * dma, dmag, dmagi for both forever. Taking more of the first gives dem and
 * dim at the first step.
 */
export function expandAbbreviationHead(name, extra = 1) {
  const words = String(name || '')
    .split(/[^A-Za-z0-9]+/)
    .filter(w => w && !SKIP_WORDS.has(w.toLowerCase()));
  if (!words.length) return '';
  if (words.length === 1) return safe(words[0].slice(0, 4 + extra).toLowerCase());
  const head = words[0].slice(0, 1 + extra).toLowerCase();
  const rest = words.slice(1).map(w => w[0].toLowerCase()).join('');
  return safe((head + rest).slice(0, 8));
}

/**
 * Spell an abbreviation out letter-by-letter for TTS, so "balr" is read as
 * "b a l r" (individual letters the player types) instead of being pronounced
 * as the word "balrruh". Used wherever a command is read aloud.
 * @param {string} abbrev
 * @returns {string}
 */
export function spellOut(abbrev) {
  return String(abbrev || '').split('').join(' ');
}

/**
 * Check if a name has a legacy abbreviation defined.
 * @param {string} name
 * @returns {boolean}
 */
export function hasLegacyAbbreviation(name) {
  return name in LEGACY_ABBREVIATIONS;
}

/**
 * Get all legacy abbreviations (for building the base game-constants map).
 * @returns {Object}
 */
export function getLegacyAbbreviations() {
  return { ...LEGACY_ABBREVIATIONS };
}
