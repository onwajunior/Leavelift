## Leavelift — Design (ASCII)

### System overview

- **Framework**: Next.js App Router + React (client-side compute).
- **UI**: Tailwind CSS (responsive, light-surface design).
- **Core logic**: `lib/leavelift.ts` (vacation window generation + ranking + diagnostics).
- **Data**: generated JSON in `data/` (holidays + school windows).
- **Analytics**: Umami Cloud via script tag + `lib/analytics.ts`.
- **Storage**: LocalStorage for custom breaks and “PDF unlock” flag.

---

### High-level architecture

```
┌──────────────────────────────────────────────────────────────┐
│ Browser (Next.js / React client)                              │
│                                                              │
│  app/page.tsx (UI + state)                                   │
│    ├─ reads: data/*.json                                      │
│    ├─ calls: lib/leavelift.ts (buildTopWindows, diagnostics)  │
│    ├─ writes: localStorage (custom breaks, unlock flag)       │
│    └─ emits: lib/analytics.ts (window.umami.track)            │
│                                                              │
└──────────────────────────────────────────────────────────────┘

No backend service. All computation happens in the client.
```

---

### UI layout (desktop vs mobile)

Desktop (two-column):

```
┌──────────────────────────────────────────────────────────────┐
│ Header: [Wordmark + tagline]                 [Copy][Share][PDF]│
├──────────────────────────────────────────────────────────────┤
│  ┌────────────── Filters (left) ───────────┐  ┌─ Results ────┐ │
│  │ Basics                                  │  │ Top 3 / All  │ │
│  │ Options                                 │  │ Cards/list   │ │
│  │ Advanced (collapsible)                  │  │              │ │
│  │ Custom breaks (collapsible)             │  │ Sticky header│ │
│  └─────────────────────────────────────────┘  └──────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

Mobile (stacked):

```
┌─────────────────────────────────────────────┐
│ Header: wordmark + tagline (wrap as needed) │
│                 [icons…]                    │
├─────────────────────────────────────────────┤
│ Hero copy                                   │
│ Filters card                                │
│ Results card                                │
└─────────────────────────────────────────────┘
```

---

### Data inputs

```
User inputs:
  - state, year
  - PTO budget
  - trip mode + length constraints
  - optional: travel window, weekdays-only
  - optional: kids + school break mode
  - optional: custom breaks (school/office/blackout)

Static generated data:
  - data/holidays.us.2025-2035.json
  - data/school_windows.us.json
```

---

### Compute flow (results generation)

```
inputs/state changes
       │
       ▼
sanitize & normalize
(custom breaks, ranges)
       │
       ▼
buildTopWindows(...)  +  diagnoseEmptyResults(...)
       │
       ▼
Ranked windows (Top 3) + grouped list (All options)
       │
       ▼
render cards + empty-state messaging
```

Notes:
- Compute is debounced to avoid jank while the user changes inputs.
- Holidays can be augmented by custom OFFICE_CLOSED ranges.
- School windows can be augmented by custom SCHOOL_BREAK ranges.
- Candidate windows overlapping custom BLACKOUT ranges are filtered out.

---

### Key modules

```
app/page.tsx
  - UI state, debounced compute, rendering, modals

lib/leavelift.ts
  - date helpers
  - buildTopWindows(): generate & rank windows
  - diagnoseEmptyResults(): explain “why zero results”
  - CustomBreak types and integration

lib/analytics.ts
  - track(event, props) -> window.umami.track

scripts/generate-holidays.mjs
  - generate holidays JSON (all states, observed rules)

scripts/generate-school-windows.mjs
  - generate school windows JSON (hybrid state approximation)
```

---

### Events & instrumentation

```
Pageviews:
  - handled automatically by Umami script

Custom events (examples):
  - results_generated (after debounce settles)
  - share_link_copied, share_card_opened, share_native_clicked
  - pdf_export_clicked
  - pdf_unlock_completed / pdf_unlock_abandoned
```

---

### Known trade-offs

- **Client-only compute**: simplest deployment, but compute cost scales with device CPU.
- **Approximate school breaks**: useful directional signal, not a source of truth.
- **Local-only custom breaks**: private and simple, but not shareable across devices.

