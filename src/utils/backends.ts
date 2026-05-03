import { execFileSync, spawnSync } from "child_process";
import fs from "fs";
import path from "path";

export type BackendType = "keynote" | "powerpoint" | "pages" | "word" | "numbers" | "excel" | "libreoffice" | "sips";

export interface Backend {
  type: BackendType;
  label: string;
  path: string;
  appName?: string;
}

export type FileCategory = "presentation" | "document" | "spreadsheet" | "image" | "other";

const PRESENTATION_EXTS = new Set([".pptx", ".ppt", ".pps", ".ppsx", ".key", ".odp"]);
const DOCUMENT_EXTS = new Set([".docx", ".doc", ".pages", ".odt", ".rtf", ".txt"]);
const SPREADSHEET_EXTS = new Set([".xlsx", ".xls", ".numbers", ".ods", ".csv"]);
const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".gif", ".tiff", ".tif", ".bmp", ".heic", ".webp"]);

// Per-backend: which extensions can it actually open?
// Apple apps open their native format + MS formats; MS apps don't open Apple formats
const BACKEND_EXTS: Record<BackendType, Set<string>> = {
  keynote: PRESENTATION_EXTS,
  powerpoint: new Set([".pptx", ".ppt", ".pps", ".ppsx", ".odp"]),
  pages: DOCUMENT_EXTS,
  word: new Set([".docx", ".doc", ".odt", ".rtf", ".txt"]),
  numbers: SPREADSHEET_EXTS,
  excel: new Set([".xlsx", ".xls", ".ods", ".csv"]),
  libreoffice: new Set([...PRESENTATION_EXTS, ...DOCUMENT_EXTS, ...SPREADSHEET_EXTS, ...IMAGE_EXTS]),
  sips: IMAGE_EXTS,
};

// Priority order per file category
const PRIORITY: Record<FileCategory, BackendType[]> = {
  presentation: ["keynote", "powerpoint", "libreoffice"],
  document: ["pages", "word", "libreoffice"],
  spreadsheet: ["numbers", "excel", "libreoffice"],
  image: ["sips", "libreoffice"],
  other: ["libreoffice"],
};

const SOFFICE_BINS = [
  "/Applications/LibreOffice.app/Contents/MacOS/soffice",
  "/opt/homebrew/bin/soffice",
  "/usr/local/bin/soffice",
];

// Filesystem-based detection — avoids `osascript "path to application"`, which can launch apps as a side effect
const APP_SEARCH_DIRS = [
  "/Applications",
  "/System/Applications",
  process.env.HOME ? path.join(process.env.HOME, "Applications") : "",
].filter(Boolean);

// Each backend lists every bundle name it might appear under.
// "Creator Studio" variants are App Store editions sold under a different bundle name.
type AppBackendType = "keynote" | "powerpoint" | "pages" | "word" | "numbers" | "excel";
const APP_CANDIDATES: Record<AppBackendType, string[]> = {
  keynote: ["Keynote", "Keynote Creator Studio"],
  powerpoint: ["Microsoft PowerPoint", "Microsoft PowerPoint Creator Studio"],
  pages: ["Pages", "Pages Creator Studio"],
  word: ["Microsoft Word", "Microsoft Word Creator Studio"],
  numbers: ["Numbers", "Numbers Creator Studio"],
  excel: ["Microsoft Excel", "Microsoft Excel Creator Studio"],
};

function findApp(candidates: string[]): { path: string; name: string } | null {
  for (const dir of APP_SEARCH_DIRS) {
    for (const name of candidates) {
      const p = path.join(dir, `${name}.app`);
      if (fs.existsSync(p)) return { path: p, name };
    }
  }
  return null;
}

function findSoffice(): string | null {
  const onPath = spawnSync("which", ["soffice"]);
  if (onPath.status === 0) {
    const trimmed = String(onPath.stdout).trim();
    if (trimmed) return trimmed;
  }
  return SOFFICE_BINS.find((p) => fs.existsSync(p)) ?? null;
}

export function fileCategory(ext: string): FileCategory {
  const e = ext.toLowerCase();
  if (PRESENTATION_EXTS.has(e)) return "presentation";
  if (DOCUMENT_EXTS.has(e)) return "document";
  if (SPREADSHEET_EXTS.has(e)) return "spreadsheet";
  if (IMAGE_EXTS.has(e)) return "image";
  return "other";
}

export function detectBackends(): Backend[] {
  const found: Backend[] = [];

  for (const type of Object.keys(APP_CANDIDATES) as AppBackendType[]) {
    const app = findApp(APP_CANDIDATES[type]);
    if (app) found.push({ type, label: app.name, path: app.path, appName: app.name });
  }

  const sofficePath = findSoffice();
  if (sofficePath) {
    found.push({ type: "libreoffice", label: "LibreOffice", path: sofficePath });
  }

  // sips ships with every macOS install — converts an image to a single-page PDF sized to the image
  if (fs.existsSync("/usr/bin/sips")) {
    found.push({ type: "sips", label: "sips", path: "/usr/bin/sips" });
  }

  return found;
}

export function supportsExtension(type: BackendType, ext: string): boolean {
  return BACKEND_EXTS[type].has(ext.toLowerCase());
}

