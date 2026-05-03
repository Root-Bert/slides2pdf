# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A [Raycast](https://raycast.com) extension that converts PowerPoint (`.pptx`) files to PDF using LibreOffice in headless mode. It requires LibreOffice (`soffice`) to be installed locally — there is no bundled converter.

## Commands

```bash
npm run dev        # Run in Raycast development mode (hot reload)
npm run build      # Build the extension
npm run lint       # Lint with Raycast's ESLint config
npm run fix-lint   # Auto-fix lint issues
npx tsc --noEmit   # Type-check without emitting output
npm run publish    # Publish to Raycast Store (not npm)
```

There is no test suite — CI runs typecheck and lint only.

## Architecture

Two Raycast commands, each a single source file:

- **`src/convert-to-pdf.ts`** — `no-view` command. Gets files selected in Finder, locates `soffice` (PATH → common macOS paths), calls `execFileSync` with `--headless --convert-to pdf`, and shows Raycast toast notifications for progress and results. Respects two preferences (`openAfterConvertSingle`, `openAfterConvertBatch`) to auto-open produced PDFs.

- **`src/install-libreoffice.tsx`** — `view` command. A checklist UI (using `useCachedState` from `@raycast/utils`) that guides users through installing Homebrew and LibreOffice. On mount it auto-detects both tools via `execFileSync("/bin/zsh", ["-lc", "command -v ..."])` and marks steps complete if found.

Extension preferences and command metadata are declared in `package.json` under `"commands"` and `"preferences"` — Raycast reads these at build time.

## Key constraints

- macOS only (`"platforms": ["macOS"]` in `package.json`).
- `soffice` resolution order: `which soffice` via `spawnSync`, then `/Applications/LibreOffice.app/Contents/MacOS/soffice`, `/usr/local/bin/soffice`, `/opt/homebrew/bin/soffice`.
- PDFs are written to the same directory as the source file (`outdir = path.dirname(src)`).
- The main window is closed immediately via `closeMainWindow()` so conversion runs in the background without blocking Raycast.
