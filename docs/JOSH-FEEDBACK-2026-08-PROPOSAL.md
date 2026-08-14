# Fix Proposal — Josh's Field Report (2026-08-27)

Each numbered item: Josh's finding → diagnosis → proposed fix. Decisions
Tobias/Josh should ratify are marked **DECIDE**.

## 1. Saves: /fort /ref /will inconsistency
**Finding:** fort and will grew to 4 letters, reflex stayed 3.
**RULED (Tobias 2026-08-27): saves are THREE letters — `/for` `/ref`
`/wil` — because saves are among the most-typed commands and every
keystroke counts for a blind typist.** The current 4-letter forms
(`/fort`, `/will`) stay as silent aliases so nothing Josh learned this
month breaks; TTS and `/list` teach the 3-letter canonicals.

## 2. /init — works, unchanged.

## 3. Profession (Sailor) / Profession (Pirate) don't work
**Diagnosis:** PF1 stores Profession/Craft/Perform/Artistry as SUB-skills
(`skills.pro.subSkills.*`) with custom names. The extractor only walks
top-level skills, so subskills are invisible to /scan and to direct rolls.
**Fix:** extractor walks subSkills; each gets an abbreviation from its
OWN name: "Profession (Sailor)" → `/sail`, "Profession (Pirate)" →
`/pira` (first-4 of the parenthetical, collision-resolved per actor).
`/list skills` reads them out with the rest.

## 4. Caster level check missing
**Fix:** new command `/cl` → PF1 `actor.rollCL()` on the primary
spellbook; `/cl2` for the secondary book when present. TTS announces
"Caster level check, spellbook primary."

## 5. /ac and /hp "not working or unknown"
`/hp` and `/st` (full status incl. AC) shipped in 0.3.0 and are deployed
on every server — needs on-site verification of what Josh's world runs
(most likely culprit: advanced-macros still enabled there and eating the
message, or the world wasn't rescanned/refreshed since deploy).
**Fix:** (a) verify + fix interception order on Josh's world; (b) add a
dedicated `/ac` read (AC / touch / flat-footed) since Josh expects it —
cheap and useful even though /st includes it.

## 6. /int collision menu is broken (intelligence vs intimidate)
**Finding:** the interactive "type 1 or 2" resolver doesn't accept the
number.
**Diagnosis:** collision-resolver's number-reply capture fails in live
chat (likely the same ProseMirror `<p>` wrapping class of bug we fixed in
the interceptor, or resolver state not persisting between messages).
**Fix, two layers:**
- **Static disambiguation for built-ins — no menu at all.** PF1's skill
  key for Intimidate is literally `int`, which is why it collides with
  the ability. Reserve `/int` = Intelligence check (abilities are the
  iconic 3-letter set), give Intimidate `/itm` (+ alias `/inti`). The
  interactive menu should never trigger for built-in abilities/skills —
  it stays only for user-content collisions (items/spells).
- Fix the number-capture bug anyway (it still guards item collisions).

## 7. Consumables don't work (/wclw, /wort)
**Diagnosis:** consumable discovery in /scan either skips consumables or
Josh's actor wasn't rescanned; also note Josh typed `/woclw` — generator
drops small words ("of"), so canonical is `/wclw` — a teaching gap too.
**Fix:** (a) verify + fix consumable extraction in /scan (wands, potions,
scrolls with charges); (b) `/list items` must read them out spelled
letter-by-letter so the canonical form is discoverable; (c) after /scan,
TTS summary states counts per category ("12 consumables — say /list
items").

## 8. Spells: adopt Josh's LEVEL-PREFIX scheme  **DECIDE (recommended: yes)**
Josh proposes: `/<level><abbrev>` — `/3hast` (Haste 3), `/3slow`,
multi-word after the level uses initials: `/4tc` (Telekinetic Charge),
`/7tg` (Teleport Greater).
**Assessment:** better than the current flat scheme for real caster
lists. Level-scoping cuts the collision space by ~10x, mirrors how
prepared casters think ("my 3rd-level slots"), and matches the OLD macro
system's muscle memory. Rarely-colliding within a level; the interactive
resolver stays as the fallback for same-level collisions.
**Refinements on top of Josh's plan:**
- Single-word spells: level + first 4 letters (`/3hast`); multi-word:
  level + initials (`/4tc`); if still colliding in-level, extend the last
  word's letters (`/2pfe` vs `/2pfec` for the communal variant).
- Plain (unprefixed) abbreviations REMAIN as aliases whenever globally
  unique — `/hast` keeps working if only one Haste exists; the level form
  is the guaranteed-unambiguous canonical.
- 0-level: `/0dete` (Detect Magic) etc.
- TTS always teaches the canonical: "slash 3 h a s t, Haste, level 3."
- Voice-input future: the same level-scoped structure maps cleanly to
  "cast haste" / "cast third-level haste" disambiguation.

## 9. Global letter-count rule  **RULED (Tobias 2026-08-27): brevity-first**
"3 letters is best and should be used for most common functions. 4
letters when you have to, more only if there's no other way." The rule,
made deterministic:
- **Frequency wins the short form.** When two things want the same 3
  letters, the one Josh uses MORE in play gets it; the rarer one grows.
- **Abilities:** 3 fixed (str dex con int wis cha). `/con` =
  Constitution; Concentration check → `/conc`.
- **Saves:** 3 — `/for` `/ref` `/wil` (see #1); `/fort`/`/will` aliases.
- **Skills:** PF1's own keys (mostly 3); subskills from their own name,
  shortest unique (≥3): `/sai` (Sailor) if unique, else `/sail`.
- **Spells:** level-prefix scheme (#8) — level digit + shortest-unique
  letters within that level (initials for multi-word), so most spells
  land at 3-4 chars total incl. the digit.
- **Items/feats:** generated shortest-unique ≥2 significant letters,
  spelled out via TTS.

## 10. Voice not announcing spells
Two separate problems:
- **(a) Module-side:** ActionExecutor speaks confirmations for item use
  but NOT for spell casts. Fix: every executed action gets a TTS
  confirmation through the provider chain ("Haste, cast" — browser voice
  when no ElevenLabs), independent of any world audio config. Josh should
  never need the pf1 soundEffect to know a cast happened.
- **(b) World-side (Tobias's diagnosis, confirmed as the likely cause of
  the character voice being silent):** the iron-gods world is missing the
  ElevenLabs API key in its talking-actors/quickmenu settings, so
  Olbryn's spoken spell names are gone. Options: Tobias pastes the key in
  module settings (2 min), or Claude injects it into the world's settings
  DB while the world is unloaded (lock-aware write, same technique as the
  dpray fix). The poker ElevenLabs key is verified live and can serve
  until a dedicated key exists.

## Implementation order (proposed)
1. #6 static /int–/itm + #1 save aliases + #4 /cl + #5 /ac  (small, one release)
2. #3 subskills + #7 consumable discovery  (extractor work)
3. #8+#9 abbreviation scheme v2  (generator + resolver + docs; biggest)
4. #10a spell TTS confirmations (with #10b done by hand whenever)
All on v14-accessibility branch, tested on f1 (v13) + f4 (v14) per the
standing both-versions mandate; Josh re-tests after each release, not one
big-bang drop.
