// Focused React lifecycle checks with a mocked backend; no app build or network.
// Run: node src/hooks/useBundledModel.test.mjs
import assert from "node:assert/strict";
import { build } from "esbuild";
import { chromium } from "@playwright/test";

const entry = `
import React from "react";
import { createRoot } from "react-dom/client";
import { useBundledModel } from "./src/hooks/useBundledModel";
import { BundledModelStatus } from "./src/components/BundledModelStatus";
window.modelTest = { ...window.modelTest, listeners: new Map(), subscriptions: 0 };
function Probe() {
  const result = useBundledModel();
  window.modelTest.retry = result.refresh;
  return React.createElement(React.Fragment, null,
    React.createElement("p", { id: "status" }, result.status),
    React.createElement(BundledModelStatus, { status: result.status, onRetry: result.refresh })
  );
}
createRoot(document.getElementById("root")).render(
  React.createElement(React.StrictMode, null, React.createElement(Probe))
);
`;
const backend = `
const state = () => window.modelTest;
const ok = data => ({ status: "ok", data });
export const commands = {
  rescanLocalModels: async () => {
    state().rescanCalls = (state().rescanCalls || 0) + 1;
    if (state().rescanHang) return new Promise(resolve => { state().resolveRescan = resolve; });
    if (state().rescanReject) throw new Error("Offline repair IPC failed");
    if (state().rescanError) return { status: "error", error: "Bundled file could not be restored" };
    state().missing = false;
    state().downloaded = true;
    // Real rescan emits a registry update before its command returns.
    for (const listener of state().listeners.values()) {
      if (listener.name === "models-updated") listener.callback({ payload: {} });
    }
    return ok(null);
  },
  getCurrentModel: async () => {
    if (state().ipcError) throw new Error("IPC unavailable");
    if (state().hang) return new Promise(() => {});
    return ok(state().missing ? "" : "gigaam-v3-e2e-ctc");
  },
  getModelInfo: async id => ok(id ? {
    id, name: "GigaAM v3", is_downloaded: state().downloaded !== false,
  } : null),
  getModelLoadStatus: async () => {
    if (state().delaySnapshot) {
      const snapshot = { is_loaded: state().loaded, current_model: state().loaded ? "gigaam-v3-e2e-ctc" : null };
      await new Promise(resolve => { state().resolveSnapshot = resolve; });
      return ok(snapshot);
    }
    return ok({ is_loaded: !!state().loaded, current_model: state().loaded ? "gigaam-v3-e2e-ctc" : null });
  },
};
`;
const events = `
export async function listen(name, callback) {
  if (window.modelTest.subscriptionError) throw new Error("Event IPC unavailable");
  const listeners = window.modelTest.listeners;
  const key = ++window.modelTest.subscriptions;
  listeners.set(key, { name, callback });
  return () => listeners.delete(key);
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
      name: "mock-model-backend",
      setup(builder) {
        builder.onResolve({ filter: /^@\/bindings$/ }, () => ({
          path: "backend",
          namespace: "mock",
        }));
        builder.onResolve({ filter: /^@tauri-apps\/api\/event$/ }, () => ({
          path: "events",
          namespace: "mock",
        }));
        builder.onResolve({ filter: /^@\/lib\/bundledModel$/ }, () => ({
          path: process.cwd() + "/src/lib/bundledModel.ts",
        }));
        builder.onResolve({ filter: /^react-i18next$/ }, () => ({
          path: "translations",
          namespace: "mock",
        }));
        builder.onLoad({ filter: /.*/, namespace: "mock" }, (args) => ({
          contents:
            args.path === "backend"
              ? backend
              : args.path === "events"
                ? events
                : "export const useTranslation = () => ({ t: key => key });",
          loader: "js",
        }));
      },
    },
  ],
});
const browser = await chromium.launch({
  channel: process.env.PLOT_FLOW_TEST_BROWSER || "chrome",
  headless: true,
});
try {
  const page = await browser.newPage();
  await page.clock.install();
  const start = async (config = {}) => {
    await page.goto("about:blank");
    await page.setContent('<div id="root"></div>');
    await page.evaluate((config) => {
      window.modelTest = config;
    }, config);
    await page.addScriptTag({ content: bundled.outputFiles[0].text });
  };
  const expectStatus = async (status) => {
    await page.waitForFunction(
      (status) => document.getElementById("status")?.textContent === status,
      status,
    );
  };
  const emit = async (kind) => {
    await page.evaluate((kind) => {
      for (const listener of window.modelTest.listeners.values()) {
        if (listener.name === "model-state-changed")
          listener.callback({ payload: { event_type: kind } });
      }
    }, kind);
  };
  await start();
  await expectStatus("available"); // Lazy/idle unload must never be a spinner.
  assert.equal(await page.evaluate(() => window.modelTest.listeners.size), 2); // StrictMode cleanup.
  await emit("loading_started");
  await expectStatus("loading");
  await emit("loading_failed");
  await expectStatus("failed");
  const subscriptionsBeforeRetry = await page.evaluate(
    () => window.modelTest.subscriptions,
  );
  await page.evaluate(() => window.modelTest.retry());
  await page.waitForFunction(
    (before) =>
      window.modelTest.subscriptions > before &&
      window.modelTest.listeners.size === 2,
    subscriptionsBeforeRetry,
  );
  await page.clock.fastForward(61000);
  await expectStatus("failed"); // File existence does not erase a failed load.
  assert.equal(await page.evaluate(() => window.modelTest.rescanCalls || 0), 0);
  await page.evaluate(() => {
    window.modelTest.loaded = true;
  });
  await emit("loading_completed");
  await expectStatus("ready");
  await page.evaluate(() => {
    window.modelTest.loaded = false;
  });
  await emit("unloaded");
  await expectStatus("available");

  await start({ missing: true });
  await expectStatus("missing");
  await page.getByRole("button", { name: "plotFlow.retry" }).click();
  await expectStatus("available");
  assert.equal(await page.evaluate(() => window.modelTest.rescanCalls), 1);
  assert.equal(await page.evaluate(() => window.modelTest.listeners.size), 2);

  await start({ downloaded: false });
  await expectStatus("missing");
  await page.getByRole("button", { name: "plotFlow.retry" }).click();
  await expectStatus("available");

  await start({ missing: true, rescanError: true });
  await expectStatus("missing");
  await page.getByRole("button", { name: "plotFlow.retry" }).click();
  await expectStatus("failed");
  assert.equal(
    await page.getByRole("alert").textContent(),
    "plotFlow.failedplotFlow.retry",
  );
  await page.evaluate(() => {
    window.modelTest.rescanError = false;
  });
  await page.getByRole("button", { name: "plotFlow.retry" }).click();
  await expectStatus("available");
  assert.equal(await page.evaluate(() => window.modelTest.rescanCalls), 2);

  await start({ missing: true, rescanReject: true });
  await expectStatus("missing");
  await page.getByRole("button", { name: "plotFlow.retry" }).click();
  await expectStatus("failed");
  assert.equal(await page.getByRole("alert").count(), 1);

  await start({ missing: true, rescanHang: true });
  await expectStatus("missing");
  // Multiple clicks cannot start concurrent restores.
  await page.evaluate(() => {
    window.modelTest.retry();
    window.modelTest.retry();
  });
  await expectStatus("checking");
  assert.equal(await page.evaluate(() => window.modelTest.rescanCalls), 1);
  await page.clock.fastForward(16000);
  await expectStatus("failed");
  assert.equal(await page.getByRole("alert").count(), 1);
  await page.evaluate(() =>
    window.modelTest.resolveRescan({ status: "ok", data: null }),
  );
  await expectStatus("failed"); // A late command response cannot erase timeout.

  await start({ ipcError: true });
  await expectStatus("failed");
  await page.evaluate(() => {
    window.modelTest.ipcError = false;
    window.modelTest.retry();
  });
  await expectStatus("available");

  await start({ subscriptionError: true });
  await expectStatus("failed");
  await page.evaluate(() => {
    window.modelTest.subscriptionError = false;
    window.modelTest.retry();
  });
  await expectStatus("available");
  assert.equal(await page.evaluate(() => window.modelTest.listeners.size), 2);
  assert.equal(await page.evaluate(() => window.modelTest.rescanCalls || 0), 0);

  await start({ hang: true });
  await expectStatus("checking");
  await page.clock.fastForward(16000);
  await expectStatus("failed");

  await start();
  await expectStatus("available");
  await emit("loading_started");
  await expectStatus("loading");
  await page.clock.fastForward(61000);
  await expectStatus("timeout");

  await start({ delaySnapshot: true });
  await page.waitForFunction(() => !!window.modelTest.resolveSnapshot);
  await emit("loading_failed");
  await expectStatus("failed");
  await page.evaluate(() => window.modelTest.resolveSnapshot());
  await expectStatus("failed"); // A stale initial response cannot hide an event.
  console.log(
    "useBundledModel: offline rescan/recovery/error alerts, lifecycle, IPC recovery, StrictMode, timeout and stale-response checks passed",
  );
} finally {
  await browser.close();
}
