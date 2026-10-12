// Source: Subhan-code/Amicro--Micro-transitions- (MIT), verified dc2a183f3a5e6e0ea1b0d75530ac084e3a4e0bd2.
// Original: src/components/mono-charts/MonoActivityHeatmap.tsx; compact=true, real IPC data/localization only.
import { useState, useMemo, useEffect } from "react";
import { createPortal } from "react-dom";
import { DitherChartTooltipContent } from "./recharts-tooltip";
import { useTranslation } from "react-i18next";
import {
  buildHeatmapWindow,
  buildHeatmap,
  formatRecordCount,
  formatAudioDuration,
  type HeatmapDay,
  type UsageStatistics,
} from "./usageStatistics";
import { motion, useReducedMotion } from "motion/react";
const cn = (...values: string[]) => values.join(" ");

export function MonoActivityHeatmap({
  stats,
  year,
  setYear,
  years,
  today,
  windowIndex,
  setWindowIndex,
}: {
  stats: UsageStatistics;
  year: number;
  setYear: (year: number) => void;
  years: number[];
  today: string;
  windowIndex: number;
  setWindowIndex: (index: number) => void;
}) {
  const { t, i18n } = useTranslation();
  const isDark = true,
    compact = true;
  const reduce = useReducedMotion();
  const [hoveredDate, setHoveredDate] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(
    null,
  );
  const showDay = (date: string, cell: HTMLElement) => {
    const bounds = cell.closest("[data-chart]")!.getBoundingClientRect();
    setHoveredDate(date);
    setAnchor({
      left: Math.max(8, Math.min(window.innerWidth - 228, bounds.left)),
      top: Math.max(
        8,
        Math.min(
          window.innerHeight - 160,
          bounds.top >= 168 ? bounds.top - 160 : bounds.bottom + 8,
        ),
      ),
    });
  };
  useEffect(() => {
    const clear = () => setHoveredDate(null);
    window.addEventListener("resize", clear);
    window.addEventListener("scroll", clear, true);
    return () => {
      window.removeEventListener("resize", clear);
      window.removeEventListener("scroll", clear, true);
    };
  }, []);
  const weeks = useMemo(
    () => buildHeatmapWindow(stats, year, today, windowIndex),
    [stats, year, today, windowIndex],
  );
  const hoveredDay =
    weeks.flat().find((day) => day?.date === hoveredDate) ?? null;
  const weekCount = useMemo(
    () => buildHeatmap(stats, year, today).length,
    [stats, year, today],
  );
  const totalContributions = weeks
    .flat()
    .reduce((sum, day) => sum + (day?.count || 0), 0);
  const colorScale = { bg: "#96a36c" };
  const MONTH_NAMES = [
    ...new Set(
      weeks
        .flat()
        .filter((day) => day !== null)
        .map((day) => day.date.slice(0, 7)),
    ),
  ].map((month) =>
    new Intl.DateTimeFormat(i18n.language, {
      month: "short",
      timeZone: "UTC",
    }).format(new Date(month + "-01T00:00:00Z")),
  );
  const values = (day: HeatmapDay) =>
    day.state === "known"
      ? `${day.count.toLocaleString(i18n.language)} ${t("statistics.metrics.words")} · ${formatAudioDuration(day.audio_ms)} ${t("statistics.metrics.audio")} · ${formatRecordCount(day.records, day.records_complete, i18n.language)} ${t("statistics.recordLabel")}`
      : `— ${t("statistics.metrics.words")} · — ${t("statistics.metrics.audio")} · — ${t("statistics.recordLabel")}`;
  const describe = (day: HeatmapDay) => day.date + ": " + values(day);
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
    <>
      <motion.div
        data-chart="activity-heatmap"
        initial={reduce ? false : { opacity: 0, scale: 0.98, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.35, ease: [0.16, 1, 0.3, 1] }}
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

          <div
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono ${
              isDark
                ? "bg-white/5 text-neutral-400"
                : "bg-neutral-100 text-neutral-600"
            }`}
          >
            <select
              aria-label={t("statistics.heatmapYear")}
              value={year}
              onChange={(event) => {
                setHoveredDate(null);
                setYear(Number(event.target.value));
                setWindowIndex(0);
              }}
              className="bg-transparent border-0 w-[44px]"
            >
              {years.map((value) => (
                <option key={value} value={value} className="bg-[#141414]">
                  {value}
                </option>
              ))}
            </select>
            <select
              aria-label={t("statistics.heatmapWindow")}
              value={windowIndex}
              onChange={(event) => {
                setHoveredDate(null);
                setWindowIndex(Number(event.target.value));
              }}
              className="bg-transparent border-0"
            >
              {[0, 1, 2].map((value) => (
                <option key={value} value={value} className="bg-[#141414]">
                  {value === 2 ? weekCount - 19 : value * 20 + 1}–
                  {value === 2 ? weekCount : value * 20 + 20}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Main Heatmap Stage Grid */}
        <div
          className={cn(
            "relative w-full flex-1 rounded-[14px] overflow-hidden p-2.5 sm:p-3 transition-colors duration-300 flex flex-col justify-between items-center min-h-0",
            isDark ? "bg-[#131313]" : "bg-[#f4f4f6]",
          )}
        >
          {/* Month Headers */}
          <div className="flex justify-between items-center w-full px-1 mb-1">
            {MONTH_NAMES.map((m, idx) => (
              <span
                key={idx}
                className={`text-[10px] font-mono text-center flex-1 ${isDark ? "text-neutral-400" : "text-neutral-500"}`}
              >
                {m}
              </span>
            ))}
          </div>

          {/* 20-Week Heatmap Grid */}
          <div
            data-heatmap-grid
            className="flex justify-between items-center gap-[2px] sm:gap-[3px] w-full py-0.5"
            onPointerLeave={() => setHoveredDate(null)}
          >
            {weeks.map((week, wIdx) => (
              <div
                key={wIdx}
                data-heatmap-week
                className="flex flex-col gap-[2px] sm:gap-[3px] items-center flex-1"
              >
                {week.map((day, dIdx) =>
                  day ? (
                    <motion.div
                      key={day.date}
                      data-date={day.date}
                      data-state={day.state}
                      aria-label={describe(day)}
                      tabIndex={
                        day.state === "known" &&
                        (day.count > 0 || day.audio_ms > 0 || day.records > 0)
                          ? 0
                          : -1
                      }
                      onFocus={(event) =>
                        showDay(day.date, event.currentTarget)
                      }
                      onBlur={() => setHoveredDate(null)}
                      onPointerEnter={(event) =>
                        showDay(day.date, event.currentTarget)
                      }
                      onPointerDown={(event) =>
                        showDay(day.date, event.currentTarget)
                      }
                      className="aspect-square w-full rounded-[2px] sm:rounded-[2.5px] transition-all cursor-pointer"
                      style={{
                        backgroundColor: colorScale.bg,
                        opacity: opacityForLevel(day.level),
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

          {/* Active Cell Tooltip Callout */}
          <div
            data-heatmap-footer
            className="relative h-4 w-full shrink-0 flex items-center justify-center"
          >
            {hoveredDay ? (
              <span className="text-[10px] sm:text-[11px] font-mono font-medium text-neutral-200">
                {hoveredDay.date}
              </span>
            ) : (
              <span className="text-[10px] font-mono opacity-40 text-neutral-400">
                {t("statistics.heatmapHint")}
              </span>
            )}
          </div>
        </div>
      </motion.div>
      {hoveredDay &&
        anchor &&
        createPortal(
          <div
            data-hover-caption
            role="tooltip"
            className="fixed z-50 pointer-events-none w-[220px] max-w-[calc(100vw-16px)]"
            style={anchor}
          >
            <DitherChartTooltipContent
              active
              theme="dark"
              label={hoveredDay.date}
              payload={[
                {
                  name: t("statistics.metrics.words"),
                  value:
                    hoveredDay.state === "known"
                      ? hoveredDay.count.toLocaleString(i18n.language)
                      : "—",
                  color: colorScale.bg,
                },
                {
                  name: t("statistics.metrics.audio"),
                  value:
                    hoveredDay.state === "known"
                      ? formatAudioDuration(hoveredDay.audio_ms)
                      : "—",
                  color: colorScale.bg,
                },
                {
                  name: t("statistics.recordLabel"),
                  value:
                    hoveredDay.state === "known"
                      ? formatRecordCount(
                          hoveredDay.records,
                          hoveredDay.records_complete,
                          i18n.language,
                        )
                      : "—",
                  color: colorScale.bg,
                },
              ]}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
