import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "../ui/Button";
import { useUsageStatistics } from "./useUsageStatistics";
import { formatPointDate } from "./StatisticsChart";
import { MonoRoundedLineChart } from "./MonoRoundedLineChart";
import { MonoActivityHeatmap } from "./MonoActivityHeatmap";
import { useStatisticsTheme } from "./useStatisticsTheme";
import {
  aggregateStatistics,
  formatAudioDuration,
  getAvailableYears,
  getStatisticsDateBounds,
  shiftMonth,
  isStatisticsPointKnown,
  type StatisticsPeriod,
} from "./usageStatistics";

function localToday() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function StatisticsSettings() {
  const { t, i18n } = useTranslation();
  const theme = useStatisticsTheme();
  const { data, loading, error, retry } = useUsageStatistics();
  const today = localToday();
  const [period, setPeriod] = useState<StatisticsPeriod>("day");
  const [metric, setMetric] = useState<"words" | "audio">("words");
  const [month, setMonth] = useState(today.slice(0, 7));
  const [year, setYear] = useState(Number(today.slice(0, 4)));
  const [heatmapYear, setHeatmapYear] = useState(Number(today.slice(0, 4)));
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

  const move = (delta: number) => {
    if (period === "day") {
      const next = shiftMonth(dayYear, dayMonth, delta);
      setMonth(`${next.year}-${String(next.month).padStart(2, "0")}`);
    } else setYear(selectedYear + delta);
  };

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
          <MonoActivityHeatmap
            theme={theme}
            stats={data}
            year={
              years.includes(heatmapYear)
                ? heatmapYear
                : years[years.length - 1]
            }
            setYear={setHeatmapYear}
            years={years}
            today={today}
          />
          <section aria-label={t("statistics.trend")}>
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-4">
                <div
                  role="group"
                  aria-label={t("statistics.metric")}
                  className="flex gap-1"
                >
                  {(["words", "audio"] as const).map((value) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={metric === value ? "primary-soft" : "secondary"}
                      aria-pressed={metric === value}
                      onClick={() => setMetric(value)}
                    >
                      {t(`statistics.metrics.${value}`)}
                    </Button>
                  ))}
                </div>
              </div>
              {period !== "year" && (
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    aria-label={t("statistics.previous")}
                    disabled={
                      period === "day"
                        ? selectedMonth <= firstMonth
                        : selectedYear <= years[0]
                    }
                    onClick={() => move(-1)}
                  >
                    <ChevronLeft size={16} aria-hidden="true" />
                  </Button>
                  {period === "day" ? (
                    <label className="text-sm flex flex-wrap items-center gap-2">
                      {t("statistics.selectedMonth")}
                      <input
                        type="month"
                        value={selectedMonth}
                        min={firstMonth}
                        max={lastMonth}
                        onChange={(event) => {
                          if (/^\d{4}-\d{2}$/.test(event.target.value))
                            setMonth(event.target.value);
                        }}
                        className="bg-background border border-mid-gray/20 rounded-md px-2 py-1"
                      />
                    </label>
                  ) : (
                    <label className="text-sm flex items-center gap-2">
                      {t("statistics.selectedYear")}
                      <select
                        value={selectedYear}
                        onChange={(event) =>
                          setYear(Number(event.target.value))
                        }
                        className="bg-background border border-mid-gray/20 rounded-md px-2 py-1"
                      >
                        {years.map((value) => (
                          <option key={value} value={value}>
                            {value}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    aria-label={t("statistics.next")}
                    disabled={
                      period === "day"
                        ? selectedMonth >= lastMonth
                        : selectedYear >= years[years.length - 1]
                    }
                    onClick={() => move(1)}
                  >
                    <ChevronRight size={16} aria-hidden="true" />
                  </Button>
                </div>
              )}
              <MonoRoundedLineChart
                theme={theme}
                stats={data}
                today={today}
                points={points}
                metric={metric}
                period={period}
                setPeriod={setPeriod}
              />
              {points.every(
                (point) => point.words === 0 && point.audio_ms === 0,
              ) && (
                <p className="text-sm text-mid-gray">{t("statistics.empty")}</p>
              )}
              <details className="text-sm">
                <summary className="cursor-pointer">
                  {t("statistics.table")}
                </summary>
                <div className="mt-2 overflow-x-auto">
                  <table className="w-full text-sm text-start">
                    <caption className="sr-only">
                      {t("statistics.table")}
                    </caption>
                    <thead>
                      <tr className="border-b border-mid-gray/20">
                        <th scope="col" className="text-start p-2">
                          {t("statistics.date")}
                        </th>
                        <th scope="col" className="text-end p-2">
                          {t("statistics.metrics.words")}
                        </th>
                        <th scope="col" className="text-end p-2">
                          {t("statistics.totalAudio")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {points.map((point) => (
                        <tr
                          key={point.day}
                          className="border-b border-mid-gray/20"
                        >
                          <th
                            scope="row"
                            className="text-start p-2 font-normal"
                          >
                            {formatPointDate(point.day, period, i18n.language)}
                          </th>
                          <td className="text-end p-2 tabular-nums">
                            {isStatisticsPointKnown(data, point.day, today)
                              ? point.words.toLocaleString(i18n.language)
                              : "—"}
                          </td>
                          <td className="text-end p-2 tabular-nums">
                            {isStatisticsPointKnown(data, point.day, today)
                              ? formatAudioDuration(point.audio_ms)
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
