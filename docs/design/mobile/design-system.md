# Proliferate Mobile — Liquid Glass Design System

**Target:** native iOS app (Expo / React Native), iOS 26 with Apple's Liquid Glass material; graceful fallback to iOS 17–18.
**Backend:** cloud-only — `https://proliferate.theitdept.au`. Agents run in remote sandbox pods.
**Design thesis:** *mission control, pocket-sized.* Proliferate mobile exists to steer and unblock cloud agents from anywhere. The interface is a calm charcoal instrument panel: glass for the control layer, ink for the work. Monospace is a first-class material — branches, commands, terminal output, and diffs are the product's native vernacular, and the design treats them with the same care most apps reserve for photography.

---

## 1. The two-layer model (from the iOS 26 HIG)

Liquid Glass is a *material for controls and navigation*, not for content. Every screen is built as exactly two layers:

| Layer | What lives there | Material |
|---|---|---|
| **Content layer** | transcripts, terminal output, diffs, lists, cards, sheets' body content | Opaque surfaces (`bg`, `surface`, `card` tokens) |
| **Glass layer** | tab bar, navigation bars, toolbars, the composer dock, floating action buttons, sheet *chrome* (grabber + header), context capsules, segmented controls | `GlassSurface` |

**Hard rules** (derived from the HIG, enforced by lint on the `GlassSurface` component):

1. Glass floats **above** content; content scrolls under it edge-to-edge. Never put glass *inside* scrolling content.
2. **Never stack glass on glass.** A control sitting on a glass bar renders as vibrancy/plain, not as another glass element. `GlassSurface` may not be a descendant of `GlassSurface` (dev-mode invariant).
3. Never use glass behind **dense body content** — no glass transcript bubbles, no glass diff rows, no glass terminal background. Legibility of code and prose always wins.
4. Glass implies interactivity. Decorative glass is forbidden; if it isn't a control or a container of controls, it isn't glass.
5. Limit each screen to the *fewest* glass elements that do the job — typically: one bar top, one dock/tab bar bottom, at most one floating control.

### Regular vs. Clear glass

- **`regular`** (default, 95% of usage): adaptive glass that manages its own contrast — used for tab bar, nav bars, composer dock, sheets' chrome, pills.
- **`clear`** — more transparent, no adaptive scrim. Only permitted over media-like content that carries its own dimming. In Proliferate the *only* approved use is the floating scroll-to-bottom / interrupt controls over the terminal's black field.

---

## 2. Color tokens

The brand is a near-monochrome charcoal system (from `@proliferate/design` `tokens.ts`). Dark is the brand-primary theme; light is a derived paper theme. All tokens ship in both themes; components never hard-code hex.

### 2.1 Core palette

| Token | Dark | Light | Use |
|---|---|---|---|
| `bg` | `#181818` | `#F5F5F7` | screen background (content layer base) |
| `surface` | `#1D1D1D` | `#FFFFFF` | grouped-list background, inset panels |
| `card` | `#212121` | `#FFFFFF` | cards, rows |
| `cardRaised` | `#262626` | `#FFFFFF` + shadow | popovers, menus (opaque, never glass) |
| `ink` / `fg` | `#FFFFFF` | `#1A1A1A` | primary text |
| `inkSecondary` | `rgba(255,255,255,0.71)` | `rgba(26,26,26,0.72)` | secondary text |
| `inkTertiary` | `rgba(255,255,255,0.50)` | `rgba(26,26,26,0.48)` | captions, timestamps |
| `separator` | `rgba(255,255,255,0.084)` | `rgba(0,0,0,0.09)` | hairlines |
| `separatorHeavy` | `rgba(255,255,255,0.14)` | `rgba(0,0,0,0.16)` | input borders, focus |
| `fill` | `rgba(255,255,255,0.05)` | `rgba(0,0,0,0.04)` | pressed states, subtle chips |
| `terminalBg` | `#0C0C0D` | `#0C0C0D` | terminal + diff code field — **always dark in both themes** |

### 2.2 Tint & semantic

