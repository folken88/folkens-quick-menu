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
  'scan', 'fqm', 'list', 'find'
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
  'Intimidate': 'intim',
  'Intimidation': 'intim',
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
  'Intelligence': 'intc',
  'Intelligence Check': 'intc',
  'Wisdom': 'wis',
  'Wisdom Check': 'wis',
  'Charisma': 'cha',
  'Charisma Check': 'cha',

  // Saves
  'Fortitude': 'fort',
  'Fortitude Save': 'fort',
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

  // 1. System key takes priority for skills/saves/abilities
  if (actionItem) {
    if (actionItem.skillKey) return actionItem.skillKey.toLowerCase();
    if (actionItem.saveType) return actionItem.saveType.toLowerCase();
    if (actionItem.abilityKey) return actionItem.abilityKey.toLowerCase();
  }

  // 2. Legacy table
  if (LEGACY_ABBREVIATIONS[name]) {
    return LEGACY_ABBREVIATIONS[name];
  }

  // 3. Multi-word acronym
  const words = name.split(/[\s\-\/]+/).filter(w => !SKIP_WORDS.has(w.toLowerCase()) && w.length > 0);

  if (words.length >= 2) {
    const acronym = words.map(w => w[0].toLowerCase()).join('');
    return acronym.slice(0, 4);
  }

  // 4. Single word: first 4 characters
  let result = name.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toLowerCase();

  // 5. Never collide with Foundry built-in or meta-commands
  if (RESERVED_COMMANDS.has(result)) {
    result = result + 'x';
  }

  return result;
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
