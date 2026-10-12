// Source: Subhan-code/Amicro--Micro-transitions- (MIT), verified dc2a183f3a5e6e0ea1b0d75530ac084e3a4e0bd2.
// Original: src/components/mono-charts/MonoRoundedLineChart.tsx; compact=true, real IPC data/localization only.
import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import {
  formatAudioDuration,
  isStatisticsPointKnown,
  type UsageStatistics,
  type StatisticsPoint,
  type StatisticsPeriod,
} from "./usageStatistics";
import { formatPointDate } from "./StatisticsChart";
import { motion, useReducedMotion } from "motion/react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { DitherChartTooltipContent } from "./recharts-tooltip";

export function MonoRoundedLineChart({
  stats,
  today,
  points,
  metric,
  setMetric,
  period,
  setPeriod,
  month,
  setMonth,
  firstMonth,
  lastMonth,
  year,
  setYear,
  years,
}: {
  stats: UsageStatistics;
  today: string;
  points: StatisticsPoint[];
  metric: "words" | "audio";
  setMetric: (metric: "words" | "audio") => void;
  period: StatisticsPeriod;
  setPeriod: (period: StatisticsPeriod) => void;
  month: string;
  setMonth: (month: string) => void;
  firstMonth: string;
  lastMonth: string;
  year: number;
  setYear: (year: number) => void;
  years: number[];
}) {
  const { t, i18n } = useTranslation();
  const theme = "dark",
    isDark = true,
    compact = true;
  const reduce = useReducedMotion();
  const [settings, setSettings] = useState<"metric" | "date" | null>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const metricTrigger = useRef<HTMLButtonElement>(null);
  const dateTrigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!settings) return;
    const close = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !settingsRef.current?.contains(target) &&
        !metricTrigger.current?.contains(target) &&
        !dateTrigger.current?.contains(target)
      )
        setSettings(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSettings(null);
        (settings === "metric" ? metricTrigger : dateTrigger).current?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [settings]);
  // Unknown past/future dates stay gaps; tracked inactive dates are real zeros.
  const currentData = points.map((point) => ({
    label: formatPointDate(point.day, period, i18n.language, true),
    value: isStatisticsPointKnown(stats, point.day, today)
      ? metric === "words"
        ? point.words
        : point.audio_ms
      : null,
  }));
  const latestVal = currentData.reduce(
    (sum, point) => sum + (point.value || 0),
    0,
  );
  const formatValue = (value: number) =>
    metric === "words"
      ? value.toLocaleString(i18n.language)
      : formatAudioDuration(value);
  return (
    <motion.div
      data-chart="rounded-line"
      initial={reduce ? false : { opacity: 0, scale: 0.98, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.32, ease: [0.16, 1, 0.3, 1] }}
      className={`relative w-full rounded-3xl transition-all duration-300 group flex flex-col justify-between overflow-hidden p-3.5 sm:p-4 ${
        compact ? "aspect-[16/10] min-h-[220px] w-full" : "min-h-[290px]"
      } ${
        isDark
          ? "bg-[#141414] border border-white/[0.08] shadow-[0_4px_20px_rgba(0,0,0,0.3)] hover:border-white/20"
          : "bg-white shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-neutral-200 text-black hover:border-neutral-300"
      }`}
    >
      {/* Sleek Minimal Header: Only Live Readout & Timeframe Toggle, No Title Header */}
      <div className="flex items-center justify-between mb-1.5 px-0.5">
        <div className="flex items-baseline gap-2">
          <span className="text-xl sm:text-2xl font-bold tracking-tight tabular-nums font-sans">
            {currentData.some((point) => point.value !== null)
              ? formatValue(latestVal)
              : "—"}
          </span>
          <button
            ref={metricTrigger}
            type="button"
            data-settings-trigger
            aria-label={t("statistics.metric")}
            title={t(`statistics.metrics.${metric}`)}
            aria-expanded={settings === "metric"}
            onClick={() => setSettings(settings === "metric" ? null : "metric")}
            className="text-xs font-mono opacity-70 border-0 bg-transparent p-0"
          >
            {t(`statistics.metricShort.${metric}`)}
          </button>
          <button
            ref={dateTrigger}
            type="button"
            data-settings-trigger
            aria-label={t("statistics.chooseDate")}
            aria-expanded={settings === "date"}
            onClick={() => setSettings(settings === "date" ? null : "date")}
            className="inline-flex items-center text-[9px] font-mono text-neutral-400 border-0 bg-transparent p-0"
          >
            {period === "day" ? month.slice(5) + "/" + month.slice(2, 4) : year}
          </button>
        </div>

        {/* Timeframe pill selector */}
        <div
          role="group"
          aria-label={t("statistics.period")}
          className={`inline-flex items-center p-0.5 rounded-lg border text-[10px] font-mono font-medium ${
            isDark
              ? "bg-white/5 border-white/10"
              : "bg-neutral-100 border-neutral-200"
          }`}
        >
          {(["day", "month", "year"] as const).map((tf) => (
            <button
              key={tf}
              type="button"
              aria-label={t(`statistics.periods.${tf}`)}
              aria-pressed={period === tf}
              onClick={(e) => {
                e.stopPropagation();
                setPeriod(tf);
                setSettings(null);
              }}
              className={`px-2 py-0.5 rounded-md transition-colors cursor-pointer border-0 ${
                period === tf
                  ? isDark
                    ? "bg-white text-black font-semibold"
                    : "bg-black text-white font-semibold"
                  : isDark
                    ? "text-neutral-400 hover:text-white bg-transparent"
                    : "text-neutral-600 hover:text-black bg-transparent"
              }`}
            >
              {t(`statistics.periodShort.${tf}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Main Recharts Stage — Product Focused */}
      <div
        role="img"
        aria-label={t(
          metric === "words"
            ? "statistics.wordsTrend"
            : "statistics.audioTrend",
        )}
        className={`relative w-full flex-1 rounded-[14px] overflow-hidden p-2 transition-colors min-h-0 duration-300 touch-pan-y ${
          isDark ? "bg-[#131313]" : "bg-[#f4f4f6]"
        }`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={currentData}
            margin={{ top: 10, right: 12, left: -24, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              vertical={false}
              stroke={isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.05)"}
            />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 9.5, fill: isDark ? "#71717A" : "#A1A1AA" }}
            />
            <YAxis
              domain={[0, "auto"]}
              tickFormatter={formatValue}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 9.5, fill: isDark ? "#71717A" : "#A1A1AA" }}
            />
            <Tooltip
              content={
                <DitherChartTooltipContent
                  theme={theme}
                  indicator="dot"
                  formatter={(value) => formatValue(Number(value))}
                />
              }
            />

            <Line
              type="monotone"
              dataKey="value"
              name={t(`statistics.metrics.${metric}`)}
              stroke={
                currentData.filter((point) => point.value !== null).length > 1
                  ? "#FFFFFF"
                  : "none"
              }
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={{
                r: 3.5,
                fill: "#FFFFFF",
                stroke: isDark ? "#181818" : "#FFFFFF",
                strokeWidth: 2,
              }}
              activeDot={{
                r: 5.5,
                fill: "#FFFFFF",
                stroke: isDark ? "#A1A1AA" : "#52525B",
                strokeWidth: 2,
              }}
              isAnimationActive={!reduce}
              animationDuration={800}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      {settings && (
        <div
          ref={settingsRef}
          role="dialog"
          aria-label={t(
            settings === "metric"
              ? "statistics.metric"
              : "statistics.chooseDate",
          )}
          className="absolute top-12 inset-x-3 z-30 px-3 py-2 rounded-xl text-xs shadow-2xl backdrop-blur-md border font-sans bg-[#181818]/90 border-white/10 text-white"
        >
          {settings === "metric" ? (
            <select
              autoFocus
              aria-label={t("statistics.metric")}
              value={metric}
              onChange={(event) => {
                setMetric(event.target.value as "words" | "audio");
                setSettings(null);
                metricTrigger.current?.focus();
              }}
              className="w-full bg-[#181818]"
            >
              {(["words", "audio"] as const).map((value) => (
                <option key={value} value={value}>
                  {t(`statistics.metrics.${value}`)}
                </option>
              ))}
            </select>
          ) : period === "day" ? (
            <input
              autoFocus
              aria-label={t("statistics.selectedMonth")}
              type="month"
              value={month}
              min={firstMonth}
              max={lastMonth}
              onChange={(event) => {
                if (/^\d{4}-\d{2}$/.test(event.target.value)) {
                  setMonth(event.target.value);
                  setSettings(null);
                  dateTrigger.current?.focus();
                }
              }}
              className="w-full bg-[#181818]"
            />
          ) : (
            <select
              autoFocus
              aria-label={t("statistics.selectedYear")}
              value={year}
              onChange={(event) => {
                setYear(Number(event.target.value));
                setSettings(null);
                dateTrigger.current?.focus();
              }}
              className="w-full bg-[#181818]"
            >
              {years.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
    </motion.div>
  );
}
