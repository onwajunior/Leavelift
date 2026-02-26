// scripts/generate-holidays-global.mjs
// Run with: node scripts/generate-holidays-global.mjs
//
// Generates:
// - data/holidays.global.2025-2035.json
// - data/holiday_subdivisions.json
//
// Uses date-holidays' built-in country/subdivision structure.

import Holidays from "date-holidays";
import { writeFileSync } from "fs";

const YEARS = [2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035];

// Keep this list small/curated; expand over time.
const COUNTRIES = {
  US: "United States",
  GB: "United Kingdom",
  PL: "Poland",
  IE: "Ireland",
  DE: "Germany",
  FR: "France",
  NL: "Netherlands",
  BE: "Belgium",
  SA: "Saudi Arabia",
  SG: "Singapore",
};

const hd = new Holidays();

function publicHolidaysFor(year) {
  return hd
    .getHolidays(year)
    .filter((h) => h.type === "public")
    .map((h) => ({
      date: h.date.split(" ")[0],
      name: h.name,
      substitute: h.substitute === true,
    }));
}

const allHolidays = [];
const subdivisions = {};

for (const [country, countryName] of Object.entries(COUNTRIES)) {
  const states = hd.getStates(country) || {};
  const stateEntries = Object.entries(states);

  if (stateEntries.length === 0) {
    // National holidays only
    hd.init(country);
    subdivisions[country] = [];
    for (const year of YEARS) {
      for (const h of publicHolidaysFor(year)) {
        allHolidays.push({ ...h, country });
      }
    }
    console.log(`✓ ${country} (${countryName}) — national`);
    continue;
  }

  // Subdivision-specific holidays
  subdivisions[country] = stateEntries
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.code.localeCompare(b.code));

  for (const [sub, subName] of stateEntries) {
    hd.init(country, sub);
    for (const year of YEARS) {
      for (const h of publicHolidaysFor(year)) {
        allHolidays.push({ ...h, country, state: sub });
      }
    }
    console.log(`✓ ${country}-${sub} (${countryName} — ${subName})`);
  }
}

allHolidays.sort((a, b) => {
  const d = a.date.localeCompare(b.date);
  if (d) return d;
  const c = (a.country || "").localeCompare(b.country || "");
  if (c) return c;
  return (a.state || "").localeCompare(b.state || "");
});

writeFileSync("./data/holidays.global.2025-2035.json", JSON.stringify(allHolidays, null, 2));
writeFileSync("./data/holiday_subdivisions.json", JSON.stringify({ countries: COUNTRIES, subdivisions }, null, 2));

console.log(`\n✅ Generated ${allHolidays.length} holidays across ${Object.keys(COUNTRIES).length} countries × ${YEARS.length} years`);
