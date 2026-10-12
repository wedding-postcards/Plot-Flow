// Real React/i18next UI; only native IPC is replaced. No app/native build.
// Run: node src/components/statistics/StatisticsSettings.test.mjs
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "@playwright/test";

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
const browser = await chromium.launch({
  channel: process.env.PLOT_FLOW_TEST_BROWSER || "chrome",
  headless: true,
});
const empty = {
  total_words: 0,
  total_audio_ms: 0,
  tracking_started_day: "2025-10-12",
  daily: [],
};
const populated = {
  total_words: 19,
  total_audio_ms: 14000,
  tracking_started_day: "2024-02-01",
  daily: [
    { day: "2024-02-28", words: 10, audio_ms: 10000 },
    { day: "2024-02-29", words: 5, audio_ms: 2500 },
    { day: "2024-03-01", words: 4, audio_ms: 1500 },
  ],
};
try {
  const page = await browser.newPage({ viewport: { width: 720, height: 800 } });
  await page.clock.install({ time: new Date("2025-10-12T12:00:00") });
  const start = async (data = empty, options = {}) => {
    await page.goto("about:blank");
    await page.setContent('<div id="root"></div>');
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
  await page.getByText("No activity in this period.").waitFor();
  assert.equal(await page.getByRole("alert").count(), 0);
  await page.locator("summary").focus();
  await page.keyboard.press("Enter");
  assert.equal(await page.locator("tbody tr").count(), 31);
  assert.equal(await page.evaluate(() => window.statsTest.listeners.size), 1);

  // Break caught: wrong month filter, metric or date-boundary navigation.
  await start(populated);
  await page
    .getByRole("heading", { name: "Statistics", exact: true })
    .waitFor();
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

  // Break caught: live events are dropped; stale requests erase updated data.
  const travel = {
    total_words: 11,
    total_audio_ms: 3000,
    tracking_started_day: "2025-01-01",
    daily: [
      { day: "2024-12-31", words: 6, audio_ms: 2000 },
      { day: "2025-11-01", words: 5, audio_ms: 1000 },
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
  console.log(
    "Statistics UI: empty/day/month/year/audio, event updates, cleanup, IPC Retry, timeout, stale responses, RU passed",
  );
} finally {
  await browser.close();
}
