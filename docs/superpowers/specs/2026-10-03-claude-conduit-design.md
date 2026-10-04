# Claude Conduit for Josh — Design

**Status:** approved design, not yet implemented.
**Rollout:** f1 only until further notice.

## Goal

Josh is blind, plays remotely, and uses **Claude Desktop on a Mac**. He should be able to
reach the same information and control over his character that sighted players get by
looking at a sheet. Quickmenu already gives him a TTS menu and short chat commands; this
adds an **agent front-end** so his Claude can read his character now, and act on it later.

A second benefit motivates the whole design: Claude's answers arrive through **his own
screen reader**, a separate audio channel from the Discord-plus-TTS channel that is already
contended. Answering a question through Claude costs nothing from the budget that matters
during play.

## Why not the existing foundry-mcp bridge

| | foundry-mcp-bridge 0.8.4 | quickmenu |
|---|---|---|
| access gate | **GM-only**, two hard checks (`onReady` + `startBridge`) | runs for any user |
| settings scope | **19/19 world-scope** | **11/11 client-scope** |
| tool surface | ~50 GM tools, incl. an **ungated `switchScene`** | only what Josh can already do |

Using the bridge would require giving Josh **Assistant GM** — core defines `isGM` as
`role >= ASSISTANT` — and core grants `isGM` users `OWNER` on every document
(`if (user.isGM) level = perms.OWNER`), i.e. every GM-only journal and secret in the
campaign. Its world-scoped settings also mean one shared configuration for everyone, so
Josh could not be configured independently of the GM.

Quickmenu inverts both properties: client-scoped settings mean Josh configures his own
conduit with no GM involvement, and running as his own user means **Foundry's permission
layer is the security boundary** rather than a module allowlist we would have to get right.
**Josh stays role 1 (Player).**

## Transport

Browsers cannot listen, so the **helper listens** on `127.0.0.1:<port>` and the browser
connects out.

Plain `ws://` to a loopback host **is permitted from an HTTPS page** — loopback is a
"potentially trustworthy" origin, exempt from mixed-content blocking. Verified empirically
from an `https://` origin:

| target | result |
|---|---|
| `ws://localhost:31415` | allowed; connection attempted |
| `ws://192.168.1.200:31415` | `SecurityError: An insecure WebSocket connection may not be initiated from a page loaded over HTTPS` |
| `ws://example.org:31415` | same `SecurityError` |

