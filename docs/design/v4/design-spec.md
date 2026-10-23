# Hearthkeep simulator: design spec (v4)

## Visual direction: "Home Vitals"

**The home's upkeep shown the way a fitness app shows your health.** Each appliance gets an activity ring that fills from the day it was last serviced to the day it is next due. A full ring means "do it today". A ring that wraps past the top means overdue. The palette borrows from a sunny farmers' market on a weekday morning: oat-cream daylight, leaf green, lemon, tangerine and watermelon, all on warm white. Type is a lively, slightly quirky grotesque (Bricolage Grotesque) over a friendly geometric body face (Figtree). Shadows are soft and green-tinted, and corners are generous.

Why this direction, based on the feedback:

| Rejected | What the user said | What v4 does instead |
|---|---|---|
| v2: dark espresso, serif display, dotted mono labels | "Fits a literary project… we need livelier design elements, this is too steady" | Light, sunlit surfaces; no serif; colour carries the energy |
| v3: electric blue page, black hard-offset "brutalist" shadows, dashed chips | "Livelier, and in line with a healthy-lifestyle aesthetic" / "Still not right" | No saturated full-page colour field and no hard black shadows. Fresh produce colours sit on cream, the way a wellness or fitness app looks. Rings give it motion and vitality |

**The one memorable thing:** the vitals rings. They appear in the status card, in the welcome illustration and as small status marks, and they always encode real seed data: days since last done ÷ interval.

A second detail that comes from actually using the product: a **daylight arc** next to the big sim clock. It is a thin 6 AM to 6 PM arc with a sun dot at the current sim time, so "Next morning" visibly resets the sun.

---

## Layout (1440 × 900 desktop viewport)

```
y=0   ┌ Header row 1 (56): brand · connection/session · MCP · planner ···· sim clock ┐
y=56  │ Header row 2 (44): New session · Next morning · Reset demo ···· Trace Data Cards Voice · About │
y=112 ├──────────────────────────────────────────────┬──────────────────────┤
      │ Device frame: 12 px forest bezel + 1024×600   │ Side panel 324 wide  │
      │ screen (radius 40 outer / 28 inner)           │ (Trace or Data       │
      │ ┌ screen top bar 64: SIMULATION ribbon,       │  drawer)             │
      │ │ Fictional data chip ········ 9:00 AM + arc  │                      │
      │ ├ conversation 372 │ card stage 652           │                      │
y=736 ├──────────────────────────────────────────────┤                      │
y=748 │ Try: quick chips (40)                         │                      │
y=796 │ Input "Type what you'd say..." + Send (56)    │                      │
y=852 └──────────────────────────────────────────────┴──────────────────────┘
```

- Page gutter 24; frame to panel gap 20; frame block 1048 × 624.
- Screen grid: top bar 64; body 536 = conversation column 372 (padding 20/24) + card stage 652 (card 632 × ≤504).
- Under 900 px the card stage drops below the reply (PRD S3); cards keep a 320 px minimum width.
- The side panel is a single slot: Trace (S4) or Data drawer (S5). A toggle in header row 2 shows which is open.

## Design tokens

### Color
| Token | Value | Role |
|---|---|---|
| `--bg` | `#F3F5EA` | Page (oat-mint daylight) |
| `--surface` | `#FFFEF8` | Cards, panels, input |
| `--surface-2` | `#EAF1DE` | Sage tint: section wells, older turns, table stripes |
| `--screen` | `#FBFAF2` | Device screen |
| `--bezel` | `#17352A` | Device bezel; also the SIMULATION ribbon |
| `--ink` | `#14301F` | Primary text (forest ink, never pure black) |
| `--muted` | `#4F6353` | Secondary text (6.1:1 on surface) |
| `--faint` | `#7A8A7C` | Meta text ≥14 px bold only, or decoration |
| `--line` | `#D9E2CC` | Hairlines, borders |
| `--leaf` | `#1FA85B` | Brand fill: rings on track, speaking pulse, toggles on |
| `--leaf-ink` | `#0B7039` | Leaf text on light (5.6:1) |
| `--mint` | `#D5F3DF` | User bubbles, "within limit" fill, selected chip |
| `--accent` | `#FF6A2B` | Tangerine. **Single accent**, at most 2 uses per screen: the primary action (Start / Choose recommended / Confirm by voice) plus one highlight |
| `--lemon` | `#FFD43D` | "Due today" ring, code-awaited input, ribbon text |
| `--lemon-soft` | `#FFF3BF` | Due-today pill fill, lock-state input |
| `--berry` | `#EE4258` | Overdue ring, over-limit fill accents |
| `--berry-ink` | `#B3172F` | Overdue/over-limit text on light (6.0:1) |
| `--berry-soft` | `#FFE2E4` | Overdue / over-limit pill fill |
| `--code-bg` | `#16332A` | Raw JSON block in trace |