| Token | Dark | Light | Use |
|---|---|---|---|
| `tint` (Proliferate Blue) | `#339CFF` | `#0A7AFF` | interactive accents, links, selected tab, focused controls, PR/branch affordances |
| `primaryAction` | `#FFFFFF` on `#181818` | `#1A1A1A` on white | the *one* main CTA per screen (Start, Send, Approve fallback) — brand ink-on-paper button, not tinted |
| `success` | `#40C977` | `#1FA85C` | running/ready/merged states, "Allow" |
| `successSubtle` | `rgba(64,201,119,0.14)` | `rgba(31,168,92,0.12)` | status pill fills |
| `warning` | `#F2C94C` | `#B8860B` | needs-attention, pending approval, paused, access-loss |
| `warningSubtle` | `rgba(242,201,76,0.14)` | `rgba(184,134,11,0.12)` | |
| `danger` | `#FA423E` | `#E0302C` | failures, destructive actions, "Reject" |
| `dangerSubtle` | `rgba(250,66,62,0.12)` | `rgba(224,48,44,0.10)` | |
| `diffAdd` / `diffAddBg` | `#40C977` / `rgba(64,201,119,0.10)` | same (on `terminalBg`) | added lines |
| `diffDel` / `diffDelBg` | `#FA423E` / `rgba(250,66,62,0.10)` | same (on `terminalBg`) | removed lines |
| `prMerged` | `#A78BFA` | `#7C5CE0` | Merged PR badge (matches web `bg-pr-merged`) |

### 2.3 Status vocabulary (single source of truth)

Every workspace/session status maps to one of five tones. The **status dot** is the recurring signature mark of the app (8 pt dot; hollow ring = not yet claimed/provisioned).

| Tone | Color | Dot | Statuses |
|---|---|---|---|
| `live` | `success` | filled, **breathing** (1.6 s opacity 0.6→1.0 loop; static under Reduce Motion) | `running`, session actively streaming |
| `ready` | `success` | filled, static | `ready`, `idle` (commandable) |
| `attention` | `warning` | filled + badge | pending permission / question / elicitation, `paused`, access-loss |
| `busy` | `tint` | filled, spinner ring | `provisioning`, `starting`, `waking`, `resuming` |
| `stopped` | `inkTertiary` | hollow | `archived`, `ended`, `completed`, `stopped`, unclaimed |
| `failed` | `danger` | filled | `failed`, `error`, `failed_delivery` |

---

## 3. `GlassSurface` — the one glass component

All Liquid Glass in the app renders through a single component so the fallback ladder, accessibility behavior, and lint rules live in one place.

```tsx
<GlassSurface
  role="bar" | "dock" | "tabbar" | "sheetChrome" | "pill" | "floating" | "segmented"
  variant="regular" | "clear"        // clear: allowlisted call-sites only
  tint="none" | "accent" | "danger"  // tinted glass: max ONE per screen
  shape="capsule" | "rect"           // rect uses concentric radius (see §6)
  interactive                         // enables press shimmer/morph on iOS 26
>
```

### 3.1 Resolution ladder (per render, per call-site)

| # | Condition | Render |
|---|---|---|
| 1 | iOS 26+, `expo-glass-effect` `isLiquidGlassAvailable()` → true, Reduce Transparency **off** | Native `GlassView` (`UIGlassEffect` / SwiftUI `.glassEffect`); sibling glass controls wrapped in one `GlassContainer` so they morph/merge during transitions |
| 2 | iOS 17–18 (or glass unavailable), Reduce Transparency off | `expo-blur` `BlurView` — `systemChromeMaterialDark` / `systemChromeMaterial` (light), intensity 100, plus 1 px top hairline `separator` and the same shape/radius. No specular edge, no morph — it's a quiet approximation, not an imitation |
| 3 | Reduce Transparency **on** (any OS) | Opaque `surfaceElevated` (dark `#202020` at 98% flat; light `#FBFBFD`) + hairline border. Zero blur |
| 4 | Increase Contrast **on** | Whatever tier above is active gains a full-perimeter `separatorHeavy` border and text drops vibrancy for solid `ink` |

The ladder is decided by capability + `AccessibilityInfo.isReduceTransparencyEnabled()` / `prefersCrossFadeTransitions`, re-evaluated on the corresponding change events.

### 3.2 Where glass is used (complete allowlist)

| Surface | Role | Notes |
|---|---|---|
| Tab bar | `tabbar` | System native tabs (`expo-router` native tabs) so we inherit iOS 26 minimize-on-scroll and the search tab behavior for free |
| Navigation bars / workspace header | `bar` | Large-title collapses to inline; content scrolls under with the system scroll-edge effect (hard edge on terminal/diff screens, soft elsewhere) |
| **Context capsule** (signature) | `pill` | `repo · branch` in SF Mono + status dot, centered in the workspace header; tap opens the workspace switcher sheet |
| Composer dock (chat) | `dock` | Floating capsule-rect above keyboard/tab bar; morphs into the send button on submit (iOS 26 only) |
| Segmented control (workspace shell: Sessions / Chat / Terminal / Changes) | `segmented` | One glass capsule containing four segments; selected segment is a solid `ink` lozenge sliding within the glass |
| Sheet chrome | `sheetChrome` | Grabber + header row of every sheet; sheet *body* is opaque `surface` |
| Floating controls | `floating` | Scroll-to-bottom (chat), keyboard accessory (terminal: ⌃ ⌥ ⇥ esc arrows), "New workspace" FAB on Workspaces |
| Lock-screen actions | n/a | Push notification actions render in system glass automatically |

