## Leavelift — Scope

Leavelift helps people **maximize consecutive days off** by finding the best date windows to take PTO, stacking **weekends + state holidays (+ optional school breaks)**.

### Goals

- **Primary outcome**: suggest the best vacation windows for a given year, state, and PTO constraints.
- **Fast feedback**: changing filters updates results quickly (debounced compute).
- **Share + export**: users can share a best window and export a plan as PDF.
- **State-aware**: holidays and approximate school breaks vary by US state (2025–2035).

### In scope (current product)

- **Inputs / filters**
  - US state, year (2025–2035)
  - PTO days budget
  - Trip length mode (target / range / best)
  - Optional travel window constraint
  - Optional “weekdays only”
  - Optional kids mode and “school break” constraint (approximate, state-level)
- **Data**
  - State holidays for all 50 states (2025–2035), including observed days for weekend holidays
  - Approximate school break windows by state (hybrid model; 2025–2035)
- **Custom breaks (saved on device)**
  - SCHOOL_BREAK: augments the school-break filter
  - OFFICE_CLOSED: treated as extra “holiday-like” days (reduces PTO required)
  - BLACKOUT: excludes windows overlapping a blocked date range
- **Results**
  - “Top 3” best windows (contextual titles and simple storytelling)
  - “All options” grouped by efficiency band
  - Empty-state diagnosis explaining why results can be zero
- **Sharing**
  - “Share” modal card for the best window
  - Copy link + native share when available
- **PDF export**
  - Client-side printable plan (gated by a local “unlock” flow)
- **Analytics (Umami Cloud)**
  - Pageviews + event tracking:
    - `results_generated`
    - `pdf_export_clicked`, `pdf_unlock_completed`, `pdf_unlock_abandoned`
    - `share_link_copied`, `share_card_opened`, `share_native_clicked`

### Out of scope (explicitly not implemented)

- **Bookings**: flights/hotels, pricing, location search, itinerary building
- **User accounts / cloud sync**: login, cross-device persistence of custom breaks
- **Real district calendars**: district-by-district verified school calendars and uploads/scan OCR
- **Multi-country support**: non-US holidays and rules
- **Operational PTO policies**: company-specific rules (carryover, blackout policies beyond user-entered)
- **Server-side APIs**: no backend service; compute is client-side

### Assumptions & constraints

- **Determinism**: holiday/school window generation is intended to be stable across regenerations.
- **Timezone safety**: date math uses ISO strings and UTC-safe helpers to avoid off-by-one.
- **Approximation**: school breaks are state-level approximations; districts vary.
- **Privacy**: no PII is required for core planning; analytics events are minimal and anonymous.

### Success criteria

- For common states/years, a user can:
  - enter PTO constraints in < 30 seconds
  - see top windows instantly and understand “why it works”
  - share a best window with one tap
  - export a PDF plan when needed

