export interface UsageStatistics {
  total_words: number;
  total_audio_ms: number;
  tracking_started_day: string;
  daily: { day: string; words: number; audio_ms: number }[];
}
export type StatisticsPeriod = "day" | "month" | "year";
export type StatisticsPoint = UsageStatistics["daily"][number];

export function daysInMonth(year: number, month: number): number {
  if (month === 2)
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function validDay(day: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const [year, month, date] = day.split("-").map(Number);
  return (
    year >= 1 &&
    month >= 1 &&
    month <= 12 &&
    date >= 1 &&
    date <= daysInMonth(year, month)
  );
}

export function getStatisticsDateBounds(
  stats: UsageStatistics,
  currentDay: string,
) {
  let firstDay = stats.tracking_started_day;
  let lastDay = currentDay > firstDay ? currentDay : firstDay;
  // The registry already contains only post-update usage. Travel or clock
  // changes can legitimately record dates outside the initial calendar day.
  for (const row of stats.daily) {
    if (!validDay(row.day)) continue;
    if (row.day < firstDay) firstDay = row.day;
    if (row.day > lastDay) lastDay = row.day;
  }
  return { firstDay, lastDay };
}

export function getAvailableYears(
  stats: UsageStatistics,
  currentDay: string,
): number[] {
  const bounds = getStatisticsDateBounds(stats, currentDay);
  const first = Number(bounds.firstDay.slice(0, 4));
  const last = Number(bounds.lastDay.slice(0, 4));
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

export function aggregateStatistics(
  stats: UsageStatistics,
  period: StatisticsPeriod,
  year: number,
  month: number,
  currentDay: string,
): StatisticsPoint[] {
  const yearKey = String(year).padStart(4, "0");
  const monthKey = `${yearKey}-${String(month).padStart(2, "0")}`;
  const keys =
    period === "day"
      ? Array.from(
          { length: daysInMonth(year, month) },
          (_, index) => `${monthKey}-${String(index + 1).padStart(2, "0")}`,
        )
      : period === "month"
        ? Array.from(
            { length: 12 },
            (_, index) => `${yearKey}-${String(index + 1).padStart(2, "0")}`,
          )
        : getAvailableYears(stats, currentDay).map((value) =>
            String(value).padStart(4, "0"),
          );
  const points = new Map(
    keys.map((day) => [day, { day, words: 0, audio_ms: 0 }]),
  );
  for (const row of stats.daily) {
    if (!validDay(row.day)) continue;
    const key =
      period === "day" ? row.day : row.day.slice(0, period === "month" ? 7 : 4);
    const point = points.get(key);
    if (point) {
      point.words += row.words;
      point.audio_ms += row.audio_ms;
    }
  }
  return [...points.values()];
}

export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const index = year * 12 + month - 1 + delta;
  return {
    year: Math.floor(index / 12),
    month: (((index % 12) + 12) % 12) + 1,
  };
}

// audio_ms is actual dictation recording time, including pauses, from captured
// samples before resampling. It excludes idle always-on capture and padding,
// and is never recognition runtime.
export function formatAudioDuration(ms: number): string {
  const seconds = Math.floor(Math.max(0, ms) / 1000);
  const minute = Math.floor(seconds / 60);
  const tail = String(seconds % 60).padStart(2, "0");
  return minute < 60
    ? `${minute}:${tail}`
    : `${Math.floor(minute / 60)}:${String(minute % 60).padStart(2, "0")}:${tail}`;
}
