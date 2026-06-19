# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A client-only web app that turns Caroline Myss's archetype work into a three-stage
interactive self-reading. Runs entirely in the browser — no backend, no accounts, no
persistence (a refresh restarts the reading). Cards are text-only but the `Card`
component is art-ready (`Archetype.image`).

## Commands

```bash
npm run dev      # Vite dev server on http://localhost:5173
npm run build    # tsc -b && vite build (type-check + production bundle)
npm run extract  # regenerate src/data/archetypes.ts from scripts/deck.json (node, no deps)
npm test         # Playwright smoke test, both viewport projects

# single project / single test
npx playwright test --project=desktop
npx playwright test -g "full reading flow"
```

There is no separate lint step; `npm run build` (via `tsc`) is the type gate. `strict`,
`noUnusedLocals`, and `noUnusedParameters` are on, so unused imports/vars fail the build.

The Playwright config starts the dev server itself (`reuseExistingServer: true`), so
tests work whether or not a dev server is already running. The `mobile` project runs
Chromium at a 390×844 touch viewport (not WebKit) to avoid an extra browser download.

## Architecture

**Four-stage state machine.** `src/App.tsx` holds a single discriminated-union `Stage`
state and routes between stages; there is no router. The flow and the data that passes
between stages:

1. **Swipe** (`StageLayout` + `SwipeStack`) — the full shuffled deck of ~74 archetypes.
   Right = "this is me". Produces a kept pile (right) and a rejected pile (left).
2. **Shadow** (`SwipeStack` again, `stage: 'shadow'`) — a second pass over the *rejected*
   pile, framed as confronting reluctance/denial. Right = reclaim ("this is me too"). It
   has a Skip control ("I'm done looking") that finishes early with progress so far.
   Reclaimed cards merge into the kept pile. Skipped if the rejected pile is empty.
3. **Filter** (`FilterStage`) — only entered when the combined pile is >8. Each round sorts
   cards into Innate (keep) vs Adaptive (drop) and repeats on the survivors until ≤8.
   See convergence rules below.
4. **Roundtable** (`Roundtable`) — the final ≤8 cards, free-dragged around a table with a
   fixed "You" node; exported as PNG.

Routing (`route()` in App.tsx, applied after Stage 1 and again after Shadow): 0 kept →
`empty` screen; ≤8 kept → skip Filter and go straight to Roundtable; >8 kept → Filter.
Reclaimed shadow cards are **not** visually distinguished afterward — once merged they are
ordinary kept cards.

**Manual mapping mode** (`stage: 'mapping'`, entered from the intro's "Done in person?"
button): an empty, editable Roundtable for transcribing a reading done with the physical
deck. `MappingStage` (in App.tsx) owns the cards; `Roundtable`'s `editable` prop switches
on the search-to-seat bar (`ArchetypeSearch`, Enter seats the first match) and per-card ×
remove controls (hover on desktop, tap-toggle on touch; suppressed during PNG export).
New cards drop into the first uncrowded slot scanning outer orbits inward (`findFreeSlot`);
there is **no card cap** (a gentle note appears past 12). The orbit/stack/alliance model
(above) is shared with the guided flow — the only differences are seat editability and the
in-person AI-prompt framing (`buildPrompt`'s `manual` flag, which omits all journey/
shadow-reclaim language).

**One swipe primitive, reused.** `SwipeStack` is a generic binary-swipe component
(configurable `left`/`right` `SwipeSide`s) used by *both* Stage 1 and Stage 2. Because of
this, the two stages render identical-looking UI and both show an "N left" counter — do
not try to distinguish them by on-screen text (the Playwright test learned this the hard
way and drives stages by exact card counts instead). Gestures and the roundtable drag are
both powered by **framer-motion** (`drag` + `onDragEnd`); there is no separate
swipe/DnD library. `SwipeStack` keeps a `history` ref of decisions so the "Undo last card"
button can reverse the most recent swipe (pops the card off its pile, decrements the index,
replays it sliding back in) — this works for both stages for free.

**Filter convergence** (`FilterStage.tsx`, `TARGET = 8`): after each round, survivors
(= Innate pile) determine the next phase — `>8` → interstitial → another round; `===8` →
done; `<8` → `RescuePhase`, where the seeker can pull dropped cards back up to 8 (or
proceed with fewer). A round that keeps everything is flagged `noProgress` and nudges the
user to be stricter.

