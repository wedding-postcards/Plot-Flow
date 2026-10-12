// Adapted from Subhan-code/Amicro--Micro-transitions- (MIT).
// Verified GitHub revision dc2a183f3a5e6e0ea1b0d75530ac084e3a4e0bd2; original path: src/components/mono-charts/MonoRoundedLineChart.tsx
import { useTranslation } from "react-i18next";
import {
  formatAudioDuration,
  isStatisticsPointKnown,
  type UsageStatistics,
  type StatisticsPoint,
  type StatisticsPeriod,
} from "./usageStatistics";
import { formatPointDate } from "./StatisticsChart";
import { statisticsMotion } from "./motionTokens";
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
  points,
  stats,
  today,
  metric,
  period,
  setPeriod,
  theme = "dark",
}: {
  stats: UsageStatistics;
  today: string;
  points: StatisticsPoint[];
  metric: "words" | "audio";
  period: StatisticsPeriod;
  setPeriod: (period: StatisticsPeriod) => void;
  theme?: "dark" | "light";
}) {
  const { t, i18n } = useTranslation();
  const isDark = theme === "dark";
  const compact = false;
  const reduce = useReducedMotion();
  const currentData = points.map((point) => ({
    label: formatPointDate(point.day, period, i18n.language, true),
    value: !isStatisticsPointKnown(stats, point.day, today)
      ? null
      : metric === "words"
        ? point.words
        : point.audio_ms,
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
      transition={{
        duration: reduce ? 0 : statisticsMotion.lineEntrance,
        ease: statisticsMotion.ease,
      }}
      className={`relative w-full h-[290px] rounded-3xl transition-all duration-300 group flex flex-col justify-between overflow-hidden p-3.5 sm:p-4 ${
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
          <span className="text-xs font-mono opacity-70">
            {t(`statistics.metrics.${metric}`)}
          </span>
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
              aria-pressed={period === tf}
              onClick={(e) => {
                e.stopPropagation();
                setPeriod(tf);
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
              {t(`statistics.periods.${tf}`)}
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
              stroke={"#96a36c"}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
              dot={{
                r: 3.5,
                fill: "#96a36c",
                stroke: isDark ? "#181818" : "#FFFFFF",
                strokeWidth: 2,
              }}
              activeDot={{
                r: 5.5,
                fill: "#96a36c",
                stroke: isDark ? "#A1A1AA" : "#52525B",
                strokeWidth: 2,
              }}
              isAnimationActive={!reduce}
              animationDuration={statisticsMotion.lineDuration}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