Upstream foundry-mcp-bridge 0.8.4 relies on the same behaviour (its issue #74), using this
loopback set, which we reuse verbatim:

```js
const isLoopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(host);
```

So no VPN, no relay, and no TLS certificate is required.

**Open risk — Safari.** The test above was Chromium. VoiceOver users often pair with
Safari, historically stricter about the loopback exemption. **Verifying this in Josh's
actual browser is implementation step 1**, before anything else is built. If his browser
denies it, we fall back to a relay on the NAS behind Traefik (`wss://`, real Let's Encrypt
cert) behind the same `AgentBridge` interface — a config change, not a redesign.

## Lifecycle

Claude Desktop **spawns the helper over stdio**, so the helper process — and therefore the
ws listener the browser connects to — exists only while Claude Desktop is running. Two
consequences the implementation must handle explicitly rather than leave to chance:

- **Claude Desktop closed:** nothing is listening, so `AgentBridge` must sit in backoff
  retry without logging noise or erroring in Foundry, and reconnect silently when the
  helper reappears.
- **Foundry tab closed or reloaded:** the helper keeps running with no peer. Tools must
  return "Foundry tab not connected" rather than hanging until timeout.
- **Claude Desktop restarted while Foundry stays open:** a fresh helper binds the port and
  the browser reconnects on its own. This is the common case and must need no user action.

The `describe` tool takes a name argument and resolves it through the same resolver as the
chat front-end, so misspellings produce the same did-you-mean behaviour. The wire protocol
(message envelope, request/response correlation, error shape) is owned solely by
`AgentSchema.js`; neither the helper nor `AgentBridge` defines message shapes inline.

## GM presence — what works when Josh plays alone

Measured against f1/Shackles. **Only one user has `isGM` ("GM Toby", role 4)** — there is no
Assistant GM, so `game.users.activeGM` is `null` whenever Tobias is offline
(`get activeGM() { return this.getDesignatedUser(u => u.active && u.isGM); }`).

**Works with no GM online** — because quickmenu has *zero* GM dependency. A grep of all of
`scripts/` for `isGM`, `activeGM` and `socketlib` returns nothing; every action runs as the
acting user. Same for `folkens-auto-buff-pf1`, which gates on `actor.isOwner`, not on a GM
broker. So: skill/save/ability rolls, attacks, spell casts, item use, reading the sheet, and
buff toggles on Ser Toche (he is OWNER) all function with Josh alone.

**Silently degrades with no GM online.** This is the dangerous class, because it produces no
error and no notification — it just does nothing, which a blind player cannot detect. pf1
guards seven paths with `game.users.activeGM?.isSelf` and returns early when absent:
currency transfers between actors, the auto-save prompt on certain buff creation, and
combat skipped-turn handling. Global pause is similar — `togglePause` only broadcasts
`if (options.broadcast && game.user.isGM)`, so a player toggling pause changes it locally
only and the world stays paused for everyone else.

**Design consequence:** the conduit MUST surface GM presence rather than let these fail
silently. `get_character` and `get_combat_state` both return a `gm_online` boolean, and
`execute_action` includes it in its result. That lets Claude say "no GM is online, so that
currency transfer will not take effect" instead of reporting a success that did not happen —
the same principle as auto-buff reporting `skipped-ownership` rather than a false success.

Josh's measured visibility in Shackles, which is the conduit's entire reachable surface:

| permission | count | which |
|---|---|---|
| OWNER | 4 | **Ser Toche** (his PC), PC BOx, Whale Killing Ship, Kill Steal |
| OBSERVER | 11 | the other party PCs, plus Imp and Slobber Devil |
| LIMITED | 2 | |
| NONE | **311** | every NPC and monster |

Foundry's permission layer therefore delivers the scoping for free — no module-side
allowlist, and no spoiler surface.

## Security

The loopback exemption cuts both ways: **any website Josh visits can open
`ws://localhost:<port>`**, with no origin restriction by default. Three controls, all
required:

1. **Loopback bind only** — `127.0.0.1`, never `0.0.0.0`. The existing foundry-mcp
   companion binds `0.0.0.0`, needlessly exposing itself to the LAN. Do not copy that.
2. **Origin allowlist** — reject any socket whose `Origin` is not Josh's configured
   Foundry origin.
3. **Shared token** — held in a client-scoped setting, sent on connect.

**Port:** default **31416**, deliberately *not* 31415, so it can never collide with the
foundry-mcp companion on either machine.

**Actor scoping:** resolve `game.user.character`, falling back to actors Josh owns. A
request naming an actor he does not own returns a structured refusal rather than letting
Foundry throw — Claude needs an error it can read aloud, not a stack trace.

## Architecture

```
Claude Desktop (Josh's Mac)
      |  stdio (MCP)
      v
mcp-helper/            <- ships in THIS repo; listens on 127.0.0.1:31416
      ^  plain ws://  (loopback exemption; origin + token checked)
      |
Josh's Foundry tab -- scripts/agent/AgentBridge.js   (4th front-end)
      |-- CharacterDataExtractor   -> reads
      +-- ActionExecutor.execute() -> writes (phase 2)
      |
      v  Foundry socket, as JOSH'S OWN USER
Foundry server (f1) -- enforces player permissions natively
```

`AgentBridge` is a sibling of `ChatCommandInterceptor` and takes the same two collaborators
(`resolver`, `executor`). The governing rule: **the agent front-end invents nothing.** It
exposes only what `AbbreviationResolver` and `ActionExecutor` already know, so all four
front-ends stay in lockstep and any future command appears in all of them at once — the
module's existing discipline, not a new pattern.

## Components

| path | purpose |
|---|---|
| `scripts/agent/AgentBridge.js` | ws client: handshake, dispatch, backoff reconnect |
| `scripts/agent/AgentSchema.js` | the read/action contract, in one place |
| `mcp-helper/index.mjs` | node MCP server: stdio to ws, plus `--selftest` |
| `mcp-helper/package.json`, `mcp-helper/README.md` | install + human-facing notes |
| `docs/JOSH-CLAUDE-SETUP.md` | agent-readable setup instructions |
| `scripts/module.js` | +4 client settings (below) |

New client-scoped settings: `agentEnabled` (default **off**), `agentPort` (31416),
`agentToken`, `agentAllowWrites` (default **off**).

## Tool surface

**Phase 1 — read**

| tool | returns |
|---|---|
| `get_character` | HP, AC/touch/flat-footed, saves, abilities, speed, initiative |
| `list_actions` | the `/scan` inventory **with each chat abbreviation** |
| `get_spells` | spellbook, levels, prepared counts, slots remaining |
| `get_buffs` / `get_conditions` | what is active now, and what is available |
| `get_items` | inventory including consumable charges |
| `describe` | full enriched text of a named spell/feat/item |
| `get_combat_state` | round, whose turn, Josh's initiative slot |

`list_actions` returning abbreviations is the highest-value tool: it lets Claude answer
"type `/3hast`", making it a teacher for the interface Josh already has rather than a
replacement for it.

**Phase 2 — write** (behind `agentAllowWrites`, default off)

One tool, not twenty: `execute_action(name)` takes the same string the chat front-end
resolves and calls `ActionExecutor.execute()`. Because the resolver already maps names to
actions, this single tool covers every current *and future* action — adding `/eq` or
`/prep` later needs no agent-side change.

## Error handling

- **Browser side:** backoff reconnect; never throw into Foundry's hook chain.
- **Helper side:** every tool returns a structured error, never a raw exception.
- **Port in use:** exit with a readable message naming the stale PID. The foundry-mcp
  companion has produced this zombie state twice; fail loudly rather than silently.
- **No browser attached:** report "Foundry tab not connected" distinctly from "helper not
  running", because the remedies differ.

## Testing

- **Unit (node, no Foundry):** schema validation, action-name resolution, actor scoping —
  the same pure-function pattern that worked for `folkens-auto-buff-pf1` 1.3.0.
- **Helper `--selftest`:** verifies it can bind and reports state without Foundry.
- **Manual:** f1 only; Josh's own browser; Safari-vs-Chrome check first.

## Out of scope (YAGNI)

No GM tools. No world mutation, scene control, or access to actors Josh does not own. No
relay unless Safari forces it. No voice input — quickmenu's planned STT is a separate
front-end that will ride the same `ActionExecutor`.

## Accessibility constraints

Responses are consumed by a screen reader during play. Keep them short and name-first;
verbosity belongs behind an explicit request. The audio channel is contended — every string
is a withdrawal from a shared budget.
