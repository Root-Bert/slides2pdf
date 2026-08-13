import { LocalStorage } from "@raycast/api";

// Raycast runs every command in its own process, so the Stop Conversion command cannot reach the
// running conversion directly. Both sides meet in LocalStorage: the conversion leaves a heartbeat
// while it works and watches for a stop request between files.
const HEARTBEAT = "conversionHeartbeat";
const STOP_REQUESTED = "conversionStopRequested";

// A single file may occupy an engine for up to its ten-minute timeout, so a heartbeat older than
// that is not a slow conversion but a run that died without clearing up.
const STALE_AFTER_MS = 11 * 60 * 1000;

export async function beginConversion(): Promise<void> {
  await LocalStorage.removeItem(STOP_REQUESTED);
  await markAlive();
}

export async function markAlive(): Promise<void> {
  await LocalStorage.setItem(HEARTBEAT, Date.now().toString());
}

export async function endConversion(): Promise<void> {
  await LocalStorage.removeItem(HEARTBEAT);
  await LocalStorage.removeItem(STOP_REQUESTED);
}

export async function isStopRequested(): Promise<boolean> {
  return (await LocalStorage.getItem<string>(STOP_REQUESTED)) !== undefined;
}

export async function isConversionRunning(): Promise<boolean> {
  const beat = await LocalStorage.getItem<string>(HEARTBEAT);
  const at = Number(beat);
  return Boolean(beat) && Number.isFinite(at) && Date.now() - at < STALE_AFTER_MS;
}

export async function requestStop(): Promise<void> {
  await LocalStorage.setItem(STOP_REQUESTED, "1");
}
