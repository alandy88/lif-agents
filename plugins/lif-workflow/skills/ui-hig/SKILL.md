---
name: ui-hig
description: "Apple Human Interface Guidelines (HIG) for UI and UX: design a new screen or flow, audit an existing interface, or enhance one to follow the HIG. Use when the user asks for an HIG review, an Apple-style or native-feeling UI, or UI/UX design, audit, or polish for iOS, iPadOS, macOS, watchOS, tvOS, or visionOS."
argument-hint: "[design|audit|enhance] [screen, flow, or path]"
---

# ui-hig

Apply Apple's Human Interface Guidelines to one of three jobs. The guide is the source of
truth and it changes (Liquid Glass rewrote much of it in 2025), so every rule you cite
comes from a page fetched this run with `scripts/hig.py` in this skill's base directory:

```bash
python3 <skill-dir>/scripts/hig.py <slug>   # one page as Markdown
python3 <skill-dir>/scripts/hig.py          # root index
```

Section slugs: `getting-started`, `foundations`, `patterns`, `components`, `inputs`,
`technologies`. A section or group page ends with a `Topics` list of child slugs; links
inside a page render as `[→ slug]`. Each page states its platforms and last change date.

## Principles

Weigh every decision against Apple's eight principles (`design-principles`): **Purpose**
(make something meaningful), **Agency** (let people do things their way, recover from
mistakes), **Responsibility** (safety, privacy, transparency), **Familiarity** (build on
established patterns), **Flexibility** (devices, inputs, abilities), **Simplicity** (every
element earns its place), **Craft** (every detail), **Delight** (the right emotion).

## Scope first

1. Pick the mode from the request: `design`, `audit`, or `enhance`.
2. Name the target platforms. Read them from the project (SwiftUI/UIKit/AppKit targets,
   `Info.plist`, deployment targets); ask only if the project cannot tell you. Fetch the
   matching `designing-for-<platform>` page.
3. For a web or cross-platform UI, apply the HIG as the reference design language: read
   `pt` as CSS `px`, and map Apple-only features (Dynamic Type, SF Symbols, Liquid Glass)
   to their web equivalents — `rem` scaling, an icon set, `backdrop-filter` — stating each
   mapping in the output.
4. Look at the real interface: the view code, and a screenshot when the app runs (the
   `agent-browser` skill for web; the Simulator's `xcrun simctl io booted screenshot` for
   iOS). Judge what renders, not what the code intends.

## Design

1. Fetch the pages for the patterns and components the brief needs (`onboarding`,
   `navigation-and-search`, `tab-bars`, `sheets`, …) before proposing anything.
2. Prefer system components over custom ones; justify each custom control against the
   closest system component.
3. Output a screen plan: purpose, information hierarchy (most important content top and
   leading), navigation model, each component with its HIG page slug, states (empty,
   loading, error, disabled), accessibility behaviour, light and dark appearance.
4. Done when every component and pattern in the plan cites a page you fetched and every
   area in [references/checks.md](references/checks.md) has an answer for the plan.

## Audit

1. Walk every screen in scope through every area in
   [references/checks.md](references/checks.md), fetching the linked pages.
2. Record each **finding** as a row:

   | Severity | Where | Rule (quoted, short) | HIG page | Fix |
   |---|---|---|---|---|

   Severity: **blocker** — someone cannot use it (accessibility, contrast, target size,
   lost data); **major** — breaks a platform convention people rely on; **minor** — polish.
   *Where* is `file:line` or the screen and element.
3. Change no code in audit mode.
4. Done when every screen × area pair is either a finding or checked clean, and the
   report ends with the count per severity.

## Enhance

1. Run the audit first unless the user supplied one.
2. Fix blockers, then majors; take minors only when asked. Prefer the system component or
   modifier the HIG names over restyling a custom one.
3. Re-check each fixed finding against its page and the rendered result; run the project's
   typecheck and tests.
4. Report findings fixed, findings left, and any rule you deliberately did not follow,
   with why.
