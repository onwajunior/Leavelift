type Holiday = {
  date: string;    // YYYY-MM-DD
  name: string;
  state: string;   // e.g. "CA", "TX"
  substitute: boolean;
};

type SchoolWindow = {
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  label: string;
  confidence: "LIKELY" | "VERY_LIKELY" | "MAY_CONFLICT" | "APPROXIMATE";
  states?: string[]; // if present, window only applies to these states
};

export type CustomBreakType = "SCHOOL_BREAK" | "OFFICE_CLOSED" | "BLACKOUT";

export type CustomBreak = {
  id: string;
  type: CustomBreakType;
  start: string; // YYYY-MM-DD
  end: string;   // YYYY-MM-DD
  label: string;
};

export type RankedWindow = {
  start: string;
  end: string;
  totalDays: number;
  ptoUsed: number;
  weekendsUsed: number;
  holidaysUsed: number;
  holidayNames: string[];
  efficiency: number;
  score: number;
  flags: {
    overlapsLikelySchoolBreak: boolean | null;
  };
};

function parseDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatISO(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function daysInclusive(start: Date, end: Date): number {
  const ms = 24 * 60 * 60 * 1000;
  return Math.floor((end.getTime() - start.getTime()) / ms) + 1;
}

function isWeekend(d: Date): boolean {
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

function isWeekday(d: Date): boolean {
  return !isWeekend(d);
}

function countWeekends(start: Date, end: Date): number {
  let c = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (isWeekend(d)) c++;
  }
  return c;
}

function countWeekdays(start: Date, end: Date): number {
  let c = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (isWeekday(d)) c++;
  }
  return c;
}

function holidayNamesWithin(
  start: Date,
  end: Date,
  holidayMap: Map<string, string>,
  weekdaysOnly: boolean
): string[] {
  const names = new Set<string>();
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (weekdaysOnly && !isWeekday(d)) continue;
    const name = holidayMap.get(formatISO(d));
    if (name) names.add(name);
  }
  return Array.from(names);
}

function countHolidayDays(start: Date, end: Date, holidaysSet: Set<string>): number {
  let c = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    if (holidaysSet.has(formatISO(d))) c++;
  }
  return c;
}

function overlaps(start: Date, end: Date, wStart: Date, wEnd: Date): boolean {
  return start <= wEnd && end >= wStart;
}

function clampToYear(startISO: string, endISO: string, year: number): { start: Date; end: Date } | null {
  const a = parseDate(startISO);
  const b = parseDate(endISO);
  const start = a <= b ? a : b;
  const end = a <= b ? b : a;
  const yearStart = parseDate(`${year}-01-01`);
  const yearEnd = parseDate(`${year}-12-31`);
  if (end < yearStart || start > yearEnd) return null;
  return { start: start < yearStart ? yearStart : start, end: end > yearEnd ? yearEnd : end };
}

function expandWeekdayISODatesInRange(startISO: string, endISO: string, year: number): string[] {
  const clamped = clampToYear(startISO, endISO, year);
  if (!clamped) return [];
  const out: string[] = [];
  for (let d = clamped.start; d <= clamped.end; d = addDays(d, 1)) {
    if (!isWeekday(d)) continue;
    out.push(formatISO(d));
  }
  return out;
}

function mergeHolidayName(holidayMap: Map<string, string>, iso: string, name: string) {
  const existing = holidayMap.get(iso);
  if (!existing) {
    holidayMap.set(iso, name);
    return;
  }
  if (existing === name) return;
  if (existing.includes(name)) return;
  holidayMap.set(iso, `${existing}, ${name}`);
}

function daysBetweenISO(a: string, b: string): number {
  const ms = 24 * 60 * 60 * 1000;
  return Math.abs(Math.floor((parseDate(a).getTime() - parseDate(b).getTime()) / ms));
}

export type EmptyReason =
  | "no_holidays_for_state_year"
  | "school_break_too_restrictive"
  | "travel_window_too_narrow"
  | "pto_too_low"
  | "unknown";

