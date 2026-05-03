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
import { detectBackends, selectBackendForFile, convertFile, fileCategory } from "./utils/backends";

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

  for (const item of selected) {
    const src = path.resolve(item.path);
    const ext = path.extname(src);
    const base = path.basename(src, ext);
    const outputPath = path.join(path.dirname(src), `${base}.pdf`);

    const backend = selectBackendForFile(preferredByCategory[fileCategory(ext)], available, ext);

    if (!backend) {
      const msg = `No engine supports ${ext} files — install LibreOffice for full format support.`;
      console.error(`[slides2pdf] ${msg}`);
      errors.push({ base, message: msg });
      continue;
    }

    try {
      await showToast(
        Toast.Style.Animated,
        `Converting ${base} via ${backend.label} — ${producedFiles.length}/${total}`,
      );
      console.log(`[slides2pdf] Converting "${base}" via ${backend.label}`);

      convertFile(backend, src, outputPath);

      if (!fs.existsSync(outputPath)) {
        const nearby = fs.readdirSync(path.dirname(outputPath)).filter((f) => f.startsWith(base));
        console.log(`[slides2pdf] Expected: ${outputPath}`);
        console.log(`[slides2pdf] Files matching "${base}" in output dir:`, nearby);
        throw new Error("Output file not found after conversion: " + outputPath);
      }

      producedFiles.push(outputPath);

      if (selected.length === 1 && openAfterConvertSingle) {
        await open(outputPath);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[slides2pdf] Failed to convert "${base}":`, message);
      errors.push({ base, message });
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
