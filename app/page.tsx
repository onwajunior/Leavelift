"use client";

import { useEffect, useMemo, useState, useCallback, useRef, Suspense } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import allHolidays from "../data/holidays.global.2025-2035.json";
import holidaySubdivisions from "../data/holiday_subdivisions.json";
import schoolWindows from "../data/school_windows.us.json";
import { buildTopWindows, diagnoseEmptyResults, CustomBreak, CustomBreakType, EmptyReason, RankedWindow } from "../lib/leavelift";
import { track } from "../lib/analytics";

const COUNTRIES: Record<string, string> = (holidaySubdivisions as any).countries ?? { US: "United States" };
type CountrySubdivision = { code: string; name: string };
const COUNTRY_SUBDIVISIONS: Record<string, CountrySubdivision[]> = (holidaySubdivisions as any).subdivisions ?? {};

const US_STATES: Record<string, string> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  DC: "District of Columbia",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
};

function CopyLinkButton() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(window.location.href).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
          track("share_link_copied");
        });
      }}
      title={copied ? "Copied!" : "Copy link"}
      aria-label={copied ? "Copied!" : "Copy link"}
      className="inline-flex items-center justify-center h-10 w-10 xl:h-auto xl:w-auto xl:px-3.5 xl:py-2.5 rounded-xl border border-gray-300 bg-white cursor-pointer"
    >
      <span className="sr-only">{copied ? "Copied!" : "Copy link"}</span>
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        className="text-gray-900"
        aria-hidden="true"
      >
        <path
          d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-1 1"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 0 1-7-7l1-1"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {copied && (
          <path
            d="M7 12.5l2 2 4-4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
      <span className="hidden xl:inline ml-2 text-sm font-semibold">{copied ? "Copied!" : "Copy link"}</span>
    </button>
  );
}

function plural(n: number, singular: string, plural: string) {
  return n === 1 ? singular : plural;
}

export default function Home() {
  return (
    <Suspense>
      <HomeInner />
    </Suspense>
  );
}

function HomeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Helper: read a param or fall back to a default
  function sp(key: string, fallback: string) {
    return searchParams.get(key) ?? fallback;
  }

  const controlClass =
    "w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400";
  const controlClassCompact =
    "w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400";

  // Filter state — seeded from URL on first render
  const initialCountry = sp("country", "US");
  const [ptoDays, setPtoDays] = useState<number>(() => Number(sp("pto", "10")));
  const [hasKids, setHasKids] = useState<boolean>(() => sp("kids", "1") === "1");
  const [country, setCountry] = useState<string>(() => initialCountry);
  const [state, setState] = useState<string>(() => {
    const fromUrl = sp("state", "");
    if (fromUrl) return fromUrl;
    if (initialCountry === "US") return "CA";
    const subs = COUNTRY_SUBDIVISIONS[initialCountry] ?? [];
    return subs[0]?.code ?? "";
  });
  const [tripMode, setTripMode] = useState<"fixed" | "range" | "best">(() => (sp("mode", "range") as any));
  const [fixedLength, setFixedLength] = useState<number>(() => Number(sp("fixedLen", "7")));
  const [lengthPreset, setLengthPreset] = useState<"short" | "medium" | "long">(() => (sp("preset", "medium") as any));
  const [fixedFlexible, setFixedFlexible] = useState<boolean>(() => sp("flex", "1") === "1");
  const [year, setYear] = useState<number>(() => Number(sp("year", "2026")));
  const [weekdaysOnly, setWeekdaysOnly] = useState<boolean>(() => sp("wdonly", "0") === "1");
  const [schoolBreakMode, setSchoolBreakMode] = useState<"ANY" | "REQUIRE">(() => (sp("school", "ANY") as any));
  const [travelStart, setTravelStart] = useState<string>(() => sp("ts", ""));
  const [travelEnd, setTravelEnd] = useState<string>(() => sp("te", ""));

  // Unlock / modal state (not in URL — device-local)
  const [isBetaUnlocked, setIsBetaUnlocked] = useState<boolean>(false);
  const [showUnlockModal, setShowUnlockModal] = useState<boolean>(false);
  const [unlockSubmitting, setUnlockSubmitting] = useState(false);
  const [unlockError, setUnlockError] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [who, setWho] = useState<"parent" | "non-parent">("parent");
  const [targetMonth, setTargetMonth] = useState<string>("");

  // Custom breaks (device-local)
  const CUSTOM_BREAKS_KEY = "leavelift_custom_breaks_v1";
  const [customBreaks, setCustomBreaks] = useState<CustomBreak[]>([]);
  const [newBreakType, setNewBreakType] = useState<CustomBreakType>("SCHOOL_BREAK");
  const [newBreakLabel, setNewBreakLabel] = useState<string>("");
  const [newBreakStart, setNewBreakStart] = useState<string>("");
  const [newBreakEnd, setNewBreakEnd] = useState<string>("");
  const [editingBreakId, setEditingBreakId] = useState<string>("");
  const [editBreakType, setEditBreakType] = useState<CustomBreakType>("SCHOOL_BREAK");
  const [editBreakLabel, setEditBreakLabel] = useState<string>("");
  const [editBreakStart, setEditBreakStart] = useState<string>("");
  const [editBreakEnd, setEditBreakEnd] = useState<string>("");

  // Results view (local UI)
  const [resultsView, setResultsView] = useState<"top" | "all">("top");
  const didMountRef = useRef(false);
  const [isUpdatingResults, setIsUpdatingResults] = useState<boolean>(false);

  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const unlockModalRef = useRef<HTMLDivElement | null>(null);
  const [showShareCard, setShowShareCard] = useState<boolean>(false);
  const [shareCopied, setShareCopied] = useState<boolean>(false);

  function parseMonth(iso: string): number | null {
    // iso: YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
    const m = Number(iso.slice(5, 7));
    if (!Number.isFinite(m) || m < 1 || m > 12) return null;
    return m;
  }

  function titleForWindow(r: RankedWindow, idx: number): string {
    // Rank #1 always gets the universal title.
    if (idx === 0) return "🥇 Best Overall";

    const rawNames = (r.holidayNames ?? []).flatMap((s) =>
      String(s)
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
    );
    const names = rawNames.map((n) => n.toLowerCase());

    const includesAny = (...needles: string[]) => names.some((n) => needles.some((k) => n.includes(k)));

    // Priority: name the moment when we have a strong hook.
    if (includesAny("thanksgiving")) return "🦃 Thanksgiving Power Play";

    if (includesAny("christmas")) return "🎄 Holiday Heist";
    if (includesAny("new year's")) return "✨ New Year Boost";

    if (includesAny("independence day")) return "🎆 July 4 Jackpot";
    if (includesAny("memorial day")) return "🇺🇸 Memorial Day Mega-Week";
    if (includesAny("labor day")) return "🛠 Labor Day Longhaul";

    if (includesAny("martin luther king")) return "✊ MLK Long Weekend";
    if (includesAny("presidents", "washington")) return "🏛 Presidents’ Day Pop";
    if (includesAny("juneteenth")) return "🟣 Juneteenth Lift";
    if (includesAny("veterans day")) return "🎖 Veterans Day Boost";

    if (includesAny("good friday")) return "🐣 Springtime Swipe";
    if (includesAny("patriots")) return "🇺🇸 Patriots’ Day Perk";
    if (includesAny("indigenous peoples", "columbus day", "native american")) return "🍁 Fall Long Weekend";
    if (includesAny("election day", "general election day")) return "🗳 Civic Day Sneak";

    if (includesAny("day after")) return "😈 Day-After Bonus";

    // Seasonal fallback when we don't have a holiday hook.
    const m = parseMonth(r.start) ?? parseMonth(r.end);
    if (m === 12 || m === 1) return "❄️ Winter Recharge";
    if (m === 11) return "🍁 November Boost";
    if (m === 9 || m === 10) return "🍂 Fall Recharge";
    if (m === 6 || m === 7 || m === 8) return "🏖 Summer Stretch";
    if (m === 3 || m === 4 || m === 5) return "🌷 Spring Refresh";
    return "✨ Sneaky Long Weekend";
  }

  function locationLabel(): string {
    const cName = COUNTRIES[country] ?? country;
    if (country === "US") return US_STATES[state] ?? state;
    const subs = COUNTRY_SUBDIVISIONS[country] ?? [];
    const sName = subs.find((x) => x.code === state)?.name ?? state;
    return state ? `${cName} — ${sName}` : cName;
  }

  function shareMessageForWindow(r: RankedWindow) {
    const gained = Math.max(0, r.totalDays - r.ptoUsed);
    const stateName = locationLabel();
    const base = `${r.ptoUsed} PTO → ${r.totalDays} days off (${r.start} → ${r.end})`;
    const extra = gained > 0 ? ` — gained ${gained} free ${plural(gained, "day", "days")}` : "";
    return `I just found a PTO window in ${stateName} for ${year}: ${base}${extra}. Try yours: ${window.location.href}`;
  }

  const isDefaultFilters =
    ptoDays === 10 &&
    hasKids === true &&
    country === "US" &&
    state === "CA" &&
    tripMode === "range" &&
    fixedLength === 7 &&
    lengthPreset === "medium" &&
    fixedFlexible === true &&
    year === 2026 &&
    weekdaysOnly === false &&
    schoolBreakMode === "ANY" &&
    travelStart === "" &&
    travelEnd === "";

  useEffect(() => {
    const v = window.localStorage.getItem("leavelift_beta_unlocked");
    if (v === "true") setIsBetaUnlocked(true);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CUSTOM_BREAKS_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const cleaned = sanitizeCustomBreaks(parsed);
      setCustomBreaks(cleaned);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(CUSTOM_BREAKS_KEY, JSON.stringify(customBreaks));
    } catch {
      // ignore
    }
  }, [customBreaks]);

  function addCustomBreak() {
    if (!newBreakStart || !newBreakEnd) return;
    const start = newBreakStart <= newBreakEnd ? newBreakStart : newBreakEnd;
    const end = newBreakStart <= newBreakEnd ? newBreakEnd : newBreakStart;
    const label =
      newBreakLabel.trim() ||
      (newBreakType === "SCHOOL_BREAK" ? "Custom school break" : newBreakType === "OFFICE_CLOSED" ? "Office closed" : "Blackout");
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? (crypto as any).randomUUID()
        : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    setCustomBreaks((prev) => [{ id, type: newBreakType, start, end, label }, ...prev]);
    setNewBreakLabel("");
    setNewBreakStart("");
    setNewBreakEnd("");
  }

  function makeId() {
    return typeof crypto !== "undefined" && "randomUUID" in crypto
      ? (crypto as any).randomUUID()
      : `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function sanitizeCustomBreaks(input: any): CustomBreak[] {
    if (!Array.isArray(input)) return [];
    const out: CustomBreak[] = [];
    for (const x of input) {
      if (!x || typeof x !== "object") continue;
      const type = (x as any).type as CustomBreakType;
      const start = String((x as any).start ?? "");
      const end = String((x as any).end ?? "");
      const label = String((x as any).label ?? "");
      let id = String((x as any).id ?? "");
      if (!id) id = makeId();
      if (!(type === "SCHOOL_BREAK" || type === "OFFICE_CLOSED" || type === "BLACKOUT")) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) continue;
      out.push({ id, type, start, end, label });
    }
    return out;
  }

  function removeCustomBreak(id: string) {
    setCustomBreaks((prev) => prev.filter((b) => b.id !== id));
    if (editingBreakId === id) setEditingBreakId("");
  }

  function clearCustomBreaks() {
    setCustomBreaks([]);
    setEditingBreakId("");
  }

  function resetFilters() {
    setPtoDays(10);
    setHasKids(true);
    setCountry("US");
    setState("CA");
    setTripMode("range");
    setFixedLength(7);
    setLengthPreset("medium");
    setFixedFlexible(true);
    setYear(2026);
    setWeekdaysOnly(false);
    setSchoolBreakMode("ANY");
    setTravelStart("");
    setTravelEnd("");
    setResultsView("top");
    setEditingBreakId("");
  }

  useEffect(() => {
    if (!showUnlockModal) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const t = window.setTimeout(() => emailInputRef.current?.focus(), 0);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.clearTimeout(t);
    };
  }, [showUnlockModal]);

  useEffect(() => {
    if (!showUnlockModal) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      track("pdf_unlock_abandoned", { reason: "escape" });
      setShowUnlockModal(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showUnlockModal]);

  useEffect(() => {
    if (!showShareCard) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setShowShareCard(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [showShareCard]);

  function onUnlockModalKeyDown(e: ReactKeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const root = unlockModalRef.current;
    if (!root) return;
    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),textarea,input,select,[tabindex]:not([tabindex="-1"])'
      )
    ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const active = document.activeElement as HTMLElement | null;
    if (e.shiftKey) {
      if (active === first || !root.contains(active)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function startEditing(b: CustomBreak) {
    setEditingBreakId(b.id);
    setEditBreakType(b.type);
    setEditBreakLabel(b.label);
    setEditBreakStart(b.start);
    setEditBreakEnd(b.end);
  }

  function cancelEditing() {
    setEditingBreakId("");
  }

  function saveEditing() {
    if (!editingBreakId) return;
    if (!editBreakStart || !editBreakEnd) return;
    const start = editBreakStart <= editBreakEnd ? editBreakStart : editBreakEnd;
    const end = editBreakStart <= editBreakEnd ? editBreakEnd : editBreakStart;
    const label =
      editBreakLabel.trim() ||
      (editBreakType === "SCHOOL_BREAK"
        ? "Custom school break"
        : editBreakType === "OFFICE_CLOSED"
          ? "Office closed"
          : "Blackout");
    setCustomBreaks((prev) =>
      prev.map((b) => (b.id === editingBreakId ? { ...b, type: editBreakType, start, end, label } : b))
    );
    setEditingBreakId("");
  }

  // Sync filter state → URL (replaces history entry so back button still works)
  const syncURL = useCallback(
    (overrides: Record<string, string> = {}) => {
      const params = new URLSearchParams({
        country,
        state,
        year: String(year),
        pto: String(ptoDays),
        kids: hasKids ? "1" : "0",
        mode: tripMode,
        fixedLen: String(fixedLength),
        preset: lengthPreset,
        flex: fixedFlexible ? "1" : "0",
        wdonly: weekdaysOnly ? "1" : "0",
        school: schoolBreakMode,
        ...(travelStart ? { ts: travelStart } : {}),
        ...(travelEnd ? { te: travelEnd } : {}),
        ...overrides,
      });
      router.replace(`?${params.toString()}`, { scroll: false });
    },
    [country, state, year, ptoDays, hasKids, tripMode, fixedLength, lengthPreset, fixedFlexible, weekdaysOnly, schoolBreakMode, travelStart, travelEnd, router]
  );

  useEffect(() => { syncURL(); }, [country, state, year, ptoDays, hasKids, tripMode, fixedLength, lengthPreset, fixedFlexible, weekdaysOnly, schoolBreakMode, travelStart, travelEnd]);

  const lengths = useMemo(() => {
    if (tripMode === "fixed") {
      const target = Math.max(2, Math.min(60, fixedLength));
      if (!fixedFlexible) return [target];
      const above = Array.from({ length: 15 }, (_, i) => target + i).filter((x) => x <= 60);
      const below = Array.from({ length: target - 2 }, (_, i) => target - 1 - i).filter((x) => x >= 2);
      return [...above, ...below];
    }
    if (tripMode === "best") return Array.from({ length: 16 - 5 + 1 }, (_, i) => 5 + i);
    if (lengthPreset === "short") return [5, 7];
    if (lengthPreset === "long") return [11, 14];
    return [7, 9, 11];
  }, [tripMode, fixedLength, fixedFlexible, lengthPreset]);

  const computeAllResults = useCallback((): RankedWindow[] => {
    return buildTopWindows({
      year,
      country,
      state,
      ptoDays,
      hasKids,
      holidays: allHolidays as any,
      schoolWindows: (country === "US" ? (schoolWindows as any) : []) as any,
      customBreaks,
      lengths,
      topN: 25,
      rankingMode:
        tripMode === "best" ? "BEST" : tripMode === "fixed" ? "FIXED_TARGET" : "EFFICIENCY",
      targetLength: tripMode === "fixed" ? fixedLength : undefined,
      weekdaysOnly,
      schoolBreakMode: country === "US" ? schoolBreakMode : "ANY",
      dateRange: travelStart && travelEnd ? { start: travelStart, end: travelEnd } : undefined,
    });
  }, [
    year,
    country,
    state,
    ptoDays,
    hasKids,
    customBreaks,
    lengths,
    tripMode,
    fixedLength,
    weekdaysOnly,
    schoolBreakMode,
    travelStart,
    travelEnd,
  ]);

  // Debounced computation: change inputs → keep last results visible, then update shortly after.
  const [allResults, setAllResults] = useState<RankedWindow[]>(() => computeAllResults());

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    setIsUpdatingResults(true);
    const t = window.setTimeout(() => {
      setAllResults(computeAllResults());
      setIsUpdatingResults(false);
    }, 150);
    return () => window.clearTimeout(t);
  }, [computeAllResults]);

  const results = allResults.slice(0, 3);
  const bestWindow = results[0] ?? null;

  const allResultsByBand = useMemo(() => {
    const bandFor = (eff: number) => {
      if (eff >= 4) return { key: "elite", label: "Elite (≥4x)" };
      if (eff >= 3) return { key: "great", label: "Great (≥3x)" };
      if (eff >= 2.5) return { key: "good", label: "Good (≥2.5x)" };
      return { key: "other", label: "Other" };
    };

    const order = ["elite", "great", "good", "other"];
    const groups = new Map<string, { label: string; items: RankedWindow[] }>();

    for (const r of allResults) {
      const b = bandFor(r.efficiency);
      if (!groups.has(b.key)) groups.set(b.key, { label: b.label, items: [] });
      groups.get(b.key)!.items.push(r);
    }

    return order
      .map((k) => ({ key: k, ...(groups.get(k) ?? { label: k, items: [] }) }))
      .filter((g) => g.items.length > 0);
  }, [allResults]);

  const emptyReason: EmptyReason | null = useMemo(() => {
    if (results.length > 0) return null;
    return diagnoseEmptyResults({
      year,
      country,
      state,
      ptoDays,
      hasKids,
      holidays: allHolidays as any,
      schoolWindows: (country === "US" ? (schoolWindows as any) : []) as any,
      customBreaks,
      lengths,
      schoolBreakMode: country === "US" ? schoolBreakMode : "ANY",
      dateRange: travelStart && travelEnd ? { start: travelStart, end: travelEnd } : undefined,
    });
  }, [results.length, year, country, state, ptoDays, hasKids, customBreaks, lengths, schoolBreakMode, travelStart, travelEnd]);

  // Track when results are generated (debounced to final settled state)
  useEffect(() => {
    if (isUpdatingResults) return;
    track("results_generated", {
      country,
      state,
      year,
      ptoDays,
      tripMode,
      hasKids,
      weekdaysOnly,
      schoolBreakMode: country === "US" ? schoolBreakMode : "ANY",
      resultsCount: results.length,
      topEfficiency: results[0]?.efficiency ?? 0,
    });
  }, [results, isUpdatingResults, country, state, year, ptoDays, tripMode, hasKids, weekdaysOnly, schoolBreakMode]);

  function unlockLocallyAndExport() {
    window.localStorage.setItem("leavelift_beta_unlocked", "true");
    setIsBetaUnlocked(true);
    setShowUnlockModal(false);
    exportPlanToPDF();
  }

  function exportPlanToPDF() {
    const generatedAt = new Date().toLocaleString();
    const top3Keys = new Set(results.map((r) => `${r.start}_${r.end}`));

    const rows = allResults
      .map((r, idx) => {
        const holidays = r.holidayNames?.length ? r.holidayNames.join(", ") : "None";
        const school = hasKids
          ? r.flags.overlapsLikelySchoolBreak
            ? "Likely"
            : "Maybe conflicts"
          : "N/A";
        const isTop = top3Keys.has(`${r.start}_${r.end}`);
        return `
          <tr class="${isTop ? "top" : ""}">
            <td>${isTop ? "★" : ""} ${idx + 1}</td>
            <td><b>${r.start}</b> → <b>${r.end}</b></td>
            <td>${r.totalDays}</td>
            <td>${r.ptoUsed}</td>
            <td>${r.efficiency}x</td>
            <td>${r.weekendsUsed}</td>
            <td>${r.holidaysUsed}</td>
            <td>${holidays}</td>
            <td>${school}</td>
          </tr>
        `;
      })
      .join("");

    const html = `
    <html>
      <head>
        <title>Leavelift Plan</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 20px; }
          table { width: 100%; border-collapse: collapse; margin-top: 12px; }
          th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; }
          th { background: #f5f5f5; }
          tr.top td { background: #fff7cc; }
        </style>
      </head>
      <body>
        <h2>Leavelift Vacation Plan</h2>
        <p>Generated: ${generatedAt} · Location: ${(locationLabel() as any)} · Year: ${year}</p>
        <table>
          <thead>
            <tr>
              <th>#</th><th>Date Range</th><th>Days Off</th><th>PTO</th>
              <th>Efficiency</th><th>Weekends</th><th>Holiday Days</th>
              <th>Holidays</th><th>School</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
    </html>`;

    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) return;
    doc.open();
    doc.write(html);
    doc.close();
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => document.body.removeChild(iframe), 1000);
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* Background photo (sunset beach) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[url('/brand/beach.jpg')] bg-cover bg-center brightness-95 saturate-110"
      />
      {/* Readability overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/90 via-white/70 to-white/90"
      />
      {/* Soft glow accents */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.18),transparent_55%),radial-gradient(ellipse_at_bottom,rgba(52,211,153,0.14),transparent_55%)]"
      />

      <div className="relative z-10">
      <header className="sticky top-0 z-40 border-b border-gray-200/70 bg-white/80 backdrop-blur">
        <div className="max-w-[1040px] mx-auto px-4 sm:px-6 py-3 flex items-center gap-x-3 gap-y-2 flex-wrap">
          <div className="min-w-0 flex-1 flex items-center gap-3 sm:gap-4 flex-wrap">
            <img
              src="/brand/wordmark-transparent.png"
              alt="Leavelift"
              className="h-12 sm:h-16 md:h-20 w-auto object-contain flex-none"
            />
            <div className="min-w-0">
              <div className="text-sm font-semibold text-gray-900 leading-tight">Your calendar is leaking time.</div>
              <div className="text-sm text-gray-600 leading-snug">
                We find the exact days to take off so you get 2–4x more time off using the same PTO.
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 flex-none ml-auto">
            <CopyLinkButton />
            <button
              type="button"
              disabled={!bestWindow}
              onClick={() => {
                setShareCopied(false);
                setShowShareCard(true);
                track("share_card_opened", { hasBest: Boolean(bestWindow) });
              }}
              title="Share"
              aria-label="Share"
              className="inline-flex items-center justify-center h-10 w-10 xl:h-auto xl:w-auto xl:px-3.5 xl:py-2.5 rounded-xl border border-gray-300 bg-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span className="sr-only">Share</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-gray-900" aria-hidden="true">
                <path
                  d="M16 8a3 3 0 1 0-2.83-4H13a3 3 0 0 0 3 4Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M6 13a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M18 13a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M8.7 14.6l6.6-3.2M8.7 17.4l6.6 3.2"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="hidden xl:inline ml-2 text-sm font-semibold">Share</span>
            </button>

            <button
              type="button"
              onClick={() => {
                track("pdf_export_clicked", { unlocked: isBetaUnlocked });
                if (!isBetaUnlocked) { setShowUnlockModal(true); return; }
                exportPlanToPDF();
              }}
              title={isBetaUnlocked ? "Export PDF" : "Unlock PDF Export"}
              aria-label={isBetaUnlocked ? "Export PDF" : "Unlock PDF Export"}
              className="inline-flex items-center justify-center h-10 w-10 xl:h-auto xl:w-auto xl:px-3.5 xl:py-2 rounded-xl border border-gray-300 bg-gray-900 text-white cursor-pointer"
            >
              <span className="sr-only">{isBetaUnlocked ? "Export PDF" : "Unlock PDF Export"}</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="text-white" aria-hidden="true">
                <path
                  d="M12 3v10m0 0 4-4m-4 4-4-4"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M5 15v3a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-3"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="hidden xl:inline ml-2 text-sm font-semibold">
                {isBetaUnlocked ? "Export PDF" : "Unlock PDF Export"}
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-[1040px] mx-auto px-4 sm:px-6 py-6">
        <div className="mb-5">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">Double your life without quitting your job.</h1>
          <p className="mt-1 text-sm text-gray-600">
            Adjust your constraints and we’ll surface high-efficiency trips.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[420px_1fr] items-start">
          {/* Left: Where/When + Options */}
          <section className="p-5 md:p-6 rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="grid gap-6">
              <div className="flex items-center justify-between gap-3">
                <div className="font-extrabold tracking-tight">Filters</div>
                <button
                  type="button"
                  onClick={resetFilters}
                  disabled={isDefaultFilters}
                  className="text-xs font-semibold underline underline-offset-2 text-gray-700 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Reset filters
                </button>
              </div>

              <div>
                <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Basics</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                  <label className="flex flex-col gap-1.5 sm:col-span-2">
                    <span className="font-semibold">Country</span>
                    <select
                      value={country}
                      onChange={(e) => {
                        const next = e.target.value;
                        setCountry(next);
                        if (next === "US") {
                          setState("CA");
                          return;
                        }
                        const subs = COUNTRY_SUBDIVISIONS[next] ?? [];
                        setState(subs[0]?.code ?? "");
                      }}
                      className={controlClass}
                    >
                      {Object.entries(COUNTRIES).map(([code, name]) => (
                        <option key={code} value={code}>{name}</option>
                      ))}
                    </select>
                  </label>

                  {country === "US" ? (
                    <label className="flex flex-col gap-1.5 sm:col-span-2">
                      <span className="font-semibold">State</span>
                      <select
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        className={controlClass}
                      >
                        {Object.entries(US_STATES).map(([code, name]) => (
                          <option key={code} value={code}>{name} ({code})</option>
                        ))}
                      </select>
                    </label>
                  ) : (COUNTRY_SUBDIVISIONS[country]?.length ?? 0) > 0 ? (
                    <label className="flex flex-col gap-1.5 sm:col-span-2">
                      <span className="font-semibold">Region</span>
                      <select
                        value={state}
                        onChange={(e) => setState(e.target.value)}
                        className={controlClass}
                      >
                        {(COUNTRY_SUBDIVISIONS[country] ?? []).map((s) => (
                          <option key={s.code} value={s.code}>{s.name} ({s.code})</option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  <label className="flex flex-col gap-1.5">
                    <span className="font-semibold">Planning year</span>
                    <select
                      value={year}
                      onChange={(e) => setYear(Number(e.target.value))}
                      className={controlClass}
                    >
                      {[2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035].map((y) => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="font-semibold">PTO days</span>
                    <input
                      type="number"
                      min={0}
                      max={40}
                      value={ptoDays}
                      onChange={(e) => setPtoDays(Number(e.target.value))}
                      className={controlClass}
                    />
                  </label>
                </div>
              </div>

              <div>
                <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">Options</div>
                <div className="grid gap-3 mt-2">
                  <label className="flex flex-col gap-1.5">
                    <span className="font-semibold">Preferred trip length</span>
                    <select
                      value={tripMode}
                      onChange={(e) => setTripMode(e.target.value as any)}
                      className={controlClass}
                    >
                      <option value="fixed">Target</option>
                      <option value="range">Range</option>
                      <option value="best">Best</option>
                    </select>

                    {tripMode === "fixed" && (
                      <>
                        <div className="flex gap-2.5 items-center mt-2 flex-wrap">
                          <span className="opacity-85">Days:</span>
                          <input
                            type="number"
                            min={2}
                            max={60}
                            value={fixedLength}
                            onChange={(e) => setFixedLength(Number(e.target.value))}
                            className="rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 w-full sm:w-[120px] max-w-[160px]"
                          />
                        </div>
                        <label className="flex items-center gap-2.5 mt-2.5">
                          <input type="checkbox" checked={fixedFlexible} onChange={(e) => setFixedFlexible(e.target.checked)} />
                          <span className="opacity-85">Flexible around target</span>
                        </label>
                      </>
                    )}

                    {tripMode === "range" && (
                      <select
                        value={lengthPreset}
                        onChange={(e) => setLengthPreset(e.target.value as any)}
                        className={`mt-2 ${controlClass}`}
                      >
                        <option value="short">Short (5–7 days)</option>
                        <option value="medium">Medium (7–11 days)</option>
                        <option value="long">Long (11–14 days)</option>
                      </select>
                    )}

                    {tripMode === "best" && (
                      <div className="mt-2 text-sm text-gray-600">Finds the longest time off within your PTO limit.</div>
                    )}
                  </label>

                  <details className="rounded-xl border border-gray-200 p-3">
                    <summary className="cursor-pointer font-semibold">
                      Advanced filters
                      <span className="ml-2 text-xs font-normal text-gray-500">(optional)</span>
                    </summary>
                    <div className="mt-3 grid gap-3">
                      <label className="flex items-center gap-2.5">
                        <input type="checkbox" checked={weekdaysOnly} onChange={(e) => setWeekdaysOnly(e.target.checked)} />
                        <span className="font-semibold">Weekdays only (ignore weekends)</span>
                      </label>

                      <label className="flex items-center gap-2.5">
                        <input type="checkbox" checked={hasKids} onChange={(e) => setHasKids(e.target.checked)} />
                        <span className="font-semibold">School-age kids</span>
                      </label>

                      {hasKids && country === "US" && (
                        <label className="flex flex-col gap-1.5">
                          <span className="font-semibold">School break</span>
                          <select
                            value={schoolBreakMode}
                            onChange={(e) => setSchoolBreakMode(e.target.value as any)}
                            className={controlClass}
                          >
                            <option value="ANY">Any time</option>
                            <option value="REQUIRE">Must be fully during school break</option>
                          </select>
                          <div className="text-[11px] text-gray-500">
                            <div>School breaks are approximate (state-level). District calendars vary.</div>
                            <details className="mt-1">
                              <summary className="cursor-pointer underline underline-offset-2 opacity-80">
                                What does “Must be fully during school break” mean?
                              </summary>
                              <div className="mt-1 leading-snug">
                                When enabled, we only keep trips where every day falls within an estimated school break window. Because these
                                windows are approximate, this can filter out all results—switch to “Any time” if you see 0 results.
                              </div>
                            </details>
                          </div>
                        </label>
                      )}

                      {hasKids && country !== "US" && (
                        <div className="text-[11px] text-gray-500">
                          School break alignment is currently available for the United States only. You can still use Custom breaks to add school
                          dates for your area.
                        </div>
                      )}

                      <div className="flex flex-col gap-1.5">
                        <span className="font-semibold">Travel window (optional)</span>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <input
                            type="date"
                            value={travelStart}
                            onChange={(e) => setTravelStart(e.target.value)}
                            className={controlClass}
                          />
                          <input
                            type="date"
                            value={travelEnd}
                            onChange={(e) => setTravelEnd(e.target.value)}
                            className={controlClass}
                          />
                        </div>
                        <div className="text-xs text-gray-500">If set, vacation windows must fall fully inside this range.</div>
                      </div>

                      <details className="rounded-xl border border-gray-200 p-3 bg-gray-50">
                        <summary className="cursor-pointer font-semibold flex items-center justify-between gap-3">
                          <span>Custom breaks</span>
                          <span className="text-[11px] px-2 py-0.5 rounded-full border border-gray-200 bg-white text-gray-700">
                            {customBreaks.length}
                          </span>
                        </summary>
                        <div className="text-xs text-gray-600 mt-1">
                          Add your own dates. School breaks affect the kids filter, office closures reduce PTO like holidays, and blackouts exclude windows.
                        </div>
                        <div className="text-[11px] text-gray-500 mt-1">
                          Saved on this device.
                        </div>

                        <div className="flex items-center justify-between gap-3 flex-wrap mt-4">
                          <div className="text-sm font-semibold">Add a break</div>
                          {customBreaks.length > 0 && (
                            <button
                              type="button"
                              onClick={clearCustomBreaks}
                              className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 bg-white"
                            >
                              Clear all
                            </button>
                          )}
                        </div>

                        <div className="flex items-end gap-2.5 flex-wrap mt-3">
                          <label className="flex flex-col gap-1">
                            <span className="text-xs font-semibold">Type</span>
                            <select
                              value={newBreakType}
                              onChange={(e) => setNewBreakType(e.target.value as any)}
                              className="rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 w-full sm:w-[200px]"
                            >
                              <option value="SCHOOL_BREAK">School break</option>
                              <option value="OFFICE_CLOSED">Office closed</option>
                              <option value="BLACKOUT">Blackout (avoid)</option>
                            </select>
                          </label>

                          <label className="flex flex-col gap-1 w-full sm:flex-1 min-w-0">
                            <span className="text-xs font-semibold">Label</span>
                            <input
                              value={newBreakLabel}
                              onChange={(e) => setNewBreakLabel(e.target.value)}
                              placeholder="e.g. Spring break, Company shutdown"
                              className={controlClass}
                            />
                          </label>

                          <label className="flex flex-col gap-1">
                            <span className="text-xs font-semibold">Start</span>
                            <input
                              type="date"
                              value={newBreakStart}
                              onChange={(e) => setNewBreakStart(e.target.value)}
                              className={controlClassCompact}
                            />
                          </label>

                          <label className="flex flex-col gap-1">
                            <span className="text-xs font-semibold">End</span>
                            <input
                              type="date"
                              value={newBreakEnd}
                              onChange={(e) => setNewBreakEnd(e.target.value)}
                              className={controlClassCompact}
                            />
                          </label>

                          <button
                            type="button"
                            onClick={addCustomBreak}
                            disabled={!newBreakStart || !newBreakEnd}
                            className="px-3.5 py-2.5 rounded-xl border border-gray-300 bg-gray-900 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            Add
                          </button>
                        </div>

                        {customBreaks.length === 0 ? (
                          <div className="mt-3 rounded-xl border border-dashed border-gray-200 bg-white p-3 text-sm text-gray-600">
                            <div className="font-semibold text-gray-900">No custom breaks yet</div>
                            <div className="mt-1 text-xs text-gray-600">
                              Add “Office closed” for company shutdowns, “Blackout” for days you can’t travel, or a “School break” for your district.
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 grid gap-2">
                            {customBreaks.map((b) => (
                              <div key={b.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-gray-200 bg-white">
                                {editingBreakId === b.id ? (
                                  <div className="w-full">
                                    <div className="flex items-end gap-2.5 flex-wrap">
                                      <label className="flex flex-col gap-1">
                                        <span className="text-xs font-semibold">Type</span>
                                        <select
                                          value={editBreakType}
                                          onChange={(e) => setEditBreakType(e.target.value as any)}
                                          className="rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-400 w-full sm:w-[200px]"
                                        >
                                          <option value="SCHOOL_BREAK">School break</option>
                                          <option value="OFFICE_CLOSED">Office closed</option>
                                          <option value="BLACKOUT">Blackout (avoid)</option>
                                        </select>
                                      </label>

                                      <label className="flex flex-col gap-1 w-full sm:flex-1 min-w-0">
                                        <span className="text-xs font-semibold">Label</span>
                                        <input
                                          value={editBreakLabel}
                                          onChange={(e) => setEditBreakLabel(e.target.value)}
                                          className={controlClass}
                                        />
                                      </label>

                                      <label className="flex flex-col gap-1">
                                        <span className="text-xs font-semibold">Start</span>
                                        <input
                                          type="date"
                                          value={editBreakStart}
                                          onChange={(e) => setEditBreakStart(e.target.value)}
                                          className={controlClassCompact}
                                        />
                                      </label>

                                      <label className="flex flex-col gap-1">
                                        <span className="text-xs font-semibold">End</span>
                                        <input
                                          type="date"
                                          value={editBreakEnd}
                                          onChange={(e) => setEditBreakEnd(e.target.value)}
                                          className={controlClassCompact}
                                        />
                                      </label>

                                      <div className="flex items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={saveEditing}
                                          disabled={!editBreakStart || !editBreakEnd}
                                          className="text-xs px-3 py-2 rounded-lg border border-gray-300 bg-gray-900 text-white disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                          Save
                                        </button>
                                        <button
                                          type="button"
                                          onClick={cancelEditing}
                                          className="text-xs px-3 py-2 rounded-lg border border-gray-300 bg-white"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span
                                          className={`text-[11px] px-2 py-0.5 rounded-full border ${
                                            b.type === "SCHOOL_BREAK"
                                              ? "border-blue-200 bg-blue-50 text-blue-800"
                                              : b.type === "OFFICE_CLOSED"
                                                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                                : "border-rose-200 bg-rose-50 text-rose-800"
                                          }`}
                                        >
                                          {b.type === "SCHOOL_BREAK" ? "School break" : b.type === "OFFICE_CLOSED" ? "Office closed" : "Blackout"}
                                        </span>
                                        <span className="font-semibold break-words">{b.label}</span>
                                      </div>
                                      <div className="text-xs text-gray-500 mt-0.5 font-mono">{b.start} → {b.end}</div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button
                                        type="button"
                                        onClick={() => startEditing(b)}
                                        className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 bg-white"
                                      >
                                        Edit
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => removeCustomBreak(b.id)}
                                        className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 bg-white"
                                      >
                                        Remove
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </details>
                    </div>
                  </details>
                </div>
              </div>
            </div>
          </section>

          {/* Right: Results */}
          <section className="p-5 md:p-6 rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="-mx-5 md:-mx-6 px-5 md:px-6 py-3 -mt-5 md:-mt-6 mb-4 sticky top-[72px] z-20 bg-white/90 backdrop-blur border-b border-gray-100">
              <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="font-extrabold text-lg tracking-tight">Options</div>
                <div className="text-xs text-gray-500">
                  Showing {allResults.length} best matches for your settings.
                  <span className="ml-2" aria-live="polite">
                    {isUpdatingResults ? (
                      <span className="inline-flex items-center gap-2 text-gray-500">
                        <span className="h-2 w-2 rounded-full bg-gray-400 animate-pulse" />
                        Updating…
                      </span>
                    ) : null}
                  </span>
                </div>
              </div>
              <div className="inline-flex rounded-xl border border-gray-200 bg-gray-50 p-1">
                <button
                  type="button"
                  onClick={() => setResultsView("top")}
                  className={`px-3 py-1.5 text-sm rounded-lg ${resultsView === "top" ? "bg-white shadow-sm border border-gray-200" : "opacity-70"}`}
                >
                  Top 3
                </button>
                <button
                  type="button"
                  onClick={() => setResultsView("all")}
                  className={`px-3 py-1.5 text-sm rounded-lg ${resultsView === "all" ? "bg-white shadow-sm border border-gray-200" : "opacity-70"}`}
                >
                  All options
                </button>
              </div>
            </div>
            </div>

            <div className="mt-4">
              {results.length === 0 ? (
                <div className="p-5 border border-orange-200 rounded-2xl bg-orange-50">
                  <div className="font-bold text-base mb-2">No vacation windows found</div>
                  <div className="opacity-80 text-sm">
                    {emptyReason === "pto_too_low" && (
                      <>Your PTO budget of <b>{ptoDays} days</b> isn't enough to cover a trip of that length without a holiday or weekend to help. Try <b>increasing your PTO days</b>, switching to a <b>shorter trip length</b>, or choosing <b>"Best"</b> mode to find the longest trip your budget can cover.</>
                    )}
                    {emptyReason === "school_break_too_restrictive" && (
                      <>No school break windows are long enough for your requested trip length in <b>{year}</b>. Try switching the school break filter to <b>"Any time"</b>, or use a <b>shorter trip length</b>.</>
                    )}
                    {emptyReason === "travel_window_too_narrow" && (
                      <>Your travel window (<b>{travelStart} → {travelEnd}</b>) is too short for the requested trip length. Try <b>widening the travel window</b> or selecting a <b>shorter trip length</b>.</>
                    )}
                    {emptyReason === "no_holidays_for_state_year" && (
                      <>No holiday data found for <b>{locationLabel()}</b> in <b>{year}</b>. Please try a different year or location.</>
                    )}
                    {emptyReason === "unknown" && (
                      <>Try increasing your PTO days, relaxing your filters, or switching to <b>"Best"</b> mode.</>
                    )}
                  </div>
                </div>
              ) : resultsView === "top" ? (
                <div className="grid gap-3">
                  {results.map((r, idx) => (
                    <div key={`${r.start}_${r.end}`} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                            {titleForWindow(r, idx)}
                          </div>
                          <div className="mt-1 text-xl font-extrabold tracking-tight">
                            {r.ptoUsed} PTO → {r.totalDays} Days Off
                          </div>
                          <div className="mt-1 text-sm text-gray-600 font-mono">
                            {r.start} → {r.end}
                          </div>
                        </div>
                        <div className="flex gap-2 flex-wrap justify-end">
                          <span className="text-xs px-2.5 py-1 rounded-full border border-gray-200 bg-gray-50">
                            Efficiency <b>{r.efficiency}x</b>
                          </span>
                          <span className="text-xs px-2.5 py-1 rounded-full border border-gray-200 bg-gray-50">
                            Weekends <b>{r.weekendsUsed}</b>
                          </span>
                          <span className="text-xs px-2.5 py-1 rounded-full border border-gray-200 bg-gray-50">
                            Holidays <b>{r.holidaysUsed}</b>
                          </span>
                          {hasKids && (
                            <span
                              className={`text-xs px-2.5 py-1 rounded-full border ${
                                r.flags.overlapsLikelySchoolBreak
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                  : "border-amber-200 bg-amber-50 text-amber-800"
                              }`}
                            >
                              School break <b>{r.flags.overlapsLikelySchoolBreak ? "Likely" : "Maybe conflicts"}</b>
                            </span>
                          )}
                        </div>
                      </div>

                      {Math.max(0, r.totalDays - r.ptoUsed) > 0 && (
                        <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                          <div className="flex items-center gap-2 text-emerald-900 font-semibold">
                            <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-emerald-600 text-white text-sm">
                              ✓
                            </span>
                            <span>
                              You gained{" "}
                              <b>{Math.max(0, r.totalDays - r.ptoUsed)}</b> extra free{" "}
                              {plural(Math.max(0, r.totalDays - r.ptoUsed), "day", "days")}.
                            </span>
                          </div>
                        </div>
                      )}

                      <details className="mt-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
                        <summary className="cursor-pointer font-semibold">Why it works</summary>
                        <div className="mt-2 text-sm text-gray-700 space-y-2">
                          <p>
                            Here’s the trick: you only spend <b>{r.ptoUsed}</b> PTO days, and let the calendar do the rest.
                            Between <b>{r.weekendsUsed}</b> weekends and <b>{r.holidaysUsed}</b> holidays, this stretches into{" "}
                            <b>{r.totalDays}</b> consecutive days off.
                          </p>
                          {r.holidayNames.length > 0 && (
                            <p>
                              The “free boost” comes from: <b>{r.holidayNames.join(", ")}</b>.
                            </p>
                          )}
                          {hasKids && (
                            <p>
                              Kid factor: this window is{" "}
                              <b>{r.flags.overlapsLikelySchoolBreak ? "likely" : "not obviously"}</b> aligned with a school break.
                            </p>
                          )}
                        </div>
                      </details>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid gap-4">
                  {allResultsByBand.map((g) => (
                    <div key={g.key}>
                      <div className="font-bold text-sm">{g.label}</div>
                      <div className="mt-2 grid gap-2">
                        {g.items.map((r) => (
                          <div key={`${r.start}_${r.end}`} className="flex items-start justify-between gap-3 p-3 rounded-xl border border-gray-200 bg-white">
                            <div className="min-w-0">
                              <div className="font-semibold font-mono break-words">{r.start} → {r.end}</div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                <span className="inline-flex items-center gap-2 flex-wrap">
                                  <span>{r.totalDays} days off</span>
                                  <span>·</span>
                                  <span>{r.ptoUsed} PTO</span>
                                  <span>·</span>
                                  <span><b>{r.efficiency}x</b> efficiency</span>
                                </span>
                              </div>
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-1.5 text-[11px] sm:text-xs text-gray-700">
                              <span className="px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50">
                                Weekends <b>{r.weekendsUsed}</b>
                              </span>
                              <span className="px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50">
                                Holidays <b>{r.holidaysUsed}</b>
                              </span>
                              {hasKids && (
                                <span
                                  className={`px-2 py-0.5 rounded-full border ${
                                    r.flags.overlapsLikelySchoolBreak
                                      ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                      : "border-amber-200 bg-amber-50 text-amber-800"
                                  }`}
                                >
                                  School <b>{r.flags.overlapsLikelySchoolBreak ? "Likely" : "Maybe"}</b>
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

      {/* Unlock modal */}
      {showUnlockModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          onClick={() => { track("pdf_unlock_abandoned", { reason: "backdrop" }); setShowUnlockModal(false); }}
        >
          <div
            className="w-full max-w-[520px] bg-white rounded-2xl p-[18px] border border-gray-100"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="unlock-title"
            aria-describedby="unlock-desc"
            tabIndex={-1}
            ref={unlockModalRef}
            onKeyDown={onUnlockModalKeyDown}
          >
            <div className="flex justify-between items-center gap-3">
              <div>
                <div id="unlock-title" className="text-lg font-extrabold">Unlock PDF Export (Beta)</div>
                <div id="unlock-desc" className="text-[13px] opacity-75 mt-1">
                  Enter your email so I can notify you when Pro is live. PDF export unlocks immediately on this device.
                </div>
              </div>
              <button
                type="button"
                onClick={() => { track("pdf_unlock_abandoned", { reason: "x_button" }); setShowUnlockModal(false); }}
                className="border border-gray-300 bg-white rounded-lg px-2.5 py-2 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="mt-3.5 grid gap-2.5">
              <label className="grid gap-1.5">
                <span className="font-semibold">Email</span>
                <input
                  ref={emailInputRef}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@email.com"
                  className={controlClass}
                  autoComplete="email"
                />
              </label>

              <div className="flex gap-2.5 flex-wrap">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={who === "parent"} onChange={() => setWho("parent")} />
                  <span>Parent</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={who === "non-parent"} onChange={() => setWho("non-parent")} />
                  <span>Not a parent</span>
                </label>
              </div>

              <label className="grid gap-1.5">
                <span className="font-semibold">When do you usually travel? (optional)</span>
                <input
                  value={targetMonth}
                  onChange={(e) => setTargetMonth(e.target.value)}
                  placeholder="e.g., Spring break, July, Thanksgiving"
                  className={controlClass}
                />
              </label>

              <div className="flex gap-2.5 justify-end mt-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => { track("pdf_unlock_abandoned", { reason: "cancel" }); setShowUnlockModal(false); }}
                  className="px-3.5 py-2.5 rounded-xl border border-gray-300 bg-white cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    setUnlockError("");
                    setUnlockSubmitting(true);
                    try {
                      const res = await fetch("https://formspree.io/f/xbdazol", {
                        method: "POST",
                        headers: { "Content-Type": "application/json", Accept: "application/json" },
                        body: JSON.stringify({
                          email, who, travelTiming: targetMonth,
                          ptoDays, hasKids, year, state, tripMode, weekdaysOnly, schoolBreakMode,
                          travelWindow: travelStart && travelEnd ? `${travelStart} → ${travelEnd}` : "Any",
                        }),
                      });
                      if (!res.ok) throw new Error("Couldn't submit right now. You can still continue.");
                      track("pdf_unlock_completed", { who });
                      window.localStorage.setItem("leavelift_beta_unlocked", "true");
                      setIsBetaUnlocked(true);
                      setShowUnlockModal(false);
                      exportPlanToPDF();
                    } catch (e: any) {
                      setUnlockError(e?.message || "Something went wrong.");
                    } finally {
                      setUnlockSubmitting(false);
                    }
                  }}
                  disabled={!email.includes("@") || unlockSubmitting}
                  className={`px-3.5 py-2.5 rounded-xl border border-gray-300 text-white ${email.includes("@") ? "bg-gray-900 cursor-pointer" : "bg-gray-400 cursor-not-allowed"}`}
                >
                  {unlockSubmitting ? "Unlocking..." : "Unlock & Export PDF"}
                </button>
              </div>

              {unlockError && (
                <div className="grid gap-2">
                  <div className="text-[#b00020] text-[13px]">{unlockError}</div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => { track("pdf_unlock_completed", { who, fallback: true }); unlockLocallyAndExport(); }}
                      className="px-3.5 py-2.5 rounded-xl border border-gray-300 bg-white cursor-pointer"
                    >
                      Continue without submitting
                    </button>
                  </div>
                </div>
              )}

              <div className="text-xs opacity-70">
                Note: this unlock is stored on this browser/device. (No account yet.)
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share card modal */}
      {showShareCard && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50"
          onClick={() => setShowShareCard(false)}
        >
          <div
            className="w-full max-w-[520px] bg-white rounded-2xl p-[18px] border border-gray-100"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-title"
          >
            <div className="flex justify-between items-center gap-3">
              <div>
                <div id="share-title" className="text-lg font-extrabold">Share your PTO win</div>
                <div className="text-[13px] opacity-75 mt-1">
                  Send this to a friend. Same PTO, more life.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowShareCard(false)}
                className="border border-gray-300 bg-white rounded-lg px-2.5 py-2 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {bestWindow ? (
              <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50 p-4 shadow-sm">
                    <div className="flex items-center gap-2">
                      <img
                        src="/brand/wordmark-transparent.png"
                        alt="Leavelift"
                        className="h-10 w-auto object-contain"
                      />
                    </div>
                <div className="text-sm text-gray-600">I turned</div>
                <div className="mt-1 text-2xl font-extrabold tracking-tight">
                  {bestWindow.ptoUsed} PTO → {bestWindow.totalDays} Days Off
                </div>
                      <div className="mt-2 text-sm text-gray-600 font-mono">
                        {bestWindow.start} → {bestWindow.end} · {locationLabel()} · {year}
                      </div>

                {Math.max(0, bestWindow.totalDays - bestWindow.ptoUsed) > 0 && (
                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
                    <div className="flex items-center gap-2 text-emerald-900 font-semibold">
                      <span className="inline-flex items-center justify-center h-7 w-7 rounded-full bg-emerald-600 text-white text-sm">
                        ✓
                      </span>
                      <span>
                        You gained{" "}
                        <b>{Math.max(0, bestWindow.totalDays - bestWindow.ptoUsed)}</b> extra free{" "}
                        {plural(Math.max(0, bestWindow.totalDays - bestWindow.ptoUsed), "day", "days")}.
                      </span>
                    </div>
                  </div>
                )}

                <div className="mt-3 text-xs text-gray-500">
                  Built with Leavelift
                </div>

                <div className="mt-3 flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.href).then(() => {
                        setShareCopied(true);
                        setTimeout(() => setShareCopied(false), 2000);
                        track("share_link_copied");
                      });
                    }}
                    className="px-3.5 py-2 rounded-xl border border-gray-300 bg-white cursor-pointer"
                  >
                    {shareCopied ? "Copied!" : "Copy link"}
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      track("share_native_clicked");
                      const msg = shareMessageForWindow(bestWindow);
                      // Native share when available; otherwise copy the message for convenience.
                      if (navigator.share) {
                        try {
                          await navigator.share({
                            title: "Leavelift",
                            text: msg,
                            url: window.location.href,
                          });
                        } catch {
                          // ignore (cancel, etc.)
                        }
                        return;
                      }
                      try {
                        await navigator.clipboard.writeText(msg);
                        setShareCopied(true);
                        setTimeout(() => setShareCopied(false), 2000);
                      } catch {
                        // ignore
                      }
                    }}
                    className="px-3.5 py-2 rounded-xl border border-gray-300 bg-gray-900 text-white cursor-pointer"
                  >
                    Share
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-4 text-sm text-gray-700">
                Generate results first, then you’ll be able to share your best window.
              </div>
            )}
          </div>
        </div>
      )}
      </main>
      </div>
    </div>
  );
}