**Tinted glass budget:** at most one `tint="accent"` element per screen (e.g. the send button when the draft is non-empty). `tint="danger"` only inside destructive confirmation sheets.

### 3.3 Text and symbols on glass

Text/icons on glass never use raw grays — they use vibrancy styles: `labelOnGlass` (primary), `secondaryOnGlass`, disabled at 35%. Minimum contrast 4.5:1 against the glass's adaptive backdrop is validated in both themes at the two extremes (empty scroll = `bg` behind glass; busy content behind glass). Under fallback tiers 3–4 these resolve to plain `ink`/`inkSecondary`.

---

## 4. Elevation

Only three levels. Depth comes from the glass/content split, not from stacked shadows.

| Level | Shadow (dark) | Shadow (light) | Use |
|---|---|---|---|
| `flat` | none | none | rows, list cards |
| `raised` | `0 1px 2px rgba(0,0,0,0.24)` | `0 1px 3px rgba(0,0,0,0.10)` | opaque popovers/menus |
| `floating` | `0 10px 30px rgba(0,0,0,0.42)` | `0 10px 30px rgba(0,0,0,0.16)` | glass docks, FABs, sheets |

Glass elements additionally carry their material's built-in edge highlight on iOS 26; the fallback tiers substitute the hairline border — never fake the specular edge with CSS-style gradients in production.

## 5. Typography

**SF Pro** (system) for UI; **SF Mono** for everything git/agent/terminal. All roles map to Dynamic Type text styles and scale with the user's setting (terminal/diff have a separate in-screen size stepper instead, clamped 11–17 pt).

| Role | Face / size / weight | Dynamic Type style | Use |
|---|---|---|---|
| `largeTitle` | SF Pro 34 bold | Large Title | Home greeting, tab roots |
| `title2` | SF Pro 22 bold | Title 2 | sheet titles |
| `headline` | SF Pro 17 semibold | Headline | card titles, workspace names |
| `body` | SF Pro 17 regular | Body | chat prose, settings rows |
| `subhead` | SF Pro 15 regular | Subheadline | secondary rows, transcript meta |
| `footnote` | SF Pro 13 regular | Footnote | timestamps, helper text |
| `caption` | SF Pro 12 medium | Caption 1 | status pills, badges |
| `eyebrow` | SF Pro 12 semibold, +0.6 tracking, uppercase | Caption 1 | section labels ("PENDING", "SESSIONS") |
| `monoBody` | SF Mono 13 regular | (stepper) | terminal output |
| `monoDiff` | SF Mono 12.5 regular | (stepper) | diff lines |
| `monoMeta` | SF Mono 12 medium | Caption 1 | branch names, commands, tool-call args, cron expressions |
| `monoPill` | SF Mono 11.5 medium | Caption 2 | context capsule, SHA/PR chips |

**Rule:** any string that is copy-pasteable into a shell or git (`branch`, `owner/repo`, command, path, SHA, cron) renders in SF Mono, no exceptions. This is the most recognizable trait of the app's voice.

## 6. Spacing, shape, and concentric rounding

Base grid 4 pt: `4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48`. Screen gutter 20 pt; list card padding 16 pt; row min-height 44 pt (hit target floor).

**Concentric radius rule (iOS 26):** nested corners share a center — `innerRadius = outerRadius − inset`. Fixed radii:

| Shape | Radius |
|---|---|
| Capsule (pills, buttons, dock, segmented) | height / 2 |
| Sheet | top 38 (device concentric) |
| Card | 22 (compact 20) |
| Inner block inside a card at 12 pt inset | 10 (= 22 − 12) |
| Terminal/diff code field | 16 |
| Approval/question cards | 22, options 12 |

## 7. Iconography

SF Symbols exclusively, default weight matching text weight, hierarchical rendering on content, monochrome + vibrancy on glass. Core vocabulary: `sparkles` (agent), `shippingbox` (workspace), `arrow.triangle.branch` (branch), `terminal` (PTY), `plusminus` (diff — custom fallback `±`), `bolt.badge.clock` (automation), `person.badge.key` (agent auth), `bell.badge` (pending interaction), `checkmark.seal` (approved), `xmark.seal` (rejected).

## 8. Motion