export function selectBackendForFile(preferred: string, available: Backend[], ext: string): Backend | null {
  const capable = available.filter((b) => supportsExtension(b.type, ext));
  if (capable.length === 0) return null;
  if (preferred !== "auto") {
    const match = capable.find((b) => b.type === preferred);
    if (match) return match;
  }
  for (const type of PRIORITY[fileCategory(ext)]) {
    const match = capable.find((b) => b.type === type);
    if (match) return match;
  }
  return capable[0];
}

function runAppleScript(script: string, tag: string): void {
  console.log(`[slides2pdf:${tag}] script:\n${script}`);
  try {
    const stdout = execFileSync("osascript", ["-e", script], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    if (stdout.trim()) console.log(`[slides2pdf:${tag}] stdout:`, stdout.trim());
  } catch (e) {
    const err = e as { stdout?: string; stderr?: string; message?: string };
    console.error(`[slides2pdf:${tag}] stderr:`, err.stderr);
    throw new Error(err.stderr?.trim() || err.message || String(e));
  }
}

// Apple iWork apps: export as PDF. exportProps is app-specific (only Keynote supports PDF image quality).
// try/end try around export ensures close+quit always runs even if export fails.
function appleAppScript(appName: string, src: string, outputPath: string, exportProps?: string): string {
  const withProps = exportProps ? ` with properties {${exportProps}}` : "";
  return [
    `set wasRunning to (application "${appName}" is running)`,
    `tell application "${appName}"`,
    `  set theDoc to open POSIX file ${JSON.stringify(src)}`,
    `  try`,
    `    export theDoc to POSIX file ${JSON.stringify(outputPath)} as PDF${withProps}`,
    `  end try`,
    `  try`,
    `    close theDoc saving no`,
    `  end try`,
    `  if not wasRunning then quit`,
    `end tell`,
  ].join("\n");
}

// PowerPoint: save theDoc in outFile as save as PDF (output must be POSIX file object, not plain string)
function powerpointScript(appName: string, src: string, outputPath: string): string {
  return [
    `set wasRunning to (application "${appName}" is running)`,
    `tell application "${appName}"`,
    `  open POSIX file ${JSON.stringify(src)}`,
    `  set tries to 0`,
    `  repeat while (count of presentations) is 0`,
    `    delay 0.5`,
    `    set tries to tries + 1`,
    `    if tries > 20 then error "Timed out waiting for ${appName} to open the file"`,
    `  end repeat`,
    `  set theDoc to presentation 1`,
    `  set outFile to POSIX file ${JSON.stringify(outputPath)}`,
    `  try`,
    `    save theDoc in outFile as save as PDF`,
    `  end try`,
    `  try`,
    `    close theDoc saving no`,
    `  end try`,
    `  if not wasRunning then quit`,
    `end tell`,
  ].join("\n");
}

// Word and Excel: save as theDoc file name outFile file format format PDF
// collection = "documents" (Word) or "workbooks" (Excel)
function wordExcelScript(appName: string, collection: string, src: string, outputPath: string): string {
  const docRef = collection.replace(/s$/, "") + " 1";
  return [
    `set wasRunning to (application "${appName}" is running)`,
    `tell application "${appName}"`,
    `  open POSIX file ${JSON.stringify(src)}`,
    `  set tries to 0`,
    `  repeat while (count of ${collection}) is 0`,
    `    delay 0.5`,
    `    set tries to tries + 1`,
    `    if tries > 20 then error "Timed out waiting for ${appName} to open the file"`,
    `  end repeat`,
    `  set theDoc to ${docRef}`,
    `  set outFile to POSIX file ${JSON.stringify(outputPath)}`,
    `  try`,
    `    save as theDoc file name outFile file format format PDF`,
    `  end try`,
    `  try`,
    `    close theDoc saving no`,
    `  end try`,
    `  if not wasRunning then quit`,
    `end tell`,
  ].join("\n");
}

type AppleScriptBuilder = (appName: string, src: string, outputPath: string) => string;

const APPLE_SCRIPT_BUILDERS: Record<AppBackendType, AppleScriptBuilder> = {
  keynote: (app, src, out) => appleAppScript(app, src, out, "PDF image quality:Best"),
  pages: appleAppScript,
  numbers: appleAppScript,
  powerpoint: powerpointScript,
  word: (app, src, out) => wordExcelScript(app, "documents", src, out),
  excel: (app, src, out) => wordExcelScript(app, "workbooks", src, out),
};

export function convertFile(backend: Backend, src: string, outputPath: string): void {
  if (backend.type === "libreoffice") {
    execFileSync(backend.path, ["--headless", "--convert-to", "pdf", "--outdir", path.dirname(outputPath), src], {
      stdio: "ignore",
    });
    return;
  }

  if (backend.type === "sips") {
    execFileSync(backend.path, ["-s", "format", "pdf", src, "--out", outputPath], { stdio: "ignore" });
    return;
  }

  // Remaining types are AppleScript-driven; detectBackends always sets appName for them
  const buildScript = APPLE_SCRIPT_BUILDERS[backend.type];
  runAppleScript(buildScript(backend.appName!, src, outputPath), backend.type);
}
