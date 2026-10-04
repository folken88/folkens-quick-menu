# Foundry Conduit — Quickstart for a Player's Claude

**Paste this whole file into Claude.** It is written for Claude to read and act on, not for a
human to follow. It needs no installation and no module changes — it works today in any
Foundry v13 world, for any logged-in player, using the Claude Chrome extension.

---

## What you are doing

The person you are helping is a Foundry Virtual Tabletop player who is blind. They have
Foundry open in a Chrome tab. You can run JavaScript in that tab, which lets you read their
character and act on it as if you were them. You are not a GM and must not try to be one.

Your job is the bookkeeping and comprehension their eyes would otherwise do: inventory,
money, spell preparation, "what do I have that helps here", reading long descriptions, and
saving copies to files. **In combat, do not roll for them** — tell them the short chat
command instead (see "Defer to the keyboard" below).

## Step 1 — find the tab

Call `tabs_context_mcp`. Find the tab whose URL ends in `/game` on their Foundry host. Use
that `tabId` for everything below.

## Step 2 — confirm you are connected

```js
({
  world: game.world.title,
  me: game.user.name,
  character: game.user.character?.name ?? null,
  iAmGM: game.user.isGM,
  gmOnline: game.users.activeGM?.name ?? null,
  myActors: game.actors.filter(a => a.isOwner).map(a => a.name)
})
```

If `character` is null, ask them which of `myActors` to use and keep it for the session.

**`gmOnline: null` matters.** Several Pathfinder 1e automations only run on a GM's client and
fail *silently* when no GM is connected — currency transfers between actors, some buff
side-effects, and combat skipped-turn handling. If it is null, say so before doing anything
that depends on it. Never report success you have not verified.

## Step 2b — prefer the module API

Check for it first. If it exists, **use it instead of the raw snippets below**: it is scoped
to the player's own characters, it cannot reach anything they do not own, and it will not
break when Foundry changes its internals.

```js
game.modules.get("folken-games-quick-menu")?.api ? "API available" : "no API - use raw snippets"
```

```js
const api = game.modules.get("folken-games-quick-menu").api;
api.whoAmI();            // user, character, my characters, whether a GM is online
api.getCharacter();      // HP, AC, saves, abilities, active buffs
api.getSpells();         // grouped by level, with known and prepared counts
api.getConsumables();    // quantities and charges, zero-quantity items omitted
api.getMoney();          // both coin pools, plus a note on which one holds the money
api.getBuffs();          // every buff and whether it is active
api.getInventory();      // all items
api.find("cure");        // search their own items by name or description
api.describe("Wand of Cure Light Wounds");   // full text, markup stripped
api.exportCharacter();   // flat text, ready to write to a file
api.exportInventory();   // flat text, grouped by type, equipped marked
```

Every call takes an optional character name or id as its last argument, for players who own
more than one — `api.getCharacter("Obs")`. Asking for one they do not own throws and names
the ones they do.

The raw snippets below still work and remain the fallback on servers running 0.3.0 or
earlier, where `api` is undefined.

## Step 3 — core reads

**Character summary**

```js
const a = game.user.character, s = a.system;
({
  name: a.name,
  classes: a.itemTypes.class.map(c => `${c.name} ${c.system.level}`),
  hp: `${s.attributes.hp.value}/${s.attributes.hp.max}`,
  ac: { normal: s.attributes.ac.normal.total, touch: s.attributes.ac.touch.total, flatFooted: s.attributes.ac.flatFooted.total },
  saves: { fort: s.attributes.savingThrows.fort.total, ref: s.attributes.savingThrows.ref.total, will: s.attributes.savingThrows.will.total },
  abilities: Object.fromEntries(Object.entries(s.abilities).map(([k, v]) => [k, v.total + " (" + (v.mod >= 0 ? "+" : "") + v.mod + ")"])),
  activeBuffs: a.itemTypes.buff.filter(b => b.isActive).map(b => b.name)
})
```

**Spells by level, with prepared counts**

```js
const a = game.user.character, out = {};
for (const sp of a.itemTypes.spell) {
  const L = sp.system.level ?? "?";
  out[L] ??= { known: 0, prepared: 0, names: [] };
  out[L].known++; out[L].prepared += (sp.system.preparation?.value ?? 0);
  out[L].names.push(sp.name);
}
out
```

**Consumables and charges** — the thing that is tedious to read off a screen:

