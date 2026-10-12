import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";

const source = await readFile(
  new URL("./usageStatistics.ts", import.meta.url),
  "utf8",
);
const { code } = await transform(source, { loader: "ts", format: "esm" });
const {
  aggregateStatistics,
  daysInMonth,
  formatAudioDuration,
  getAvailableYears,
  shiftMonth,
  buildHeatmap,
  isStatisticsPointKnown,
} = await import(
  "data:text/javascript;base64," + Buffer.from(code).toString("base64")
);

// Break caught: pretracking/future dates painted as zero activity or weekdays shifted.
test("annual heatmap preserves calendar alignment and unknown dates", () => {
  const weeks = buildHeatmap(
    {
      total_words: 8,
      total_audio_ms: 1000,
      tracking_started_day: "2024-02-28",
      daily: [
        {
          day: "2024-02-29",
          words: 8,
          audio_ms: 1000,
          records: 0,
          records_complete: false,
        },
      ],
    },
    2024,
    "2024-03-01",
  );
  const cells = weeks.flat().filter(Boolean);
  assert.equal(cells.length, 366);
  assert.equal(weeks[0][0], null); // Monday-start; Jan 1 2024 is Monday (Sunday blank).
  assert.equal(weeks[0][1].date, "2024-01-01");
  assert.equal(cells.find((c) => c.date === "2024-02-27").state, "untracked");
  assert.equal(cells.find((c) => c.date === "2024-02-28").count, 0);
  assert.equal(cells.find((c) => c.date === "2024-02-29").count, 8);
  assert.equal(cells.find((c) => c.date === "2024-03-02").state, "future");
});
test("chart gaps unknown history but retains persisted clock-change dates", () => {
  const data = {
    tracking_started_day: "2025-10-12",
    daily: [{ day: "2025-11-01", words: 5, audio_ms: 1000 }],
  };
  assert.equal(isStatisticsPointKnown(data, "2025-10-11", "2025-10-12"), false);
  assert.equal(isStatisticsPointKnown(data, "2025-10-12", "2025-10-12"), true);
  assert.equal(isStatisticsPointKnown(data, "2025-10-13", "2025-10-12"), false);
  assert.equal(isStatisticsPointKnown(data, "2025-11-01", "2025-10-12"), true);
  assert.equal(isStatisticsPointKnown(data, "2025-11", "2025-10-12"), true);
  assert.equal(isStatisticsPointKnown(data, "2024", "2025-10-12"), false);
});

const stats = {
  total_words: 26,
  total_audio_ms: 21000,
  tracking_started_day: "2024-02-28",
  daily: [
    { day: "2024-02-28", words: 10, audio_ms: 10000 },
    { day: "2024-02-29", words: 5, audio_ms: 2500 },
    { day: "2024-03-01", words: 4, audio_ms: 1500 },
    { day: "2025-01-02", words: 7, audio_ms: 7000 },
  ],
};