**Roundtable model** (`Roundtable.tsx`): meaning is made **explicit and discrete** rather
than inferred from free pixels — this is the structural heart of the feature, used
identically by the guided flow and manual mapping. A seat's canonical state is
`{ ring, phi }`: a discrete orbit tier (ring 0 = innermost / strongest identification → 3 =
outer rim) and an angle. Three discrete structures:
- **Orbits**: four rings; `onDragEnd` snaps the seat to the nearest ring + a free `phi`
  (clamped to that ring's `max`). `posOf`/`pointToRingPhi` project between `{ring,phi}` and
  table-%.
- **Stacks**: releasing a seat over the **centre band** of another merges it beneath (the
  target stays primary — `cards[0]`). Tapping a non-primary card promotes it. A stack is one
  seat (one `[data-token-id]`, N `[data-card-id]`), modeling "derivatives that fuel the top".
- **Alliances**: releasing over a target's **left/right edge third** snaps the seat beside it
  (same ring) and records an undirected edge in `edges`; a gold diamond marks the midpoint.
  Settling onto an orbit elsewhere dissolves the seat's alliances.

**Layout tabs** (`LAYOUTS`): the same `{ring,phi}` reading is *projected* three ways,
chosen by tabs above the table — **Round Table** (default; full concentric circles, `You`
seated at the bottom rim, core toward the centre), **Wheel** (`You` at the centre, rings
360° around), and **Fan** (the legacy upward arcs, `You` at the foot). Each `Layout` carries
its `center`, `you`, per-ring `{r,max}` (`max = π` = full circle), `shape` (`circle|arc`),
and a `howTo` blurb. Switching tabs keeps every seat/edge and re-projects — only the
`center`/`you`/`max` change, so stacks and alliances are untouched (wide circle angles just
re-clamp into the Fan's narrower arcs).
- **Stacks**: releasing a seat over the **centre band** of another merges it beneath (the
  target stays primary — `cards[0]`). Tapping a non-primary card promotes it. A stack is one
  seat (one `[data-token-id]`, N `[data-card-id]`), modeling "derivatives that fuel the top".
- **Alliances**: releasing over a target's **left/right edge third** snaps the seat beside it
  (same ring) and records an undirected edge in `edges`; a gold diamond marks the midpoint.
  Settling onto an orbit elsewhere dissolves the seat's alliances.

`computeIntent(pointer)` is the single source of truth for what a release will do — stack /
ally(side) / orbit(ring,phi) — computed against the active layout. It runs **live during the
drag** (`onDrag`, throttled by an intent-key) to drive `DragOverlay`'s four cues (stack glow,
alliance edge bar, brightened destination ring, dashed snap-ghost) **and** verbatim on
`onDragEnd` to commit, so the preview can never disagree with the act. The other seats' boxes
are snapshotted once in `dragCtx` at `onDragStart` (they don't move), so per-frame intent is
pure math — no layout thrash.

State is real React state (`seats`, `edges`) — not framer-motion internals — so there is no
DOM measurement at prompt time. Drag uses a controlled `x`/`y` motion value that is **zeroed
in `onDragEnd`** once the snapped `ring`/`phi` is committed (else the offset double-applies).
Export captures **only** `tableRef` (`lib/exportImage.ts` → html-to-image `toPng`); the
controls live outside it and are excluded by construction.

**AI prompt export** ("Copy AI prompt"): `buildPrompt` (`lib/buildPrompt.ts`) renders the
`seats`/`edges` directly — cards grouped by orbit (ring 1–4), stacks listing primary + the
derivatives beneath, and alliances as connected components of the edge list — each with the
deck's light/shadow lines, as a Jungian-analyst session prompt on the clipboard. No vector
math or tier estimation: the structure *is* the data. Cards reclaimed in the Shadow stage
are flagged (guided mode only); manual mode passes `manual:true` for in-person framing that
omits all journey/shadow language.

## Data pipeline

The deck is **hand-curated in `scripts/deck.json`** — an array of ~74 cards, each
`{ id, name, light, shadow }` where `light`/`shadow` are `Aspect`s
(`{ tag, line }`: a 1–3 word tag + a one-to-two-sentence definition). `scripts/build-archetypes.mjs`
(`npm run extract`) validates the deck (unique ids, both poles present) and writes it to
`src/data/archetypes.ts` — a typed `Archetype[]` the app imports at build time. It's a pure
Node JSON→TS transform: **no PDF, no python, no dependencies.** To change the deck (wording,
add/remove a card), edit `deck.json` and re-run `npm run extract`. **`archetypes.ts` is
generated — don't hand-edit the output.**

There is no family/category taxonomy — every card uses the single gold `ACCENT`
(`src/lib/accent.ts`).

(History: the deck was originally scraped from Myss's *Gallery of Archetypes* PDF via a
python/pypdf script; that was replaced once the content became a bespoke 74-card set with
refined definitions, split cards — Lover/Don Juan, Knight/Warrior — and several drops.)

## Styling

Tailwind CSS v4 via `@tailwindcss/vite` (no `tailwind.config.js`; theme tokens live in the
`@theme` block of `src/index.css`). The aesthetic is **gilded tarot**: warm lamp-black
grounds (`ink`/`panel`), gold-leaf accents (`gold`/`gold-bright`/`gold-dim`), ivory text,
and a recurring sun/moon duality — gold always means "claimed/innate", silver-ash means
"set aside/learned". Reusable pieces live in `index.css` (`.tarot-frame` double hairline
with corner dots, `.gold-foil` text, `.btn-gold`/`.btn-ghost`, `.rise` entrance) and
`StageLayout.OrnamentRule`. There are no per-card accent colors — everything reads gold
(`src/lib/accent.ts`'s `ACCENT`, matching the `gold*` theme tokens).
Fonts (Cinzel display caps, Cormorant Garamond card names, EB Garamond body) load from
Google Fonts in `index.html`.
