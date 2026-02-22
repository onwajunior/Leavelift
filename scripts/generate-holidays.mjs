// scripts/generate-holidays.mjs
// Run with: node scripts/generate-holidays.mjs
// Generates data/holidays.us.2025-2035.json for all 50 US states

import Holidays from "date-holidays";
import { writeFileSync } from "fs";

const YEARS = [2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035];

const STATES = {
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

const allHolidays = [];

for (const [stateCode, stateName] of Object.entries(STATES)) {
  const hd = new Holidays("US", stateCode);

  for (const year of YEARS) {
    const raw = hd.getHolidays(year);

    for (const h of raw) {
      // Only include public holidays (actual days off)
      if (h.type !== "public") continue;

      // Extract the YYYY-MM-DD date (the `date` field is "YYYY-MM-DD HH:MM:SS")
      const date = h.date.split(" ")[0];

      allHolidays.push({
        date,
        name: h.name,
        state: stateCode,
        substitute: h.substitute === true,
      });
    }
  }

  console.log(`✓ ${stateCode} (${stateName})`);
}

// Sort by date then state for readability
allHolidays.sort((a, b) => a.date.localeCompare(b.date) || a.state.localeCompare(b.state));

const outputPath = "./data/holidays.us.2025-2035.json";
writeFileSync(outputPath, JSON.stringify(allHolidays, null, 2));

console.log(`\n✅ Generated ${allHolidays.length} holidays across ${Object.keys(STATES).length} states × ${YEARS.length} years`);
console.log(`📁 Saved to ${outputPath}`);
