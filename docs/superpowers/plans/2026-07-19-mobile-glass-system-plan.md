# Mobile Liquid Glass System — Implementation Plan (Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`.
> Design source of truth: `docs/design/mobile/design-system.md` + `mockups.html`. Read them first.

**Goal:** A reusable Liquid Glass layer in `@proliferate/design` that every mobile screen consumes: one `GlassSurface` primitive with a capability-guarded fallback ladder, plus tint/elevation/contrast tokens.

**Architecture:** `expo-glass-effect` `GlassView` (iOS 26) → `expo-blur` `BlurView` (iOS 17–25) → opaque surface (Reduce Transparency) → bordered surface (Increase Contrast). One `useGlassCapability()` hook resolves the active tier from `isGlassEffectAPIAvailable()` + `AccessibilityInfo`; `GlassSurface` renders the right backing. Tokens are plain objects (light/dark) — pure, unit-testable.

**Tech Stack:** Expo SDK 56, React Native 0.85, `expo-glass-effect`, `expo-blur`, `react-native` `AccessibilityInfo`. Tests: vitest (node env) for pure logic only (the repo has no RN-render test infra — do NOT add one).

## Global Constraints
- 4-tier ladder exactly as above; never `opacity:0` to hide glass; guard every glass mount with the capability hook.
- Glass is allowed ONLY on the control layer: tab bar, nav/large-title bars, toolbars, sheet chrome, floating controls (FABs), the composer dock. **Never** on transcript/terminal/diff body content (those stay opaque `#0C0C0D`/surface).
- Tokens: base charcoal `#181818` (dark) with a derived light theme; iOS tint `#339CFF`; SF Mono mandatory for any git/shell-addressable text (repo·branch capsule, terminal, paths). Copy exact values from `design-system.md`.
- Accessibility: honor Reduce Transparency (→ opaque) and Increase Contrast (→ 1px hairline border) as distinct tiers.

## File Structure
- `apps/packages/design/src/glass/tokens.ts` — glass/tint/elevation/contrast + typography/spacing tokens (light+dark).
- `apps/packages/design/src/glass/use-glass-capability.ts` — the tier resolver hook + a pure `resolveGlassTier(caps)` function.
- `apps/packages/design/src/glass/GlassSurface.tsx` — the component.
- `apps/packages/design/src/glass/ContextCapsule.tsx` — mono `repo · branch` + breathing status-dot primitive.
- `apps/packages/design/src/glass/index.ts` — exports.
- Tests co-located `*.test.ts` (pure logic only).

---

### Task 1: Glass tokens
**Files:** Create `glass/tokens.ts`, `glass/tokens.test.ts`.
**Interfaces (Produces):**
```ts
export type GlassTheme = "light" | "dark";
export interface GlassTokens {
  surface: { base: string; raised: string; body: string /* #0C0C0D */ };
  tint: string;            // #339CFF
  glassTint: { light: string; dark: string };  // rgba overlays over glass
  border: { hairline: string };
  text: { primary: string; secondary: string; mono: string };
  elevation: Record<"nav"|"tab"|"sheet"|"fab", number>;
  radius: Record<"sm"|"md"|"lg"|"capsule", number>;
  spacing: (n: number) => number;   // 4pt grid
}
export function glassTokens(theme: GlassTheme): GlassTokens;
```
- [ ] Write failing test asserting `glassTokens("dark").surface.base === "#181818"`, `tint === "#339CFF"`, body `#0C0C0D`, and that light differs from dark. Run `pnpm --filter @proliferate/design test` → FAIL.
- [ ] Implement `glassTokens` with the exact values from `design-system.md`. Run → PASS.
- [ ] Commit `feat(design): glass tokens`.

