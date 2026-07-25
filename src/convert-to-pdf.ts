import {
  showToast,
  Toast,
  getSelectedFinderItems,
  open,
  getPreferenceValues,
  closeMainWindow,
  launchCommand,
  LaunchType,
  LocalStorage,
} from "@raycast/api";
import path from "path";
import fs from "fs";
import { detectBackends, rankBackendsForFile, convertFile, fileCategory } from "./utils/backends";

export default async function Command() {
  const selected = await getSelectedFinderItems();

  if (!selected || selected.length === 0) {
    await showToast(Toast.Style.Failure, "No file selected", "Select a file in Finder and run the command again.");
    return;
  }

  try {
    closeMainWindow();
  } catch {
    // ignore
  }

  const prefs = getPreferenceValues<{
    openAfterConvertSingle?: boolean | string;
    openAfterConvertBatch?: boolean | string;
  }>();

  const openAfterConvertSingle = prefs.openAfterConvertSingle === true || prefs.openAfterConvertSingle === "true";
  const openAfterConvertBatch = prefs.openAfterConvertBatch === true || prefs.openAfterConvertBatch === "true";

  const [pp, pd, ps, pi] = await Promise.all([
    LocalStorage.getItem<string>("preferredPresentation"),
    LocalStorage.getItem<string>("preferredDocument"),
    LocalStorage.getItem<string>("preferredSpreadsheet"),
    LocalStorage.getItem<string>("preferredImage"),
  ]);
  const preferredByCategory: Record<string, string> = {
    presentation: pp ?? "auto",
    document: pd ?? "auto",
    spreadsheet: ps ?? "auto",
    image: pi ?? "auto",
    other: "auto",
  };

  const available = detectBackends();

  if (available.length === 0) {
    await showToast(Toast.Style.Failure, "No conversion engine found", "Opening setup guide…");
    try {
      await launchCommand({ name: "intro2pdf", type: LaunchType.UserInitiated });
    } catch {
      // ignore
    }
    return;
  }

  const producedFiles: string[] = [];
  const errors: { base: string; message: string }[] = [];
  const total = selected.length;

  for (const [index, item] of selected.entries()) {
    const src = path.resolve(item.path);
    const ext = path.extname(src);
    const base = path.basename(src, ext);
    const outputPath = path.join(path.dirname(src), `${base}.pdf`);

    const backends = rankBackendsForFile(preferredByCategory[fileCategory(ext)], available, ext);

    if (backends.length === 0) {
      const msg = `No engine supports ${ext} files — install LibreOffice for full format support.`;
      console.error(`[slides2pdf] ${msg}`);
      errors.push({ base, message: msg });
      continue;
    }

    // Try each capable engine in order — a flaky native app falls back to the next one.
    const attemptErrors: string[] = [];
    let converted = false;
    for (const backend of backends) {
      try {
        await showToast(Toast.Style.Animated, `Converting ${base} via ${backend.label} — ${index + 1}/${total}`);
        console.log(`[slides2pdf] Converting "${base}" via ${backend.label}`);

        convertFile(backend, src, outputPath);

        if (!fs.existsSync(outputPath)) {
          throw new Error(`${backend.label} produced no output file`);
        }

        producedFiles.push(outputPath);
        converted = true;
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[slides2pdf] ${backend.label} failed for "${base}":`, message);
        attemptErrors.push(`${backend.label}: ${message}`);
      }
    }

    if (!converted) {
      errors.push({ base, message: attemptErrors.join(" · ") });
    } else if (selected.length === 1 && openAfterConvertSingle) {
      await open(outputPath);
    }
  }

  if (selected.length > 1 && openAfterConvertBatch && producedFiles.length > 0) {
    for (const f of producedFiles) {
      try {
        await open(f);
      } catch {
        // ignore
      }
    }
  }

  if (errors.length > 0 && producedFiles.length === 0) {
    const firstError = errors[0];
    await showToast(Toast.Style.Failure, `Failed: "${firstError.base}"`, firstError.message);
  } else if (errors.length > 0) {
    await showToast(Toast.Style.Failure, `${errors.length} file(s) failed`, errors.map((e) => e.base).join(", "));
  } else if (producedFiles.length === 1) {
    await showToast(Toast.Style.Success, "Converted", path.basename(producedFiles[0]));
  } else {
    await showToast(Toast.Style.Success, "Converted", `${producedFiles.length} files`);
  }
}
