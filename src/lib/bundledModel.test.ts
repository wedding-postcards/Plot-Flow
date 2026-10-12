// Run with a TypeScript-capable runner, or transpile with the installed TypeScript.
import assert from "node:assert/strict";
import { getBundledModelStatus, withTimeout } from "./bundledModel";

async function test() {
  const model = {
    id: "gigaam-v3-e2e-ctc",
    name: "GigaAM v3",
    is_downloaded: true,
  };
  const unloaded = { is_loaded: false, current_model: null };
  assert.equal(getBundledModelStatus("", null, unloaded), "missing");
  assert.equal(getBundledModelStatus(model.id, model, unloaded), "available");
  assert.equal(
    getBundledModelStatus(
      model.id,
      { ...model, is_downloaded: false },
      unloaded,
    ),
    "missing",
  );
  assert.equal(
    getBundledModelStatus(
      "whisper",
      { ...model, id: "whisper", name: "Whisper" },
      unloaded,
    ),
    "missing",
  );
  assert.equal(
    getBundledModelStatus(model.id, model, {
      is_loaded: true,
      current_model: model.id,
    }),
    "ready",
  );
  assert.equal(
    getBundledModelStatus(model.id, model, {
      is_loaded: true,
      current_model: "whisper",
    }),
    "missing",
  );
  assert.equal(await withTimeout(Promise.resolve(42), 50), 42);
  await assert.rejects(
    withTimeout(Promise.reject(new Error("IPC failed")), 50),
    /IPC failed/,
  );
  await assert.rejects(withTimeout(new Promise(() => {}), 10), /timed out/);
  // Late responses cannot resolve an already timed-out request.
  await assert.rejects(
    withTimeout(new Promise((resolve) => setTimeout(resolve, 30)), 5),
    /timed out/,
  );
  console.log("bundledModel: 10 assertions passed");
}
void test();