export function diagnoseEmptyResults(params: {
  year: number;
  state?: string;
  ptoDays: number;
  hasKids: boolean;
  holidays: Holiday[];
  schoolWindows: SchoolWindow[];
  customBreaks?: CustomBreak[];
  lengths: number[];
  schoolBreakMode: "ANY" | "REQUIRE";
  dateRange?: { start: string; end: string };
}): EmptyReason {
  const { year, state, ptoDays, hasKids, holidays, schoolWindows, customBreaks = [], lengths, schoolBreakMode, dateRange } = params;

  // 1. No holiday data for this state/year combination?
  const yearStateHolidays = holidays.filter(
    (h) => h.date.startsWith(String(year)) && (!state || h.state === state)
  );
  if (yearStateHolidays.length === 0) return "no_holidays_for_state_year";

  // 2. School break REQUIRE mode — are there even any school windows for this state/year?
  if (hasKids && schoolBreakMode === "REQUIRE") {
    const baseRelevantWindows = schoolWindows.filter((w) => {
      if (state && w.states && w.states.length > 0 && !w.states.includes(state)) return false;
      const ws = parseDate(w.start);
      const we = parseDate(w.end);
      const yearStart = parseDate(`${year}-01-01`);
      const yearEnd = parseDate(`${year}-12-31`);
      return ws <= yearEnd && we >= yearStart;
    });
    const customSchoolWindows: SchoolWindow[] = customBreaks
      .filter((b) => b.type === "SCHOOL_BREAK")
      .map((b) => ({
        start: b.start,
        end: b.end,
        label: b.label || "Custom school break",
        confidence: "LIKELY" as const,
      }));

    const relevantWindows = [...baseRelevantWindows, ...customSchoolWindows].filter((w) => {
      const ws = parseDate(w.start);
      const we = parseDate(w.end);
      const yearStart = parseDate(`${year}-01-01`);
      const yearEnd = parseDate(`${year}-12-31`);
      return ws <= yearEnd && we >= yearStart;
    });
    // Check if the longest trip length could fit inside any school window
    const maxLen = Math.max(...lengths);
    const anyFits = relevantWindows.some((w) => {
      return daysInclusive(parseDate(w.start), parseDate(w.end)) >= maxLen;
    });
    if (!anyFits) return "school_break_too_restrictive";
  }

  // 3. Travel window too narrow for the requested trip lengths?
  if (dateRange) {
    const rangeStart = parseDate(dateRange.start);
    const rangeEnd = parseDate(dateRange.end);
    const windowLen = daysInclusive(rangeStart, rangeEnd);
    const minLen = Math.min(...lengths);
    if (windowLen < minLen) return "travel_window_too_narrow";
  }

  // 4. Assume PTO is too low (couldn't find any window that fits within budget)
  return "pto_too_low";
}

