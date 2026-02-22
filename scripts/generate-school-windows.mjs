// scripts/generate-school-windows.mjs
// Run with: node scripts/generate-school-windows.mjs
// Generates data/school_windows.us.json with state-level approximate school breaks, 2025-2035.
//
// Spring break is anchored to Easter (varies each year).
// Summer and Winter breaks use typical regional patterns.
// All dates are APPROXIMATE — school calendars vary widely by district.

import { writeFileSync } from "fs";

const YEARS = [2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035];

// US Census regions adapted for school calendar similarity
const STATE_REGIONS = {
  SOUTH: ["AL", "AR", "FL", "GA", "KY", "LA", "MS", "NC", "OK", "SC", "TN", "TX", "VA", "WV"],
  NORTHEAST: ["CT", "DC", "DE", "MA", "MD", "ME", "NH", "NJ", "NY", "PA", "RI", "VT"],
  MIDWEST: ["IA", "IL", "IN", "KS", "MI", "MN", "MO", "ND", "NE", "OH", "SD", "WI"],
  WEST: ["AK", "AZ", "CA", "CO", "HI", "ID", "MT", "NM", "NV", "OR", "UT", "WA", "WY"],
};

// Anonymous algorithm for computing Easter Sunday (UTC)
function getEaster(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(d, n) {
  const x = new Date(d.getTime());
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

function fmt(d) {
  return d.toISOString().split("T")[0];
}

function getLaborDay(year) {
  // Labor Day = first Monday of September
  const d = new Date(Date.UTC(year, 8, 1)); // Sep 1
  while (d.getUTCDay() !== 1) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function allStates() {
  const s = new Set();
  for (const arr of Object.values(STATE_REGIONS)) for (const st of arr) s.add(st);
  return Array.from(s).sort();
}

const ALL_STATES = allStates();

function getRegionForState(state) {
  for (const [region, states] of Object.entries(STATE_REGIONS)) {
    if (states.includes(state)) return region;
  }
  throw new Error(`Unknown state: ${state}`);
}

// Regional patterns:
// spring.offset = days before Easter that spring break STARTS (negative = before Easter)
// spring.duration = length of spring break in days
// summer uses fixed month/day (typical range for the region)
// winter spans Dec of current year → Jan of next year
const REGION_PATTERNS = {
  SOUTH: {
    label: "South",
    spring: { kind: "EASTER", offset: -18, duration: 10 }, // ~2.5 weeks before Easter
    summer: { kind: "FIXED", startM: 5, startD: 26, endM: 8, endD: 11 },
    winter: { startM: 12, startD: 20, endM: 1, endD: 5 },
  },
  NORTHEAST: {
    label: "Northeast",
    spring: { kind: "EASTER", offset: -4, duration: 10 }, // week straddling Easter
    summer: { kind: "FIXED", startM: 6, startD: 20, endM: 9, endD: 3 },
    winter: { startM: 12, startD: 23, endM: 1, endD: 2 },
  },
  MIDWEST: {
    label: "Midwest",
    spring: { kind: "EASTER", offset: -11, duration: 10 }, // ~1.5 weeks before Easter
    summer: { kind: "FIXED", startM: 6, startD: 5, endM: 8, endD: 25 },
    winter: { startM: 12, startD: 21, endM: 1, endD: 3 },
  },
  WEST: {
    label: "West",
    spring: { kind: "EASTER", offset: -14, duration: 10 }, // ~2 weeks before Easter
    summer: { kind: "FIXED", startM: 6, startD: 12, endM: 8, endD: 22 },
    winter: { startM: 12, startD: 20, endM: 1, endD: 5 },
  },
};

const STATE_NAMES = {
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
  NM: "New Mexico",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
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

// State overrides for the most divergent patterns.
// These are still APPROXIMATE and meant to be "closer than regional" on average.
// If we ever ingest real district calendars, this can be replaced with actual data.
const STATE_OVERRIDES = {
  // Earlier summer + spring break tends to be mid-March (not Easter-anchored)
  FL: {
    label: "Florida",
    spring: { kind: "FIXED", startM: 3, startD: 14, duration: 9 }, // Sat→Sun around typical district week
    summer: { kind: "FIXED", startM: 5, startD: 30, endM: 8, endD: 9 },
  },
  TX: {
    label: "Texas",
    spring: { kind: "FIXED", startM: 3, startD: 7, duration: 9 },
    summer: { kind: "FIXED", startM: 5, startD: 23, endM: 8, endD: 16 },
  },

  // NYC data point suggests spring recess very close to Easter week
  NY: {
    label: "New York",
    spring: { kind: "EASTER", offset: -3, duration: 9 }, // often Thu→Fri around Easter week
    summer: { kind: "FIXED", startM: 6, startD: 27, endM: 9, endD: 3 },
    winter: { startM: 12, startD: 24, endM: 1, endD: 2 },
  },
  MA: {
    label: "Massachusetts",
    spring: { kind: "EASTER", offset: -8, duration: 9 }, // frequently week in April, near Easter but not always straddling
    summer: { kind: "FIXED", startM: 6, startD: 24, endM: 9, endD: 1 },
  },

  // Alaska/Hawaii run notably different statewide calendars
  HI: {
    label: "Hawaii",
    spring: { kind: "FIXED", startM: 3, startD: 14, duration: 9 }, // HI DOE ~mid-March week
    summer: { kind: "FIXED", startM: 5, startD: 29, endM: 8, endD: 3 }, // HI DOE typically starts early Aug
    winter: { startM: 12, startD: 22, endM: 1, endD: 2 },
  },
  AK: {
    label: "Alaska",
    spring: { kind: "FIXED", startM: 3, startD: 14, duration: 9 },
    summer: { kind: "FIXED", startM: 5, startD: 26, endM: 8, endD: 20 },
  },

  // Keep these as light touches for common deviations
  DC: {
    label: "District of Columbia",
    summer: { kind: "FIXED", startM: 6, startD: 16, endM: 8, endD: 20 },
  },
};

function resolvePattern(state) {
  const region = getRegionForState(state);
  const base = REGION_PATTERNS[region];
  const o = STATE_OVERRIDES[state];
  return {
    region,
    label: STATE_NAMES[state] ?? o?.label ?? base.label,
    spring: o?.spring ?? base.spring,
    summer: o?.summer ?? base.summer,
    winter: o?.winter ?? base.winter,
  };
}

const outputPath = "./data/school_windows.us.json";
const CHECK_MODE = process.argv.includes("--check");
const windows = [];

for (const year of YEARS) {
  const easter = getEaster(year);

  for (const state of ALL_STATES) {
    const { region, label, spring, summer, winter } = resolvePattern(state);

    // Spring break
    let springStart;
    if (spring.kind === "FIXED") {
      springStart = new Date(Date.UTC(year, spring.startM - 1, spring.startD));
    } else {
      springStart = addDays(easter, spring.offset);
    }
    const springEnd = addDays(springStart, spring.duration - 1);
    windows.push({
      region,
      states: [state],
      start: fmt(springStart),
      end: fmt(springEnd),
      label: `Spring break (approximate, ${label})`,
      confidence: "APPROXIMATE",
    });

    // Summer break
    let summerStart;
    let summerEnd;
    if (summer.kind === "FIXED") {
      summerStart = new Date(Date.UTC(year, summer.startM - 1, summer.startD));
      summerEnd = new Date(Date.UTC(year, summer.endM - 1, summer.endD));
    } else {
      summerStart = new Date(Date.UTC(year, summer.startM - 1, summer.startD));
      const laborDay = getLaborDay(year);
      summerEnd = addDays(laborDay, (summer.endOffsetDays ?? -1));
    }
    windows.push({
      region,
      states: [state],
      start: fmt(summerStart),
      end: fmt(summerEnd),
      label: `Summer break (approximate, ${label})`,
      confidence: "APPROXIMATE",
    });

    // Winter break (Dec of this year → Jan of next year)
    const winterStart = new Date(Date.UTC(year, winter.startM - 1, winter.startD));
    const winterEnd = new Date(Date.UTC(year + 1, winter.endM - 1, winter.endD));
    windows.push({
      region,
      states: [state],
      start: fmt(winterStart),
      end: fmt(winterEnd),
      label: `Winter break (approximate, ${label})`,
      confidence: "APPROXIMATE",
    });
  }
}

const json = JSON.stringify(windows, null, 2);

if (CHECK_MODE) {
  try {
    const { readFileSync } = await import("fs");
    const existing = readFileSync(outputPath, "utf8");
    if (existing !== json) {
      console.error(`❌ ${outputPath} is out of date.`);
      console.error(`   Run: node scripts/generate-school-windows.mjs`);
      process.exit(1);
    }
    console.log(`✅ ${outputPath} is up to date.`);
    process.exit(0);
  } catch {
    console.error(`❌ ${outputPath} not found.`);
    console.error(`   Run: node scripts/generate-school-windows.mjs`);
    process.exit(1);
  }
}

writeFileSync(outputPath, json);

console.log(`✅ Generated ${windows.length} school windows`);
console.log(`   (${YEARS.length} years × ${ALL_STATES.length} states × 3 breaks)`);
console.log(`📁 Saved to ${outputPath}`);

// Preview Easter dates for verification
console.log("\nEaster dates used:");
for (const y of YEARS) {
  console.log(`  ${y}: ${fmt(getEaster(y))}`);
}
