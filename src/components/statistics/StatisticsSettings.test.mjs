// Real React/i18next UI; only native IPC is replaced. No app/native build.
// Run: node src/components/statistics/StatisticsSettings.test.mjs
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { build as viteBuild } from "vite";
import tailwindcss from "@tailwindcss/vite";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

// Compile the actual application's Tailwind + theme stylesheet, including
// original reference candidates when the main worker supplied that fixture.
const cssBuild = await viteBuild({
  configFile: false,
  plugins: [
    {
      name: "statistics-reference-css",
      enforce: "pre",
      transform(code, id) {
        if (id.endsWith("/src/App.css"))
          return code + '\n@source "../release/amicro-reference";';
      },
    },
    tailwindcss(),
  ],
  logLevel: "error",
  build: { write: false, rollupOptions: { input: resolve("src/App.css") } },
});
const css = (Array.isArray(cssBuild) ? cssBuild : [cssBuild])
  .flatMap((result) => result.output)
  .filter((file) => file.type === "asset" && file.fileName.endsWith(".css"))
  .map((file) => file.source)
  .join("\n");

const entry = `
import React from "react";
import { createRoot } from "react-dom/client";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./src/i18n/locales/en/translation.json";
import ru from "./src/i18n/locales/ru/translation.json";
import { StatisticsSettings } from "./src/components/statistics/StatisticsSettings";
window.statsTest.listeners = new Map();
window.statsTest.calls = [];
window.statsTest.render = () => {
  const root = createRoot(document.getElementById("root"));
  window.statsTest.unmount = () => root.unmount();
  root.render(React.createElement(React.StrictMode, null, React.createElement(StatisticsSettings)));
};
i18n.use(initReactI18next).init({ resources: {en:{translation:en},ru:{translation:ru}}, lng:window.statsTest.language || "en", fallbackLng:"en", interpolation:{escapeValue:false} }).then(window.statsTest.render);
`;
const ipc = `
export async function invoke(command) {
  window.statsTest.calls.push(command);
  if (command !== "get_usage_statistics") throw new Error("Unexpected IPC command: " + command);
  if (window.statsTest.hang) return new Promise(() => {});
  if (window.statsTest.error) throw new Error("Statistics IPC unavailable");
  if (window.statsTest.deferred) {
    const snapshot = structuredClone(window.statsTest.data);
    await new Promise(resolve => { window.statsTest.resolve = resolve; });
    return snapshot;
  }
  return structuredClone(window.statsTest.data);
}
export async function listen(name, callback) {
  if (name !== "statistics-updated") throw new Error("Unexpected event: " + name);
  if (window.statsTest.subscriptionError) throw new Error("Statistics event IPC unavailable");
  const key = Symbol(name);
  window.statsTest.listeners.set(key, callback);
  return () => window.statsTest.listeners.delete(key);
}
`;
const bundled = await build({
  stdin: { contents: entry, resolveDir: process.cwd(), loader: "jsx" },
  bundle: true,
  write: false,
  platform: "browser",
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [
    {
      name: "native-ipc-double",
      setup(builder) {
        builder.onResolve(
          { filter: /^@tauri-apps\/api\/(core|event)$/ },
          () => ({ path: "ipc", namespace: "double" }),
        );
        builder.onLoad({ filter: /.*/, namespace: "double" }, () => ({
          contents: ipc,
          loader: "js",
        }));
        builder.onResolve({ filter: /^@\// }, (args) => ({
          path: process.cwd() + "/src/" + args.path.slice(2) + ".ts",
        }));
      },
    },
  ],
});
// Optional comparison fixture uses the main worker's untouched upstream files.
// The only native-app substitution remains Tauri IPC in the adapted UI.
const reference = process.env.PLOT_FLOW_REFERENCE_DIR
  ? await build({
      stdin: {
        contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {MonoRoundedLineChart} from ${JSON.stringify(resolve(process.env.PLOT_FLOW_REFERENCE_DIR, "MonoRoundedLineChart.tsx"))};
    import {MonoActivityHeatmap} from ${JSON.stringify(resolve(process.env.PLOT_FLOW_REFERENCE_DIR, "MonoActivityHeatmap.tsx"))};
    createRoot(document.getElementById('root')).render(<div className="grid grid-cols-2 gap-6 sm:gap-7 text-white"><MonoActivityHeatmap compact theme="dark" accentColor="purple"/><MonoRoundedLineChart compact theme="dark"/></div>);
  `,
        resolveDir: process.cwd(),
        loader: "jsx",
      },
      bundle: true,
      write: false,
      platform: "browser",
      plugins: [
        {
          name: "upstream-reference-imports",
          setup(builder) {
            builder.onResolve({ filter: /recharts-tooltip$/ }, () => ({
              path: resolve("src/components/statistics/recharts-tooltip.tsx"),
            }));
            builder.onResolve({ filter: /\/utils\/cn$/ }, () => ({
              path: "cn",
              namespace: "reference",
            }));
            builder.onResolve({ filter: /useIsMobile$/ }, () => ({
              path: "mobile",
              namespace: "reference",
            }));
            builder.onLoad(
              { filter: /.*/, namespace: "reference" },
              (args) => ({
                loader: "js",
                contents:
                  args.path === "cn"
                    ? "export const cn = (...values) => values.join(' ');"
                    : "export const useIsMobile = () => window.matchMedia('(max-width:767px)').matches;",
              }),
            );
          },
        },
      ],
    })
  : null;
const browser = await chromium.launch({
  channel: process.env.PLOT_FLOW_TEST_BROWSER || "chrome",
  headless: true,
});
const empty = {
  total_records: 0,
  records_complete: false,
  total_words: 0,
  total_audio_ms: 0,
  tracking_started_day: "2025-10-12",
  daily: [],
};
const populated = {
  total_records: 2,
  records_complete: false,
  total_words: 19,
  total_audio_ms: 14000,
  tracking_started_day: "2024-02-01",
  daily: [
    {
      day: "2024-02-28",
      words: 10,
      audio_ms: 10000,
      records: 0,
      records_complete: false,
    },
    {
      day: "2024-02-29",
      words: 5,
      audio_ms: 2500,
      records: 1,
      records_complete: true,
    },
    {
      day: "2024-03-01",
      words: 4,
      audio_ms: 1500,
      records: 1,
      records_complete: true,
    },
  ],
};
try {
  const page = await browser.newPage({ viewport: { width: 700, height: 800 } });
  await page.clock.install({ time: new Date("2025-10-12T12:00:00") });
  const start = async (data = empty, options = {}) => {
    await page.goto("about:blank");
    await page.setContent('<div id="root"></div>');
    await page.addStyleTag({ content: css });
    await page.evaluate((state) => (window.statsTest = state), {
      data,
      ...options,
    });
    await page.addScriptTag({ content: bundled.outputFiles[0].text });
    await page
      .getByRole("heading", {
        name: options.language === "ru" ? "Статистика" : "Statistics",
        exact: true,
      })
      .waitFor();
  };
  const emit = () =>
    page.evaluate(() => {
      for (const callback of window.statsTest.listeners.values())
        callback({ payload: null });
    });
  await start();
  assert.equal(await page.locator("table,details").count(), 0);
  const cards = page.locator("[data-chart]");
  assert.equal(await cards.count(), 2);
  const boxes = await cards.evaluateAll((els) =>
    els.map((el) => {
      const b = el.getBoundingClientRect();
      return { x: b.x, y: b.y, w: el.offsetWidth, h: el.offsetHeight };
    }),
  );
  assert.ok(Math.abs(boxes[0].y - boxes[1].y) < 1);
  assert.ok(boxes.every((b) => b.w < 350 && b.h >= 220 && b.h < 260));
  assert.equal(await page.locator("[data-heatmap-week]").count(), 20);
  assert.ok(
    await page
      .locator("[data-heatmap-week]")
      .evaluateAll((weeks) =>
        weeks.every((week) => week.children.length === 7),
      ),
  );
  assert.equal(
    await page.locator('[data-statistic="records"]').textContent(),
    "—",
  );
  await start({ ...empty, records_complete: true });
  assert.equal(
    await page.locator('[data-statistic="records"]').textContent(),
    "0",
  );
  await start(populated);
  await page.getByLabel("Activity year").selectOption("2024");
  await page.getByLabel("Activity window").selectOption("0");
  await page.getByRole("button", { name: "Choose date", exact: true }).click();
  await page.getByLabel("Selected month").fill("2024-02");
  await page.clock.runFor(1000);
  const day = page.locator('[data-date="2024-02-29"]'),
    caption = page.locator("[data-hover-caption]");
  await day.hover();
  await page.clock.runFor(500);
  assert.match(
    await caption.textContent(),
    /Words:5.*Audio:0:02.*recordings:1/s,
  );
  await page.locator('[data-date="2024-02-28"]').hover();
  assert.match(await caption.textContent(), /recordings:—/);
  await day.hover();
  await page.evaluate(() => {
    window.statsTest.data.daily[1].words = 9;
    window.statsTest.data.daily[1].audio_ms = 6000;
    window.statsTest.data.daily[1].records = 2;
    window.statsTest.data.total_words = 23;
  });
  await emit();
  await page.getByText("23", { exact: true }).first().waitFor();
  assert.match(
    await caption.textContent(),
    /Words:9.*Audio:0:06.*recordings:2/s,
  );
  await page.evaluate(() => {
    window.statsTest.data.daily[0].records = 2;
  });
  await emit();
  await page.locator('[data-date="2024-02-28"]').hover();
  await page.waitForFunction(() =>
    document
      .querySelector("[data-hover-caption]")
      ?.textContent.includes("recordings:≥2"),
  );
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await page.getByRole("button", { name: "Choose date", exact: true }).click();
  await page.getByLabel("Selected year").selectOption("2024");
  await page.getByRole("button", { name: "Chart metric", exact: true }).click();
  await page
    .getByRole("combobox", { name: "Chart metric", exact: true })
    .selectOption("audio");
  assert.equal(
    await page.getByRole("img").getAttribute("aria-label"),
    "Recording time trend",
  );
  await page.getByRole("button", { name: "Year", exact: true }).click();
  const single = {
    total_words: 1234,
    total_audio_ms: 3661000,
    total_records: 0,
    records_complete: false,
    tracking_started_day: "2025-10-12",
    daily: [
      {
        day: "2025-10-12",
        words: 1234,
        audio_ms: 3661000,
        records: 0,
        records_complete: false,
      },
    ],
  };
  await start(single);
  await page.clock.runFor(1200);
  // Break caught: controls occupy two header rows and shrink the source stage.
  await page.setViewportSize({ width: 490, height: 800 });
  assert.ok(
    await page.locator('[data-chart="rounded-line"]').evaluate((card) => {
      const header = card.children[0],
        stage = card.querySelector('[role="img"]');
      return (
        header.getBoundingClientRect().height <= 34 &&
        stage.getBoundingClientRect().height >= 148
      );
    }),
  );
  assert.equal(
    await page.locator(".recharts-line-curve").getAttribute("stroke"),
    "none",
  );
  assert.equal(await page.locator(".recharts-line-dot").count(), 1);
  await page.locator('[data-date="2025-10-12"]').hover();
  assert.match(
    await caption.textContent(),
    /Words:1,234.*Audio:1:01:01.*recordings:—/s,
  );
  for (const width of [490, 560, 700]) {
    await page.setViewportSize({ width, height: 800 });
    await page.clock.runFor(1000);
    await page.locator('[data-date="2025-10-12"]').hover();
    assert.ok(
      await page.locator('[data-chart="activity-heatmap"]').evaluate((card) => {
        const footer = card.querySelector("[data-heatmap-footer]"),
          grid = card.querySelector("[data-heatmap-grid]");
        return (
          footer &&
          grid &&
          footer.getBoundingClientRect().top >=
            grid.getBoundingClientRect().bottom - 0.5
        );
      }),
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
    );
    assert.equal(
      await cards.evaluateAll((els) =>
        els.some((el) => el.scrollWidth > el.clientWidth + 1),
      ),
      false,
    );
    assert.equal(
      await caption.evaluate((el) => el.scrollWidth > el.clientWidth + 1),
      false,
    );
    assert.equal(
      await caption.evaluate((el) => {
        const bounds = el.getBoundingClientRect();
        return (
          bounds.bottom <= innerHeight &&
          bounds.top >= 0 &&
          bounds.left >= 0 &&
          bounds.right <= innerWidth &&
          el.scrollHeight <= el.clientHeight + 1
        );
      }),
      true,
    );
  }
  for (const failure of ["error", "subscriptionError"]) {
    await start(empty, { [failure]: true });
    await page.getByRole("alert").waitFor();
    await page.evaluate((key) => (window.statsTest[key] = false), failure);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await cards.first().waitFor();
    assert.equal(await page.getByRole("alert").count(), 0);
  }
  await start(empty, { hang: true });
  await page.clock.fastForward(16000);
  await page.getByRole("alert").waitFor();
  await start(single, { language: "ru" });
  await page.locator('[data-date="2025-10-12"]').hover();
  assert.match(
    await caption.textContent(),
    /Слова:1.234.*Аудио:1:01:01.*записей:—/s,
  );
  if (process.env.PLOT_FLOW_SCREENSHOT_DIR) {
    await mkdir(process.env.PLOT_FLOW_SCREENSHOT_DIR, { recursive: true });
    const visual = await browser.newPage();
    for (const width of [490, 560, 700]) {
      await visual.setViewportSize({ width, height: 800 });
      await visual.goto("about:blank");
      await visual.setContent('<div id="root"></div>');
      await visual.addStyleTag({ content: css });
      const today = new Date().toLocaleDateString("sv-SE"),
        data = {
          ...single,
          tracking_started_day: today,
          daily: [{ ...single.daily[0], day: today }],
        };
      await visual.evaluate((data) => (window.statsTest = { data }), data);
      await visual.addScriptTag({ content: bundled.outputFiles[0].text });
      await visual.locator('[data-date="' + today + '"]').hover();
      await visual.waitForTimeout(1200);
      await visual.screenshot({
        path: resolve(
          process.env.PLOT_FLOW_SCREENSHOT_DIR,
          `compact-${width}-dark.png`,
        ),
        fullPage: true,
      });
      if (reference) {
        await visual.goto("about:blank");
        await visual.setContent('<div id="root"></div>');
        await visual.addStyleTag({ content: css });
        await visual.addScriptTag({ content: reference.outputFiles[0].text });
        await visual.waitForTimeout(1200);
        await visual.screenshot({
          path: resolve(
            process.env.PLOT_FLOW_SCREENSHOT_DIR,
            `original-compact-${width}-dark.png`,
          ),
          fullPage: true,
        });
      }
    }
    await visual.close();
  }
  console.log(
    "Statistics compact UI PASS: 20-week source composition, hover words/audio/records/live IPC, unknown/≥counts, single-day dot, periods/audio, no table/overflow 490/560/700, Retry/timeout, RU",
  );
} finally {
  await browser.close();
}