### Task 2: Capability tier resolver
**Files:** Create `glass/use-glass-capability.ts`, `glass/use-glass-capability.test.ts`.
**Interfaces (Produces):**
```ts
export type GlassTier = "native" | "blur" | "opaque" | "bordered";
export interface GlassCaps { glassApiAvailable: boolean; reduceTransparency: boolean; increaseContrast: boolean; }
export function resolveGlassTier(caps: GlassCaps): GlassTier;   // pure
export function useGlassCapability(): GlassTier;                // hook: isGlassEffectAPIAvailable() + AccessibilityInfo
```
- [ ] Failing test table: reduceTransparency→"opaque" (wins over native); increaseContrast (no reduce)→"bordered"; glassApiAvailable & no a11y→"native"; else→"blur". Run → FAIL.
- [ ] Implement `resolveGlassTier` (precedence: reduceTransparency > increaseContrast > glassApiAvailable > blur) + `useGlassCapability` (reads `isGlassEffectAPIAvailable()` from `expo-glass-effect`, `AccessibilityInfo.isReduceTransparencyEnabled()`/`isBoldTextEnabled`/high-contrast; subscribe to change events). Run → PASS.
- [ ] Commit `feat(design): glass capability tier resolver`.

### Task 3: `GlassSurface` component
**Files:** Create `glass/GlassSurface.tsx`. Smoke test via a pure prop→tier mapping test (no RN render infra).
**Interfaces (Produces):**
```ts
export interface GlassSurfaceProps {
  variant: "nav" | "tab" | "toolbar" | "sheet" | "fab" | "dock";
  glassStyle?: "regular" | "clear";   // expo-glass-effect glassEffectStyle
  interactive?: boolean;
  style?: import("react-native").ViewStyle;
  children?: React.ReactNode;
}
export function GlassSurface(props: GlassSurfaceProps): JSX.Element;
```
- [ ] Extract a pure `backingForTier(tier, variant, tokens)` returning `{ kind: "GlassView"|"BlurView"|"View"; props }`; test it (native→GlassView with glassEffectStyle; blur→BlurView with `blurMethod` + tint; opaque→View surface; bordered→View + hairline). Run → FAIL → implement → PASS.
- [ ] Implement `GlassSurface` = `useGlassCapability()` → `backingForTier` → render `GlassView`/`BlurView`/`View`. Never set opacity:0. Run design smoke (import renders) — verify visually against `mockups.html` for nav/tab/sheet.
- [ ] Commit `feat(design): GlassSurface component with fallback ladder`.

### Task 4: Context capsule + status dot
**Files:** Create `glass/ContextCapsule.tsx`; pure `formatContextCapsule(repo, branch)` test.
**Interfaces (Produces):**
```ts
export interface ContextCapsuleProps { repo: string; branch: string; status: "running"|"awaiting"|"idle"|"errored"; }
export function ContextCapsule(props: ContextCapsuleProps): JSX.Element;
export function statusDotColor(status: ContextCapsuleProps["status"], tokens: GlassTokens): string;  // pure
```
- [ ] Failing test: `statusDotColor("awaiting", tokens)` = the attention color; running = tint; errored = red; idle = secondary. `formatContextCapsule("The-IT-Dept/gstack","main")` → `"gstack · main"` (mono). Run → FAIL → implement → PASS.
- [ ] Implement the capsule (SF Mono `repo · branch`, breathing dot animation via `Animated`), export from `glass/index.ts`. Run → PASS.
- [ ] Commit `feat(design): context capsule + status dot`.

### Task 5: Barrel export + design typecheck
**Files:** `glass/index.ts`; ensure `@proliferate/design` exports the glass layer.
- [ ] Export `GlassSurface`, `ContextCapsule`, `glassTokens`, `useGlassCapability`, `resolveGlassTier`, types.
- [ ] `pnpm --filter @proliferate/design build && pnpm --filter @proliferate/design test` → PASS. Commit `feat(design): export glass layer`.

## Verification
`pnpm --filter @proliferate/design test` green; `pnpm --filter @proliferate/mobile typecheck` green after mobile imports the layer; visual check of nav/tab/sheet/fab against `mockups.html` on an iOS 26 simulator.