| Moment | Behavior |
|---|---|
| Glass morph | iOS 26 native only: composer ⇄ send button, FAB ⇄ sheet, segmented lozenge slide. Never re-implemented on fallback tiers |
| Status dot `live` | 1.6 s opacity breathe |
| Transcript arrival | 180 ms fade + 8 pt rise, one item at a time |
| Approval resolved | card collapses to a `checkmark.seal`/`xmark.seal` chip in 240 ms |
| Terminal output | no animation — raw append, instant |
| Sheet present | system spring |

Timing tokens from brand: `fast 120 ms`, `normal 180 ms`, `slow 240 ms`. **Reduce Motion:** all of the above become cross-fades; breathing dots freeze at full opacity; glass morphs become instant swaps.

## 9. Accessibility

- **Reduce Transparency** → `GlassSurface` tier 3 (opaque). The app must be fully legible with zero blur; screenshots of tier 3 are part of design review.
- **Increase Contrast** → tier 4 borders; vibrancy text → solid; status tones swap to their high-contrast variants (light-theme values from §2.2 are already AA on their fills).
- **Dynamic Type** → all SF Pro roles scale; layouts tested at AX3. Terminal/diff opt out with their own stepper (documented in-screen).
- **VoiceOver** → status dots always paired with text or `accessibilityLabel` ("Running", "Needs approval"); approval cards read as: tool name, command, then options as buttons; the context capsule reads "repo x, branch y, status z".
- **Hit targets** ≥ 44×44 pt including all pills and terminal accessory keys.
- Color is never the only channel: every tone pairs with a label or symbol (e.g. `+`/`−` gutter glyphs in diffs, not just green/red).

## 10. Component recipes (content layer)

- **Workspace card:** 22 pt-radius `card`; leading 40 pt icon tile (source kind: web/desktop/slack/automation) with status dot at its corner; headline title + `monoMeta` `repo · branch`; trailing relative time; optional preview line (`subhead`, 2-line clamp); attention cards gain a 3 pt `warning` leading accent bar. Swipe actions: Archive (left), Wake/Stop (right). Long-press context menu for management.
- **Transcript:** user prompts right-aligned in `fill` bubbles (max 86% width); agent prose full-width, no bubble; tool calls as compact `monoMeta` rows with disclosure into the tool sheet; todo tracker as a pinned collapsible card; reasoning collapsed under an eyebrow chip.
- **Interaction card shell (mirrors web `ComposerAttachedPanel`):** every agent interaction — permission request, question, MCP elicitation, tasks/todo panel — sits on one card recipe: leading icon + title + optional context ("1 of 2", server name) + collapse toggle; footer with secondary actions left, primary right (`ComposerCardFooter`). Option rows share one component (mirrors `ComposerOptionRow`); on mobile the 1–9 hotkeys become plain tap targets.
- **Approval card (the hero moment):** interaction shell, `warning` accent bar; title **"Permission request"**; the request body as a wrapping mono snippet on `terminalBg` (max-height, scrollable); options are the harness-provided `{optionId, label, kind}` rows — allow-kinds filled `success` tint, kinds starting `reject`/`deny`/`cancel` in `dangerSubtle`. Fallback when no options: "Allow" / "Deny". Fully operable from the notification's deep link.
- **Question card (web `UserInputCard`):** interaction shell, `tint` accent bar; wizard over questions with "{i} of {n}" context; option rows with label + description; synthetic last row "None of the above — Write a custom answer" opening a free-text field (secure field when `isSecret`); footer: "Cancel" / "Back" / "Next" / "Submit".
- **MCP elicitation card:** same shell; URL mode shows "Destination: {url}" with "Reveal URL" / "Decline" / "Accept"; form mode renders typed fields (boolean, single/multi select, number, text) with required markers.
- **Terminal:** full-bleed `terminalBg`; `monoBody` output; glass keyboard accessory row (`⌃ ⌥ ⇥ esc ↑ ↓ ← →`); hard-edge scroll under the header; status line (PTY id, cols×rows) in `monoMeta` at 50% ink.
- **Diff viewer:** file list rows with `+n −m` counts in mono (`diffAdd`/`diffDel`); unified diff on `terminalBg` with gutter glyphs; hunk headers in `tint`; PR status chip (Draft/Open/Merged/Failed checks) as a capsule.

---
*Grounding: Apple HIG "Materials — Liquid Glass" (iOS 26), "Adopting Liquid Glass"; `expo-glass-effect` (`GlassView`, `GlassContainer`, `isLiquidGlassAvailable`); brand tokens from `apps/packages/design/src/tokens.ts`.*