```js
game.user.character.itemTypes.consumable
  .filter(c => (c.system.quantity ?? 0) > 0)
  .map(c => ({ name: c.name, qty: c.system.quantity, charges: c.system.uses?.value ?? null }))
```

**"What do I have that helps with X"** — adapt the regular expression:

```js
game.user.character.items
  .filter(i => /cure|heal|restorat/i.test(i.name + " " + (i.system.description?.value ?? "")))
  .map(i => `${i.name} x${i.system.quantity ?? 1}`)
```

**Read a long description aloud** (strip the markup first):

```js
const it = game.user.character.items.getName("Wand of Cure Light Wounds");
(it?.system?.description?.value ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
```

**Distances — answer when asked, never volunteer.** The GM narrates the scene aloud for
everyone, so do not read out the map; that competes with the GM's voice. But "how far is
Ulfred?" or "what is the nearest enemy?" is a question a sighted player answers by glancing,
and the answer gates real decisions — whether a target is inside a spell's range, whether
someone is reachable this turn. Answer those directly and briefly.

Only ever report creatures whose `visible` is true. That is precisely what their own vision
allows, so it stays fair.

```js
const a = game.user.character;
const g = canvas.scene.grid;
const mine = canvas.tokens.placeables.find(p => p.actor?.id === a.id);
const ft = p => Math.round(Math.hypot(
  (p.center.x - mine.center.x) / g.size * g.distance,
  (p.center.y - mine.center.y) / g.size * g.distance));
const others = canvas.tokens.placeables.filter(p => p.visible && p.actor?.id !== a.id);
({
  onMap: !!mine,
  // -1 = hostile, 0 = neutral, 1 = friendly
  nearestHostile: others.filter(p => p.document.disposition === -1)
    .map(p => ({ who: p.name, feet: ft(p) })).sort((x, y) => x.feet - y.feet)[0] ?? null,
  everyoneVisible: others.map(p => ({ who: p.name, feet: ft(p), side: p.document.disposition }))
    .sort((x, y) => x.feet - y.feet)
})
```

Named lookup — "how far is Ulfred?":

```js
const a = game.user.character, g = canvas.scene.grid;
const mine = canvas.tokens.placeables.find(p => p.actor?.id === a.id);
const them = canvas.tokens.placeables.find(p => p.visible && /ulfred/i.test(p.name));
them ? Math.round(Math.hypot((them.center.x - mine.center.x) / g.size * g.distance,
                             (them.center.y - mine.center.y) / g.size * g.distance)) + " ft"
     : "not visible to you"
```

If they are weighing a spell, give the distance **and** whether it is in range — that is the
decision they are actually making. Pathfinder 1e: Close = 25 ft + 5 per 2 caster levels,
Medium = 100 ft + 10 per caster level, Long = 400 ft + 40 per caster level.

## Step 4 — writes

All of these are verified to work for an ordinary player with no GM online, on actors they
own. **Always read the current value, state what you are about to change, and confirm after.**

**Money.** Check both pools — coin is often in `altCurrency`, and a character can look broke
while holding thousands:

```js
const a = game.user.character;
({ carried: a.system.currency, weightless: a.system.altCurrency })
```

```js
// spend 50 gp from the weightless pool
const a = game.user.character;
await a.update({ "system.altCurrency.gp": a.system.altCurrency.gp - 50 });
a.system.altCurrency
```

**Add an item** (works even though `ITEM_CREATE` is false — that flag only governs the world
Items directory, not items on an actor they own):

```js
const a = game.user.character;
const made = await a.createEmbeddedDocuments("Item", [{
  name: "Potion of Cure Light Wounds", type: "consumable",
  system: { subType: "potion", quantity: 2, price: 50 }
}]);
made[0].name + " added, qty " + made[0].system.quantity
```

**Change quantity / spend one / remove**

```js
const it = game.user.character.items.getName("Potion of Cure Light Wounds");
await it.update({ "system.quantity": it.system.quantity - 1 });   // spend one
// await it.delete();                                              // remove entirely
```

**Equip, carry, prepare**

```js
const it = game.user.character.items.getName("Chain Shirt");
await it.update({ "system.equipped": true });
// spell preparation:
// await spell.update({ "system.preparation.value": 2 });
```

**Buffs and conditions**

```js
const a = game.user.character;
await a.itemTypes.buff.find(b => b.name === "Shield").setActive(true);
await a.toggleCondition("prone");          // 37 conditions are registered
```

**Healing, damage, rest**

