import { useTranslation } from "react-i18next";
import {
  formatAudioDuration,
  type StatisticsPoint,
  type StatisticsPeriod,
} from "./usageStatistics";

export function formatPointDate(
  day: string,
  period: StatisticsPeriod,
  locale: string,
  compact = false,
) {
  if (period === "year") return day;
  const date = new Date(`${day}${period === "month" ? "-01" : ""}T00:00:00Z`);
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    ...(period === "month"
      ? {
          month: compact ? "short" : "long",
          ...(compact ? {} : { year: "numeric" }),
        }
      : compact
        ? { day: "numeric" }
        : { day: "numeric", month: "short", year: "numeric" }),
  }).format(date);
}

export function StatisticsChart({
  points,
  metric,
  period,
}: {
  points: StatisticsPoint[];
  metric: "words" | "audio";
  period: StatisticsPeriod;
}) {
  const { t, i18n } = useTranslation();
  const values = points.map((point) =>
    metric === "words" ? point.words : point.audio_ms,
  );
  const maximum = Math.max(0, ...values);
  const x = (index: number) =>
    44 + (index * 536) / Math.max(1, points.length - 1);
  const y = (value: number) => 166 - (value / (maximum || 1)) * 140;
  const coordinates = values
    .map((value, index) => `${x(index)},${y(value)}`)
    .join(" ");
  const tickIndices = new Set([
    0,
    Math.floor((points.length - 1) / 4),
    Math.floor((points.length - 1) / 2),
    Math.floor(((points.length - 1) * 3) / 4),
    points.length - 1,
  ]);
  const formatValue = (value: number) =>
    metric === "words"
      ? value.toLocaleString(i18n.language)
      : formatAudioDuration(value);

  return (
    <svg
      viewBox="0 0 600 205"
      className="w-full text-logo-primary"
      role="img"
      aria-label={t(
        metric === "words" ? "statistics.wordsTrend" : "statistics.audioTrend",
      )}
    >
      <title>
        {t(
          metric === "words"
            ? "statistics.wordsTrend"
            : "statistics.audioTrend",
        )}
      </title>
      {(maximum ? [0, maximum / 2, maximum] : [0]).map((value) => (
        <g key={value} className="text-mid-gray">
          <line
            x1={44}
            x2={580}
            y1={y(value)}
            y2={y(value)}
            stroke="currentColor"
            opacity={0.2}
          />
          <text
            x={38}
            y={y(value) + 4}
            textAnchor="end"
            fill="currentColor"
            fontSize={10}
          >
            {formatValue(metric === "words" ? Math.round(value) : value)}
          </text>
        </g>
      ))}
      <polyline
        points={coordinates}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
      {points.map((point, index) => (
        <circle
          key={point.day}
          cx={x(index)}
          cy={y(values[index])}
          r={3}
          fill="currentColor"
        >
          <title>
            {formatPointDate(point.day, period, i18n.language)}:{" "}
            {formatValue(values[index])}
          </title>
        </circle>
      ))}
      {[...tickIndices]
        .filter((index) => points[index])
        .map((index) => (
          <text
            key={index}
            x={x(index)}
            y={190}
            textAnchor={
              index === 0
                ? "start"
                : index === points.length - 1
                  ? "end"
                  : "middle"
            }
            className="fill-mid-gray"
            fontSize={11}
          >
            {formatPointDate(points[index].day, period, i18n.language, true)}
          </text>
        ))}
    </svg>
  );
}
