// Adapted from Subhan-code/Amicro--Micro-transitions- (MIT).
// Verified revision dc2a183f3a5e6e0ea1b0d75530ac084e3a4e0bd2: src/components/mono-charts/MonoActivityHeatmap.tsx
import { useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  buildHeatmap,
  type UsageStatistics,
  type HeatmapDay,
} from "./usageStatistics";
import { statisticsMotion } from "./motionTokens";
import { motion, useReducedMotion } from "motion/react";
const cn = (...values: string[]) => values.join(" ");

export function MonoActivityHeatmap({
  stats,
  year,
  setYear,
  years,
  today,
  theme = "dark",
}: {
  stats: UsageStatistics;
  year: number;
  setYear: (year: number) => void;
  years: number[];
  today: string;
  theme?: "dark" | "light";
}) {
  const { t, i18n } = useTranslation();
  const isDark = theme === "dark";
  const compact = false;
  const reduce = useReducedMotion();
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const weeks = useMemo(
    () => buildHeatmap(stats, year, today),
    [stats, year, today],
  );
  const hoveredDay =
    weeks.flat().find((day) => day?.date === hoveredDate) ?? null;
  const totalContributions = weeks
    .flat()
    .reduce((sum, day) => sum + (day?.count || 0), 0);
  const colorScale = { bg: "#96a36c" };
  const months = Array.from({ length: 12 }, (_, month) => ({
    label: new Intl.DateTimeFormat(i18n.language, {
      month: "short",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(year, month, 1))),
    column: weeks.findIndex((week) =>
      week.some(
        (day) =>
          day?.date === `${year}-${String(month + 1).padStart(2, "0")}-01`,
      ),
    ),
  }));
  const describe = (day: HeatmapDay) =>
    `${day.date}: ${day.state === "known" ? day.count.toLocaleString(i18n.language) + " " + t("statistics.metrics.words") : t("statistics." + day.state)}`;
  const opacityForLevel = (lvl: HeatmapDay["level"]) => {
    switch (lvl) {
      case 0:
        return isDark ? 0.06 : 0.08;
      case 1:
        return 0.3;
      case 2:
        return 0.55;
      case 3:
        return 0.8;
      case 4:
        return 1;
    }
  };

  return (
    <motion.div
      data-chart="activity-heatmap"
      initial={reduce ? false : { opacity: 0, scale: 0.98, y: 6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      transition={{
        duration: reduce ? 0 : statisticsMotion.heatmapEntrance,
        ease: statisticsMotion.ease,
      }}
      className={cn(
        "relative w-full rounded-3xl transition-all duration-300 group flex flex-col justify-between overflow-hidden p-3.5 sm:p-4 font-sans",
        compact ? "aspect-[16/10] min-h-[220px] w-full" : "min-h-[290px]",
        isDark
          ? "bg-[#141414] border border-white/[0.08] text-white shadow-[0_4px_20px_rgba(0,0,0,0.3)] hover:border-white/20"
          : "bg-white shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-neutral-200 text-black hover:border-neutral-300",
      )}
    >
      {/* Metric Header */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-baseline gap-2">
          <div className="text-xl sm:text-2xl font-bold tracking-tight tabular-nums font-sans">
            {totalContributions.toLocaleString(i18n.language)}{" "}
            <span className="text-xs font-normal opacity-70">
              {t("statistics.metrics.words")}
            </span>
          </div>
        </div>

        <label className="text-[10px] font-mono">
          {t("statistics.heatmapYear")}
          <select
            aria-label={t("statistics.heatmapYear")}
            value={year}
            onChange={(event) => {
              setHoveredDate(null);
              setYear(Number(event.target.value));
            }}
            className="ml-2 rounded-md bg-transparent px-2 py-0.5"
          >
            {years.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Main Heatmap Stage Grid */}
      <div
        className={cn(
          "relative w-full flex-1 rounded-[14px] overflow-hidden p-2.5 sm:p-3 transition-colors duration-300 flex flex-col justify-between items-center min-h-0",
          isDark ? "bg-[#131313]" : "bg-[#f4f4f6]",
        )}
      >
        <div className="w-full overflow-x-auto">
          <div className="min-w-[480px]">
            <div className="relative h-5 ml-7">
              {months.map((month, index) => (
                <span
                  key={index}
                  className="absolute text-[10px] font-mono text-neutral-400"
                  style={{ left: `${(month.column / weeks.length) * 100}%` }}
                >
                  {month.label}
                </span>
              ))}
            </div>
            <div className="relative w-full pl-7">
              <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-around w-6 text-[9px] leading-none font-mono text-neutral-400">
                {Array.from({ length: 7 }, (_, index) => (
                  <span key={index}>
                    {new Intl.DateTimeFormat(i18n.language, {
                      weekday: "short",
                      timeZone: "UTC",
                    }).format(new Date(Date.UTC(2024, 0, 7 + index)))}
                  </span>
                ))}
              </div>
              <div
                className="flex justify-between items-center gap-[2px] sm:gap-[3px] w-full py-0.5"
                onPointerLeave={() => setHoveredDate(null)}
              >
                {weeks.map((week, wIdx) => (
                  <div
                    key={wIdx}
                    className="flex flex-col gap-[2px] sm:gap-[3px] items-center flex-1"
                  >
                    {week.map((day, dIdx) =>
                      day ? (
                        <motion.div
                          key={day.date}
                          data-date={day.date}
                          data-state={day.state}
                          aria-label={describe(day)}
                          title={describe(day)}
                          onPointerEnter={() => setHoveredDate(day.date)}
                          onPointerDown={() => setHoveredDate(day.date)}
                          className="aspect-square w-full rounded-[2px] sm:rounded-[2.5px] transition-colors cursor-pointer outline-offset-2"
                          style={{
                            backgroundColor:
                              day.state === "known"
                                ? colorScale.bg
                                : "transparent",
                            opacity:
                              day.state === "known"
                                ? opacityForLevel(day.level)
                                : 0.4,
                            boxShadow:
                              day.state === "untracked"
                                ? "inset 0 0 0 1px #71717A"
                                : day.state === "future"
                                  ? "inset 0 0 0 1px #52525B"
                                  : undefined,
                          }}
                          whileHover={
                            reduce ? undefined : { scale: 1.35, zIndex: 10 }
                          }
                        />
                      ) : (
                        <div key={dIdx} className="aspect-square w-full" />
                      ),
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        {/* Active Cell Tooltip Callout */}
        <div className="h-4 flex items-center justify-center">
          {hoveredDay ? (
            <span
              className={`text-[10px] sm:text-[11px] font-mono font-medium ${isDark ? "text-neutral-200" : "text-neutral-800"}`}
            >
              {describe(hoveredDay)}
            </span>
          ) : (
            <span
              className={`text-[10px] font-mono opacity-40 ${isDark ? "text-neutral-400" : "text-neutral-500"}`}
            >
              {t("statistics.heatmapHint")}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}
