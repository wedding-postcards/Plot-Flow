import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { useUsageStatistics } from "./useUsageStatistics";
import { formatPointDate } from "./StatisticsChart";
import { MonoRoundedLineChart } from "./MonoRoundedLineChart";
import { MonoActivityHeatmap } from "./MonoActivityHeatmap";
import {
  aggregateStatistics,
  formatAudioDuration,
  getAvailableYears,
  getStatisticsDateBounds,
  type StatisticsPeriod,
} from "./usageStatistics";

function localToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function StatisticsSettings() {
  const { t, i18n } = useTranslation();
  const theme = "dark";
  const { data, loading, error, retry } = useUsageStatistics();
  const today = localToday();
  const [period, setPeriod] = useState<StatisticsPeriod>("day");
  const [metric, setMetric] = useState<"words" | "audio">("words");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [heatmapYear, setHeatmapYear] = useState(Number(today.slice(0, 4)));
  const [windowIndex, setWindowIndex] = useState(
    Math.min(
      2,
      Math.floor(
        (Math.floor(
          (Date.parse(today + "T00:00:00Z") -
            Date.parse(today.slice(0, 4) + "-01-01T00:00:00Z")) /
            86400000,
        ) +
          new Date(today.slice(0, 4) + "-01-01T00:00:00Z").getUTCDay()) /
          140,
      ),
    ),
  );
  const bounds = useMemo(
    () =>
      data
        ? getStatisticsDateBounds(data, today)
        : { firstDay: today, lastDay: today },
    [data, today],
  );
  const firstMonth = bounds.firstDay.slice(0, 7);
  const lastMonth = bounds.lastDay.slice(0, 7);
  const selectedMonth =
    month < firstMonth ? firstMonth : month > lastMonth ? lastMonth : month;
  const [dayYear, dayMonth] = selectedMonth.split("-").map(Number);
  const years = useMemo(
    () => (data ? getAvailableYears(data, today) : []),
    [data, today],
  );
  const selectedYear = years.includes(year) ? year : years[years.length - 1];
  const points = useMemo(
    () =>
      data
        ? aggregateStatistics(
            data,
            period,
            period === "day" ? dayYear : selectedYear,
            dayMonth,
            today,
          )
        : [],
    [data, period, dayYear, selectedYear, dayMonth, today],
  );

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      <h1 className="text-lg font-semibold">{t("statistics.title")}</h1>
      {loading && (
        <p role="status" className="text-sm text-mid-gray">
          {t("statistics.loading")}
        </p>
      )}
      {error && (
        <div
          role="alert"
          className="px-4 py-2 text-sm border border-mid-gray/20 rounded-lg"
        >
          <p>{t("statistics.error")}</p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={retry}
            className="mt-2"
          >
            {t("plotFlow.retry")}
          </Button>
        </div>
      )}
      {data && (
        <>
          <section
            aria-label={t("statistics.totals")}
            className={`rounded-3xl p-3.5 sm:p-4 border ${theme === "dark" ? "bg-[#141414] text-white border-white/[0.08] shadow-[0_4px_20px_rgba(0,0,0,0.3)]" : "bg-white border-neutral-200 text-black shadow-[0_4px_20px_rgba(0,0,0,0.04)]"}`}
          >
            <dl className="flex flex-wrap gap-6 px-4 py-3">
              <div>
                <dt className="text-xs text-mid-gray">
                  {t("statistics.totalWords")}
                </dt>
                <dd className="text-xl sm:text-2xl font-bold tracking-tight tabular-nums font-sans">
                  {data.total_words.toLocaleString(i18n.language)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-mid-gray">
                  {t("statistics.totalRecords")}
                </dt>
                <dd
                  data-statistic="records"
                  className="text-xl sm:text-2xl font-bold tracking-tight tabular-nums font-sans"
                >
                  {data.records_complete === true
                    ? (data.total_records ?? 0).toLocaleString(i18n.language)
                    : (data.total_records ?? 0) > 0
                      ? `≥${data.total_records!.toLocaleString(i18n.language)}`
                      : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-mid-gray">
                  {t("statistics.totalAudio")}
                </dt>
                <dd className="text-xl sm:text-2xl font-bold tracking-tight tabular-nums font-sans">
                  {formatAudioDuration(data.total_audio_ms)}
                </dd>
              </div>
            </dl>
          </section>
          <div className="text-xs text-mid-gray space-y-1">
            <p>
              {t("statistics.trackingSince", {
                date: formatPointDate(
                  data.tracking_started_day,
                  "day",
                  i18n.language,
                ),
              })}
            </p>
            <p>{t("statistics.localNote")}</p>
            <p>{t("statistics.audioNote")}</p>
            {data.records_complete !== true && (
              <p>{t("statistics.recordsNote")}</p>
            )}
          </div>
          <div
            data-statistics-cards
            className="grid grid-cols-2 gap-6 sm:gap-7 text-white"
          >
            <MonoActivityHeatmap
              stats={data}
              today={today}
              years={years}
              year={
                years.includes(heatmapYear)
                  ? heatmapYear
                  : years[years.length - 1]
              }
              setYear={setHeatmapYear}
              windowIndex={windowIndex}
              setWindowIndex={setWindowIndex}
            />
            <MonoRoundedLineChart
              stats={data}
              today={today}
              points={points}
              metric={metric}
              setMetric={setMetric}
              period={period}
              setPeriod={setPeriod}
              month={selectedMonth}
              setMonth={setMonth}
              firstMonth={firstMonth}
              lastMonth={lastMonth}
              year={selectedYear}
              setYear={setYear}
              years={years}
            />
          </div>
        </>
      )}
    </div>
  );
}