Semantics: overdue / over limit = berry; due today / awaiting code = lemon; on track / within limit / done = leaf; primary action = tangerine. Text on tangerine and lemon is always `--ink` (≥5:1). White text appears only on `--bezel`, `--ink` and `--code-bg`.

### Type
| Token | Value |
|---|---|
| `--font-display` | "Bricolage Grotesque", "Figtree", sans-serif. Weights 600/700/800, slight `wdth` 92 condensing on large numbers |
| `--font-body` | "Figtree", "Nunito", sans-serif. 400 / 500 / 600 |
| `--font-mono` | "JetBrains Mono", "IBM Plex Mono", monospace. Used only for IDs, protocol, trace |

| Role | Size / line-height / tracking |
|---|---|
| Clock display | 44 / 1 / -0.03em, display 700 |
| Welcome headline | 56 / 1.02 / -0.03em, display 800 |
| Latest reply (spoken) | 26 / 1.22 / -0.01em, display 600 |
| Card title (H2) | 24 / 1.15 / -0.01em, display 700 |
| Price display | 40 / 1 / -0.02em, display 700 |
| Card body (2 m rule) | **20 / 1.35 / 0** body. Card body text never goes below 20 |
| UI / panel body | 15 / 1.45 / 0 |
| Small / meta | 13 / 1.4 / 0.01em |
| Eyebrow caps | 12 / 1 / 0.08em, 600, uppercase |
| Mono | 12.5 / 1.5 / 0 |

### Spacing (4 px base)
`--s1 4 · --s2 8 · --s3 12 · --s4 16 · --s5 20 · --s6 24 · --s8 32 · --s10 40 · --s12 48`

### Radius
`--r-xs 8` (kbd, code) · `--r-sm 12` (inputs inside cards, small tiles) · `--r-md 20` (option tiles, panel sections) · `--r-lg 28` (cards, screen) · `--r-xl 40` (device bezel) · `--r-pill 999` (chips, buttons, badges)

### Shadow (soft, green-tinted, never hard offset)
- `--sh-1`: `0 1px 2px rgba(20,48,31,.06), 0 2px 8px -2px rgba(20,48,31,.08)`: chips, pills
- `--sh-2`: `0 1px 2px rgba(20,48,31,.05), 0 14px 32px -14px rgba(20,48,31,.22)`: cards, panel
- `--sh-3`: `0 30px 80px -20px rgba(20,48,31,.45)`: device frame, modal
- `--ring-focus`: `0 0 0 3px var(--surface), 0 0 0 5px var(--leaf-ink)`: every focusable element