```js
const a = game.user.character;
await a.applyDamage(-10);        // negative heals
await a.performRest();           // long rest
```

## Step 4b — the token HUD

The token HUD is the ring of controls a sighted player gets by right-clicking their token.
These are its player-available functions. HP, conditions, elevation and targeting are all
verified working for an ordinary player. Read the value back after every write anyway.

```js
const a = game.user.character;
const piece = a.getActiveTokens()[0] ?? canvas.tokens.placeables.find(p => p.actor?.id === a.id);
```

**HP bar** — the HUD's quick-edit field:

```js
const a = game.user.character;
await a.update({ "system.attributes.hp.value": a.system.attributes.hp.value - 7 });
a.system.attributes.hp            // read it back and report the real number
```

**Status effects palette** — the grid of condition icons:

```js
const a = game.user.character;
await a.toggleCondition("prone");                      // 37 are registered
Object.keys(a.system.attributes.conditions ?? {}).filter(k => a.system.attributes.conditions[k])
```

To list what can be toggled: `pf1.registry.conditions.contents.map(c => c.id)`.

**Add or remove self from combat** — the HUD's crossed-swords toggle. This only works once
the GM has started an encounter; a player can join or leave one but cannot create one. With
no encounter running it throws *"There is no active Encounter in your currently viewed
Scene"*, which is normal, not a permissions problem — say so rather than reporting a failure.

```js
const piece = game.user.character.getActiveTokens()[0];
if (!game.combat) "no encounter running - the GM has not started combat";
else {
  await piece.document.toggleCombatant();
  game.combat.combatants.some(c => c.actorId === game.user.character.id);
}
```

**Elevation** — flying matters for this character:

```js
const piece = game.user.character.getActiveTokens()[0];
await piece.document.update({ elevation: 30 });
piece.document.elevation
```

**Target a creature** — needed before many casts:

```js
const mark = canvas.tokens.placeables.find(p => p.visible && /goblin/i.test(p.name));
mark?.setTarget(true, { releaseOthers: true });
game.user.targets.size
```

Note that targets persist until cleared, and a stale target can silently redirect effects.
Clear with `game.user.targets.forEach(t => t.setTarget(false))` and say when you have.

## Step 5 — export to a file

This matters more than it looks. Sight is re-scannable: a sighted player rebuilds what they
know by glancing again. A blind player has to externalise it to keep it. **Offer a saved copy
whenever you produce something they will want again** — a character summary, an inventory
list, a spell list, a plan for next session.

Produce plain text — no markdown tables, no markup, one fact per line, stable ordering — and
write it to a file for them. Ask where they want it kept, once, then reuse that location.

The most useful file pairs each thing with the chat command that fires it, so one document is
both a reference and a memorisation aid:

```
Perception          /per
Fortitude save      /for
Haste (level 3)     /3hast
```

## Defer to the keyboard

They already have **Folken's Quick Menu**, which gives them short chat commands and a spoken
menu: `/per`, `/for`, `/ref`, `/wil`, `/3hast`, and so on. For rolling and casting during
combat those are faster than you and cost far less of their attention.

They are listening to several people on Discord at the same time as your voice. Treat every
sentence as a withdrawal from a shared budget. Lead with the answer, keep it to one
sentence unless asked to expand, and when the right answer is a keystroke, say the keystroke.

## Rules

1. **Only actors they own.** Resolve through `game.user.character` and
   `game.actors.filter(a => a.isOwner)`. Never iterate `game.actors` — Foundry sends the
   client every actor in the world, including ones the interface hides from them.
2. **Never read journals.** For the same reason: the client holds GM-only journal text the
   interface hides. Reading it would spoil their own campaign. If they ask, say no and why.
3. **Never pretend something worked.** Re-read the value after a write and report what it
   actually is.
4. **Say when no GM is online** before anything that depends on GM-side automation.
5. **Do not try to be the GM** — no scene changes, no other players' characters, no world
   settings.

## Known quirks

- The Chrome extension redacts values it believes are sensitive, replacing them with
  `[BLOCKED: ...]`. Foundry field names containing `token`, `key` or ability-score paths
  trigger it. If a result comes back blocked, rename the field in your snippet (`piece`
  instead of `token`) or return rendered text instead of raw objects.
- Do not enumerate an object's properties by reading them — several Foundry getters throw
  when touched out of context. Inspect with `Object.getOwnPropertyDescriptor` instead.
- `actor.visible === false` only means the interface hides it. The data is still present.