// Break caught: omitted zero days or incorrect leap-year/month length.
test("day series fills all 29 days in leap February", () => {
  const points = aggregateStatistics(stats, "day", 2024, 2, "2025-10-12");
  assert.equal(points.length, 29);
  assert.deepEqual(points[0], { day: "2024-02-01", words: 0, audio_ms: 0 });
  assert.deepEqual(points[27], {
    day: "2024-02-28",
    words: 10,
    audio_ms: 10000,
  });
  assert.deepEqual(points[28], { day: "2024-02-29", words: 5, audio_ms: 2500 });
});
test("day series excludes adjacent months and years", () => {
  const points = aggregateStatistics(stats, "day", 2024, 3, "2025-10-12");
  assert.equal(points.length, 31);
  assert.deepEqual(points[0], { day: "2024-03-01", words: 4, audio_ms: 1500 });
  assert.deepEqual(points[30], { day: "2024-03-31", words: 0, audio_ms: 0 });
});
// Break caught: wrong period filter or mixing the words/audio measures.
test("month series aggregates only the selected year and fills 12 months", () => {
  const points = aggregateStatistics(stats, "month", 2024, 2, "2025-10-12");
  assert.equal(points.length, 12);
  assert.deepEqual(points[1], { day: "2024-02", words: 15, audio_ms: 12500 });
  assert.deepEqual(points[2], { day: "2024-03", words: 4, audio_ms: 1500 });
  assert.deepEqual(points[0], { day: "2024-01", words: 0, audio_ms: 0 });
});
test("year series includes every available year with empty gaps", () => {
  const data = {
    ...stats,
    daily: [...stats.daily, { day: "2027-01-01", words: 3, audio_ms: 4000 }],
  };
  assert.deepEqual(aggregateStatistics(data, "year", 2024, 2, "2027-10-12"), [
    { day: "2024", words: 19, audio_ms: 14000 },
    { day: "2025", words: 7, audio_ms: 7000 },
    { day: "2026", words: 0, audio_ms: 0 },
    { day: "2027", words: 3, audio_ms: 4000 },
  ]);
});
test("initial empty statistics are a zero chart, not missing data", () => {
  const empty = {
    total_words: 0,
    total_audio_ms: 0,
    tracking_started_day: "2026-10-12",
    daily: [],
  };
  const points = aggregateStatistics(empty, "day", 2026, 10, "2026-10-12");
  assert.equal(points.length, 31);
  assert.deepEqual(points[11], { day: "2026-10-12", words: 0, audio_ms: 0 });
  assert.deepEqual(aggregateStatistics(empty, "year", 2026, 10, "2026-10-12"), [
    { day: "2026", words: 0, audio_ms: 0 },
  ]);
});
// The DB contains only post-update usage, including earlier local travel dates.
test("westward travel preserves valid usage before the tracking calendar day", () => {
  const data = {
    ...stats,
    daily: [
      { day: "2024-02-01", words: 999, audio_ms: 999000 },
      ...stats.daily,
    ],
  };
  assert.deepEqual(
    aggregateStatistics(data, "month", 2024, 2, "2025-10-12")[1],
    { day: "2024-02", words: 1014, audio_ms: 1011500 },
  );
});
test("available years include usage earlier than the tracking year", () => {
  const data = {
    ...stats,
    daily: [{ day: "2023-12-31", words: 6, audio_ms: 2000 }, ...stats.daily],
  };
  assert.deepEqual(getAvailableYears(data, "2025-01-01"), [2023, 2024, 2025]);
  assert.deepEqual(
    aggregateStatistics(data, "year", 2024, 2, "2025-01-01")[0],
    { day: "2023", words: 6, audio_ms: 2000 },
  );
});
test("latest recorded year stays available after moving the local clock backward", () => {
  assert.deepEqual(getAvailableYears(stats, "2023-12-31"), [2024, 2025]);
});
test("duplicate dates are combined without changing the source", () => {
  const data = {
    ...stats,
    daily: [...stats.daily, { day: "2024-02-29", words: 2, audio_ms: 500 }],
  };
  const before = JSON.stringify(data);
  assert.deepEqual(
    aggregateStatistics(data, "day", 2024, 2, "2025-10-12")[28],
    { day: "2024-02-29", words: 7, audio_ms: 3000 },
  );
  assert.equal(JSON.stringify(data), before);
});
test("invalid calendar dates do not spill into other months", () => {
  const data = {
    ...stats,
    daily: [
      { day: "2024-02-30", words: 999, audio_ms: 999000 },
      ...stats.daily,
    ],
  };
  assert.deepEqual(
    aggregateStatistics(data, "month", 2024, 2, "2025-10-12")[1],
    { day: "2024-02", words: 15, audio_ms: 12500 },
  );
});
for (const [year, month, count] of [
  [2023, 2, 28],
  [2024, 2, 29],
  [1900, 2, 28],
  [2000, 2, 29],
  [2026, 4, 30],
  [2026, 12, 31],
]) {
  test(`month length ${year}-${month} is ${count}`, () =>
    assert.equal(daysInMonth(year, month), count));
}
test("year navigation includes tracking start even when there are no rows", () => {
  assert.deepEqual(
    getAvailableYears({ ...stats, daily: [] }, "2026-10-12"),
    [2024, 2025, 2026],
  );
});
test("month navigation crosses year boundaries", () => {
  assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
  assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
});
for (const [ms, duration] of [
  [0, "0:00"],
  [999, "0:00"],
  [1000, "0:01"],
  [61000, "1:01"],
  [3600000, "1:00:00"],
  [3661000, "1:01:01"],
  [90061000, "25:01:01"],
]) {
  test(`dictation recording duration ${ms}ms formats as ${duration}`, () =>
    assert.equal(formatAudioDuration(ms), duration));
}