### Motion
| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(.2,.8,.2,1)` | Entrances |
| `--ease-spring` | `cubic-bezier(.34,1.4,.64,1)` | Button press (scale .97 → 1), sticker pop |
| `--dur-fast` | 140 ms | Hover, press |
| `--dur-med` | 260 ms | Card enter (fade + 12 px rise), drawer slide |
| `--dur-ring` | 700 ms | Ring draw-in on card mount |
| Speaking pulse | 4 bars, scaleY .35 ↔ 1, 900 ms staggered | Only while the assistant speaks |

`prefers-reduced-motion: reduce` turns off the pulse (bars stay static at mid-height), the ring draw-in, card rises and sticker pops. Only opacity fades of 120 ms or less remain.

## Components

| Component | Spec |
|---|---|
| **Header pill** | Surface, 1 px line, pill, 32 h, 13 px. Status dot: leaf (connected), lemon pulsing (connecting), berry (unreachable) |
| **Header button** | 32 h pill, surface + line, 14 px 600, 16 px monoline icon. Press scales to .97 |
| **Toggle** | Pill with an inner 28 × 16 switch; on = leaf track + white knob; label 14 px 600 |
| **Unreachable banner** | Full-width berry-soft bar under the header: "Can't reach the home server" + Retry (ink button); `role="alert"` |
| **Device frame** | 12 px `--bezel` with a faint top highlight, radius 40, `--sh-3`; screen radius 28. No logos, no light ring |
| **SIMULATION ribbon** | Bezel-colour pill, lemon caps text "SIMULATION — not a real Alexa+ device", 12 px / 0.08em. Always visible |
| **Fictional data chip** | Leaf-ink text on mint, pill, small leaf icon. Present on the frame and on every card |
| **Clock + daylight arc** | 44 px time, AM in 18 px, date 15 px muted; 56 × 28 SVG arc (6 AM to 6 PM) with a lemon sun dot at sim time |
| **Turn (user)** | Right-aligned mint bubble, radius 20 / 6 corner, 17 px |
| **Turn (assistant, older)** | 17 px muted text, no bubble |
| **Turn (assistant, latest)** | "Hearthkeep · speaking" eyebrow with a leaf pulse, then 26 px display reply (≤ 2 sentences); lives in `aria-live="polite"` |
| **Code turn** | User bubble shows "••••" plus a lock glyph; never the digits |
| **Quick chips** | 40 h pill, surface, 15 px; the next suggested chip is mint with a leaf-ink border; used chips are faint with a check |
| **Input** | 56 h, radius 20, surface; placeholder "Type what you'd say..."; `Enter` kbd hint; Send = ink pill. **Lock state:** lemon-soft fill, lock icon, "Waiting for your purchase code", "digits show as ••••" |
| **Card shell** | Surface, radius 28, `--sh-2`, padding 24; header row: card name (eyebrow), card title (24 display), Fictional data chip at right |
| **Vitals ring** | 52 px SVG, 6 px stroke, rounded cap, track = surface-2. Fill = days since last done ÷ interval. Leaf below 100%, lemon at 100% (due today), berry with a darker overflow arc past 100% (overdue). Icon centred |
| **Date pill** | 20 px 600 pill: berry-soft/berry-ink "21 days overdue", lemon-soft/ink "Due today", surface-2/ink for dates |
| **Option tile (C2)** | Radius 20, 1.5 px line; recommended tile gets a mint wash, a tangerine "Recommended" sticker (rotated −4°, pops on mount; hangs 17 px above the top edge and tiles have 24 px top padding, so it never overlaps the title) and the tangerine Choose button; others get an ink-outline Choose. Arrow keys move between tiles, Enter chooses |
| **Badge** | 14 px 600 pill: OEM / Compatible = surface-2; Certified = mint + check; Over $60 limit = berry-soft + berry-ink, placed on every tile that is over the cap (each service slot), not once in the card header |
| **"Not shown" footer** | Surface-2 well, 20 px: "Not shown: Bargo ZX-28, not certified (your rules)" |
| **Checkout summary (C3)** | Line rows (20 px), total row (40 px display price), arrival or slot row with icon, limit meter (bar showing total vs $60 cap: leaf when within, berry overflow segment when over), "What to say" lemon-soft well with a quoted phrase, actions Confirm by voice (tangerine) + Cancel (outline). No code field, ever |
| **Trace turn** | Collapsible row: turn number chip, intent, tool count, status. Expanded: slots, guards (chips), plan steps (✓ done / ✕ failed / – skipped / ◌ waiting), MCP call rows (method, tool, HTTP, ms, session prefix, protocol), args with codes as `"[redacted]"`, raw JSON toggle → dark green code block. Collapsed turns are one line. Raw JSON is laid out at ≤ 34 characters per line and wraps (`pre-wrap`) inside the 324 px panel, so it is never clipped on the right |
| **Data drawer** | Tabs (pill segmented, wraps to 2 rows), banner "All data is fictional sample data", read-only rows (title + at most 2 sub-lines, so the Schedule tab shows all six appliances); no edit controls |

### States covered (spec; screens show the starred ones)
Connecting · Connected★ · Server unreachable banner · Briefing★ · All caught up (C1 empty: ring cluster fully leaf, "All caught up") · Options★ · Quote awaiting code★ · Over-limit quote awaiting approve + code★ · Wrong code ("That code didn't match. You have 2 tries left.", lock stays) · Receipt · Hazard (berry `role="alert"` banner across the screen, no card) · Cards off (stage hidden, reply unchanged).

## Screens

| File | PRD | Shows |
|---|---|---|
| `mockups/01-welcome.html` | S0 over S1 | First-run overlay: simulated Alexa+ household agent, real MCP server, data notice, Start; idle frame with "Try: What needs doing?" behind a scrim |
| `mockups/02-briefing.html` | F1, C1, S1–S3, S5 | Proactive morning briefing reply + C1 with vitals rings; Data drawer on the Schedule tab |
| `mockups/03-parts.html` | F2 step 1, C2, S5 | "Order a new filter for the fridge" → two tiles (Rillstone CX-28 recommended, Ferngate FG-WF2) + "Not shown: Bargo ZX-28…"; Data drawer on the Inventory tab (stock checked first) |
| `mockups/04-checkout.html` | F2 step 2, C3, S4 | "Yes, the CX-28" → C3 $24.99, Fri Oct 23, within the $60 limit, "Say your purchase code"; input locked; Trace open with `prepare_checkout` expanded and raw JSON |
| `mockups/05-booking.html` | F4, C2 → C3, S5 | Slot options (3, each tile badged "Over $60 limit") collapsed above C3 for S-1027A: $89.00, Tue Oct 27 9–11 AM, "Over your $60 limit by $29.00", "Say 'approve' and your code"; Data drawer on the Audit tab. F4 is shown from reset (PRD §10 flows run from reset; §6 IDs are sequential after reset), so its quote is `q_0001` |
| `mockups/index.html` | — | Links to all five |

All content follows prd.md §9–10 and qa.md F/G. The clock reads Wed, Oct 21, 2026 · 9:00 AM throughout, because the sim clock moves only via `/sim/clock`. Quotes therefore hold until 9:15 AM.
