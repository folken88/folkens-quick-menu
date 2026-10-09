/**
 * Choosing which synthesised voice reads the menu. Pure, so it can be tested.
 *
 * Josh, 2026-10-08: the menu was speaking as "Google UK English Female" and he
 * could not make out item 5 in Skills - "Climb" came through as "ply", as in
 * plywood. He only learned what it was by asking. Switching to Samantha, a
 * voice installed on his Mac, made the skill names clear.
 *
 * The old rule was "the first English voice with 'female' in its name", which is
 * how a remote, lower-quality Google voice won. Two changes: the player can name
 * the voice they want, and when they have not, a locally installed voice is
 * preferred over a network one, because the local ones are clearer.
 *
 * Deliberately not following the operating system default: he wants the module
 * to sound different from VoiceOver so he can tell which one is talking.
 */

/** Is this a voice installed on the machine rather than fetched over the network? */
function isLocal(voice) {
  // localService is the standard flag; treat unknown as local, since the remote
  // voices we want to avoid do set it to false.
  return voice?.localService !== false;
}

function isEnglish(voice) {
  return typeof voice?.lang === 'string' && voice.lang.toLowerCase().startsWith('en');
}

/**
 * @param {Array} voices           speechSynthesis.getVoices()
 * @param {string} [preferredName] exact name from the player's setting
 * @returns {object|null}
 */
export function pickVoice(voices, preferredName) {
  const list = Array.isArray(voices) ? voices.filter(Boolean) : [];
  if (!list.length) return null;

  // 1. Exactly what the player asked for, if it is still installed.
  const wanted = String(preferredName ?? '').trim();
  if (wanted) {
    const exact = list.find(v => v.name === wanted);
    if (exact) return exact;
    const loose = list.find(v => String(v.name ?? '').toLowerCase() === wanted.toLowerCase());
    if (loose) return loose;
    // Named a voice that is not here any more: fall through rather than stay silent.
  }

  // 2. A local English voice. These are the clear ones.
  const english = list.filter(isEnglish);
  const localEnglish = english.filter(isLocal);
  if (localEnglish.length) return localEnglish[0];

  // 3. Any English voice.
  if (english.length) return english[0];

  // 4. Anything at all, rather than nothing.
  return list[0];
}

/**
 * The choices offered in the settings dropdown: every installed voice, English
 * first, with an automatic option at the top.
 */
export function voiceChoices(voices) {
  const out = { '': 'Automatic (a local English voice)' };
  const list = Array.isArray(voices) ? voices.filter(v => v && v.name) : [];
  const english = list.filter(isEnglish);
  const rest = list.filter(v => !isEnglish(v));
  for (const v of [...english, ...rest]) {
    const where = isLocal(v) ? 'on this computer' : 'online';
    out[v.name] = `${v.name} (${v.lang}, ${where})`;
  }
  return out;
}