export function buildTopWindows(params: {
  year?: number;
  state?: string;
  ptoDays: number;
  hasKids: boolean;
  holidays: Holiday[];
  schoolWindows: SchoolWindow[];
  customBreaks?: CustomBreak[];
  lengths?: number[];
  topN?: number;
  rankingMode?: "EFFICIENCY" | "BEST" | "FIXED_TARGET";
  targetLength?: number;
  weekdaysOnly?: boolean;
  schoolBreakMode?: "ANY" | "REQUIRE";
  dateRange?: { start: string; end: string };
}): RankedWindow[] {
  const {
    year = 2026,
    state,
    ptoDays,
    hasKids,
    holidays,
    schoolWindows,
    customBreaks = [],
    lengths = [7, 9, 11],
    topN = 3,
    rankingMode = "EFFICIENCY",
    weekdaysOnly = false,
    schoolBreakMode = "ANY",
    dateRange,
  } = params;

  // Filter holidays by state and year
  const yearHolidays = holidays.filter(
    (h) =>
      h.date.startsWith(String(year)) &&
      (!state || h.state === state)
  );

  const holidayMap = new Map(yearHolidays.map((h) => [h.date, h.name]));
  const holidaysSet = new Set(yearHolidays.map((h) => h.date));

  // Custom office closures behave like "extra holidays" on weekdays (weekends are already free)
  const officeClosed = customBreaks.filter((b) => b.type === "OFFICE_CLOSED");
  for (const b of officeClosed) {
    const dates = expandWeekdayISODatesInRange(b.start, b.end, year);
    for (const iso of dates) {
      holidaysSet.add(iso);
      mergeHolidayName(holidayMap, iso, b.label || "Office closed");
    }
  }

  // Weekday-only holidays set (exclude weekend holidays)
  const weekdayHolidaysSet = new Set(
    [...holidaysSet].filter((iso) => isWeekday(parseDate(iso)))
  );

  // Filter school windows to those applicable for this state and year range
  const baseRelevantSchoolWindows = schoolWindows.filter((w) => {
    // If window has a states list, only use it when our state matches
    if (state && w.states && w.states.length > 0 && !w.states.includes(state)) return false;
    // Must overlap with the selected year
    const ws = parseDate(w.start);
    const we = parseDate(w.end);
    const yearStart = parseDate(`${year}-01-01`);
    const yearEnd = parseDate(`${year}-12-31`);
    return ws <= yearEnd && we >= yearStart;
  });

  const customSchoolWindows: SchoolWindow[] = customBreaks
    .filter((b) => b.type === "SCHOOL_BREAK")
    .map((b) => ({
      start: b.start,
      end: b.end,
      label: b.label || "Custom school break",
      confidence: "LIKELY" as const,
    }))
    .filter((w) => {
      const ws = parseDate(w.start);
      const we = parseDate(w.end);
      const yearStart = parseDate(`${year}-01-01`);
      const yearEnd = parseDate(`${year}-12-31`);
      return ws <= yearEnd && we >= yearStart;
    });

  const relevantSchoolWindows = [...baseRelevantSchoolWindows, ...customSchoolWindows];

  const blackoutRanges = customBreaks
    .filter((b) => b.type === "BLACKOUT")
    .map((b) => ({ start: parseDate(b.start), end: parseDate(b.end) }));

  const start0 = parseDate(`${year}-01-01`);
  const end0 = parseDate(`${year}-12-31`);

  const candidates: RankedWindow[] = [];

  for (let start = start0; start <= end0; start = addDays(start, 1)) {
    for (const len of lengths) {
      const end = addDays(start, len - 1);
      if (end > end0) continue;

      // Travel window filter
      if (dateRange) {
        const rangeStart = parseDate(dateRange.start);
        const rangeEnd = parseDate(dateRange.end);
        if (start < rangeStart || end > rangeEnd) continue;
      }

      // School break REQUIRE: the entire window must be inside a school break
      if (hasKids && schoolBreakMode === "REQUIRE") {
        const insideAnyBreak = relevantSchoolWindows.some((w) => {
          const ws = parseDate(w.start);
          const we = parseDate(w.end);
          return start >= ws && end <= we;
        });
        if (!insideAnyBreak) continue;
      }

      // Blackout windows: exclude any candidate that overlaps a blackout range
      if (blackoutRanges.length > 0) {
        const overlapsBlackout = blackoutRanges.some((b) => overlaps(start, end, b.start, b.end));
        if (overlapsBlackout) continue;
      }

      const total = weekdaysOnly ? countWeekdays(start, end) : daysInclusive(start, end);
      const weekends = weekdaysOnly ? 0 : countWeekends(start, end);
      const holidayDays = countHolidayDays(
        start,
        end,
        weekdaysOnly ? weekdayHolidaysSet : holidaysSet
      );

      const free = weekdaysOnly ? holidayDays : weekends + holidayDays;
      const ptoUsed = total - free;

      if (ptoUsed < 0) continue;
      if (ptoUsed > ptoDays) continue;

      const holidayNames = holidayNamesWithin(start, end, holidayMap, weekdaysOnly);
      const efficiency = ptoUsed === 0 ? 999 : total / ptoUsed;

      let kidsPenalty = 0;
      let overlapsLikelySchoolBreak: boolean | null = null;

      if (hasKids) {
        overlapsLikelySchoolBreak = relevantSchoolWindows.some((w) =>
          overlaps(start, end, parseDate(w.start), parseDate(w.end))
        );
        if (!overlapsLikelySchoolBreak) kidsPenalty = 0.15;
      }

      const score = efficiency - kidsPenalty;

      candidates.push({
        start: formatISO(start),
        end: formatISO(end),
        totalDays: total,
        ptoUsed,
        weekendsUsed: weekends,
        holidaysUsed: holidayDays,
        holidayNames,
        efficiency: Number(efficiency.toFixed(2)),
        score: Number(score.toFixed(4)),
        flags: { overlapsLikelySchoolBreak },
      });
    }
  }

  if (rankingMode === "BEST") {
    candidates.sort(
      (a, b) =>
        b.totalDays - a.totalDays ||
        a.ptoUsed - b.ptoUsed ||
        b.efficiency - a.efficiency ||
        b.score - a.score
    );
  } else if (rankingMode === "FIXED_TARGET") {
    candidates.sort(
      (a, b) =>
        b.totalDays - a.totalDays ||
        b.efficiency - a.efficiency ||
        a.ptoUsed - b.ptoUsed ||
        b.score - a.score
    );
  } else {
    candidates.sort(
      (a, b) => b.score - a.score || b.totalDays - a.totalDays || a.ptoUsed - b.ptoUsed
    );
  }

  // Diversify results: avoid near-duplicate windows by spacing start dates
  const seen = new Set<string>();
  const out: RankedWindow[] = [];
  const MIN_GAP_DAYS = 7;

  for (const c of candidates) {
    const key = `${c.start}_${c.end}`;
    if (seen.has(key)) continue;

    const tooClose = out.some(
      (picked) => daysBetweenISO(picked.start, c.start) < MIN_GAP_DAYS
    );
    if (tooClose) continue;

    seen.add(key);
    out.push(c);
    if (out.length >= topN) break;
  }

  return out;
}
