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
    createRoot(document.getElementById('root')).render(<div className="space-y-6"><MonoActivityHeatmap theme={window.referenceTheme} accentColor="purple"/><MonoRoundedLineChart theme={window.referenceTheme}/></div>);
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
  const page = await browser.newPage({ viewport: { width: 720, height: 800 } });
  await page.clock.install({ time: new Date("2025-10-12T12:00:00") });
  const start = async (data = empty, options = {}) => {
    await page.goto("about:blank");
    await page.setContent('<div id="root"></div>');
    await page.addStyleTag({ content: css });
    await page.evaluate(
      (state) => {
        window.statsTest = state;
      },
      { data, ...options },
    );
    await page.addScriptTag({ content: bundled.outputFiles[0].text });
  };
  const emit = () =>
    page.evaluate(() => {
      for (const callback of window.statsTest.listeners.values())
        callback({ payload: null });
    });

  // Break caught: zero counts interpreted as a missing/error response.
  await start();
  await page
    .getByRole("heading", { name: "Statistics", exact: true })
    .waitFor();
  // Break caught: unknown legacy counts shown as exact zero; fresh databases
  // must separately show a genuine known zero.
  await page.getByText("No activity in this period.").waitFor();
  assert.equal(await page.getByRole("alert").count(), 0);
  assert.equal(
    await page.locator('[data-statistic="records"]').textContent(),
    "—",
  );
  assert.equal(
    await page.locator('[data-date="2025-10-11"]').getAttribute("data-state"),
    "untracked",
  );
  await page.locator("summary").focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("tbody tr").count(), 31);
  assert.equal(await page.evaluate(() => window.statsTest.listeners.size), 1);

  // Break caught: wrong month filter, metric or date-boundary navigation.
  await start(populated);
  await page
    .getByRole("heading", { name: "Statistics", exact: true })
    .waitFor();
  assert.equal(
    await page.locator('[data-statistic="records"]').textContent(),
    "≥2",
  );
  await page.getByLabel("Selected month").fill("2024-02");
  await page.locator("summary").click();
  assert.equal(await page.locator("tbody tr").count(), 29);
  assert.match(await page.locator("tbody tr").last().textContent(), /5.*0:02/);
  await page.getByRole("button", { name: "Next period", exact: true }).click();
  assert.equal(await page.getByLabel("Selected month").inputValue(), "2024-03");
  assert.equal(await page.locator("tbody tr").count(), 31);
  await page
    .getByRole("button", { name: "Previous period", exact: true })
    .click();
  assert.equal(await page.getByLabel("Selected month").inputValue(), "2024-02");
  await page.getByRole("button", { name: "Audio", exact: true }).click();
  assert.equal(
    await page.getByRole("img").getAttribute("aria-label"),
    "Recording time trend",
  );
  await page.getByRole("button", { name: "Month", exact: true }).click();
  await page.getByLabel("Selected year").selectOption("2024");
  assert.equal(await page.locator("tbody tr").count(), 12);
  assert.match(await page.locator("tbody tr").nth(1).textContent(), /15.*0:12/);
  await page.getByRole("button", { name: "Year", exact: true }).click();
  assert.equal(await page.locator("tbody tr").count(), 2);

  await start({ ...empty, records_complete: true });
  await page
    .getByRole("heading", { name: "Statistics", exact: true })
    .waitFor();
  assert.equal(
    await page.locator('[data-statistic="records"]').textContent(),
    "0",
  );

  // Break caught: theme ignored, narrow desktop motion disabled, calendar
  // loses data or the Recharts spline is replaced with a polyline.
  await start(populated);
  await page
    .getByRole("heading", { name: "Statistics", exact: true })
    .waitFor();
  await page.getByLabel("Activity year").selectOption("2024");
  await page.getByLabel("Selected month").fill("2024-02");
  await page.clock.runFor(1200);
  assert.equal(await page.locator("[data-date]").count(), 366);
  assert.equal(
    await page.locator('[data-date="2024-02-29"]').getAttribute("aria-label"),
    "2024-02-29: 5 Words",
  );
  assert.equal(await page.locator('[data-date][tabindex="0"]').count(), 0);
  assert.equal(await page.locator(".recharts-line-curve").count(), 1);
  for (const width of [560, 700]) {
    await page.setViewportSize({ width, height: 1100 });
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      await page.clock.runFor(1000);
      const card = page.locator('[data-chart="rounded-line"]');
      assert.equal(
        await card.evaluate((el) => getComputedStyle(el).backgroundColor),
        theme === "dark" ? "rgb(20, 20, 20)" : "rgb(255, 255, 255)",
      );
      assert.equal(
        await card.evaluate((el) => getComputedStyle(el).minHeight),
        "290px",
      );
      assert.equal(
        await card.evaluate((el) => el.getBoundingClientRect().height),
        290,
      );
      assert.ok(
        (await card
          .locator(".recharts-surface")
          .evaluate((el) => el.getBoundingClientRect().height)) > 190,
      );
      assert.ok(await card.locator(".recharts-line-curve").getAttribute("d"));
    }
  }
  const cell = page.locator('[data-date="2024-02-29"]');
  await cell.hover();
  await page.clock.runFor(500);
  assert.match(await cell.getAttribute("style"), /scale\(1\.35\)/);
  // Break caught: a stationary hover retains the old snapshot after IPC refresh.
  await page.evaluate(() => {
    window.statsTest.data.daily[1].words = 9;
    window.statsTest.data.total_words = 23;
  });
  await emit();
  await page.getByText("23", { exact: true }).first().waitFor();
  assert.equal(
    await page
      .locator('[data-chart="activity-heatmap"]')
      .getByText("2024-02-29: 9 Words", { exact: true })
      .count(),
    1,
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await start(populated);
  await page
    .getByRole("heading", { name: "Statistics", exact: true })
    .waitFor();
  await page.clock.runFor(1000);
  const reducedCell = page.locator('[data-date="2025-10-12"]');
  await reducedCell.hover();
  await page.clock.runFor(500);
  assert.doesNotMatch(
    (await reducedCell.getAttribute("style")) || "",
    /scale\(1\.35\)/,
  );
  await page.emulateMedia({ reducedMotion: "no-preference" });

  // Break caught: live events are dropped; stale requests erase updated data.
  const travel = {
    total_records: 2,
    records_complete: true,
    total_words: 11,
    total_audio_ms: 3000,
    tracking_started_day: "2025-01-01",
    daily: [
      {
        day: "2024-12-31",
        words: 6,
        audio_ms: 2000,
        records: 1,
        records_complete: true,
      },
      {
        day: "2025-11-01",
        words: 5,
        audio_ms: 1000,
        records: 1,
        records_complete: true,
      },
    ],
  };
  await start(travel);
  await page
    .getByRole("heading", { name: "Statistics", exact: true })
    .waitFor();
  assert.equal(
    await page.getByLabel("Selected month").getAttribute("min"),
    "2024-12",
  );
  assert.equal(
    await page.getByLabel("Selected month").getAttribute("max"),
    "2025-11",
  );
  await page.getByLabel("Selected month").fill("2024-12");
  await page.locator("summary").click();
  assert.match(await page.locator("tbody tr").last().textContent(), /6.*0:02/);
  await page.getByLabel("Selected month").fill("2025-11");
  assert.match(await page.locator("tbody tr").first().textContent(), /5.*0:01/);

  await page.evaluate(() => {
    window.statsTest.data.total_words = 42;
  });
  await emit();
  await page.getByText("42", { exact: true }).waitFor();
  await page.evaluate(() => window.statsTest.unmount());
  assert.equal(await page.evaluate(() => window.statsTest.listeners.size), 0);

  // Break caught: initial fetch/subscription failures stall and Retry cannot recover.
  for (const failure of ["error", "subscriptionError"]) {
    await start(empty, { [failure]: true });
    await page.getByRole("alert").waitFor();
    await page.evaluate((key) => {
      window.statsTest[key] = false;
    }, failure);
    await page.getByRole("button", { name: "Retry", exact: true }).click();
    await page.getByText("No activity in this period.").waitFor();
    assert.equal(await page.getByRole("alert").count(), 0);
    assert.equal(await page.evaluate(() => window.statsTest.listeners.size), 1);
  }
  await start(empty, { hang: true });
  await page.getByRole("status").waitFor();
  await page.clock.fastForward(16000);
  await page.getByRole("alert").waitFor();

  await start(empty, { deferred: true });
  await page.waitForFunction(() => !!window.statsTest.resolve);
  await page.evaluate(() => {
    window.statsTest.deferred = false;
    window.statsTest.data = { ...window.statsTest.data, total_words: 77 };
    for (const callback of window.statsTest.listeners.values())
      callback({ payload: null });
  });
  await page.getByText("77", { exact: true }).waitFor();
  await page.evaluate(() => window.statsTest.resolve());
  assert.equal(await page.getByText("77", { exact: true }).count(), 1);

  await start(empty, { language: "ru" });
  await page
    .getByRole("heading", { name: "Статистика", exact: true })
    .waitFor();
  await page.getByText("В этом периоде пока нет активности.").waitFor();
  if (process.env.PLOT_FLOW_SCREENSHOT_DIR) {
    await mkdir(process.env.PLOT_FLOW_SCREENSHOT_DIR, { recursive: true });
    // Real clock/RAF for screenshots. The IPC timeout
    // scenario above fast-forwards its own page and must not freeze entrances.
    const visualPage = await browser.newPage();
    for (const width of [560, 700])
      for (const theme of ["light", "dark"]) {
        await visualPage.goto("about:blank");
        await visualPage.setViewportSize({ width, height: 1100 });
        await visualPage.setContent('<div id="root"></div>');
        await visualPage.addStyleTag({ content: css });
        await visualPage.evaluate(
          ({ theme, data }) => {
            document.documentElement.dataset.theme = theme;
            window.statsTest = { data };
          },
          { theme, data: populated },
        );
        await visualPage.addScriptTag({ content: bundled.outputFiles[0].text });
        await visualPage.getByLabel("Activity year").selectOption("2024");
        await visualPage.getByLabel("Selected month").fill("2024-02");
        await visualPage.waitForFunction(() =>
          [...document.querySelectorAll("[data-chart]")].every(
            (el) => Number(getComputedStyle(el).opacity) > 0.99,
          ),
        );
        // Capture the completed 800 ms spline draw, not only the card entrance.
        await visualPage.waitForTimeout(1000);
        await visualPage.screenshot({
          path: resolve(
            process.env.PLOT_FLOW_SCREENSHOT_DIR,
            `statistics-${width}-${theme}-en.png`,
          ),
          fullPage: true,
        });
        if (reference) {
          await visualPage.goto("about:blank");
          await visualPage.setContent('<div id="root"></div>');
          await visualPage.addStyleTag({
            content: css + "\n#root > div > div {height:290px;}",
          });
          await visualPage.evaluate((theme) => {
            window.referenceTheme = theme;
            document.documentElement.dataset.theme = theme;
          }, theme);
          await visualPage.addScriptTag({
            content: reference.outputFiles[0].text,
          });
          await visualPage.locator("#root > div > div").first().waitFor();
          await visualPage.waitForFunction(() =>
            [...document.querySelectorAll("#root > div > div")].every(
              (el) => Number(getComputedStyle(el).opacity) > 0.99,
            ),
          );
          await visualPage.waitForTimeout(1000);
          await visualPage.screenshot({
            path: resolve(
              process.env.PLOT_FLOW_SCREENSHOT_DIR,
              `original-${width}-${theme}.png`,
            ),
            fullPage: true,
          });
        }
      }
    await visualPage.close();
  }
  console.log(
    "Statistics UI: empty/day/month/year/audio, event updates, cleanup, IPC Retry, timeout, stale responses, RU passed",
  );
} finally {
  await browser.close();
}
