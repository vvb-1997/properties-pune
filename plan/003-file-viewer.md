# Plan: Files tab viewer (TODO.md "File tab features")

## Context
Files tab (built in plan/002) opens files with a plain link in a new browser tab. TODO.md now asks for:
1. A pop-up that opens a file by extension, with the type verified from file content.
2. Files load in the same browser tab (no new tab).

Decisions: Office files render in-page via CDN libs (mammoth.js for docx, SheetJS for xls/xlsx/csv), loaded on demand. Old `.doc` has no viewer and shows Download. A content/extension mismatch is rejected at upload (400) and the viewer re-checks.

Copy this plan to `plan/003-file-viewer.md` when implementing, and tick the two sub-items in `TODO.md`.

## 1. Server: magic-byte check (`server.js`)
- After `pipeline(...)` in `upload()` (server.js ~line 70), read the first 4 KB of `dest` and run `sniff(buf, ext)`; on mismatch `fs.promises.rm(dest)` and `send(res, 400, {error: 'content does not match .ext'})`. Reuse the existing cleanup pattern from the TOO_BIG branch.
- Signatures: pdf `%PDF`; png `89 50 4E 47`; jpg/jpeg `FF D8 FF`; gif `GIF8`; webp `RIFF....WEBP`; docx/xlsx `PK 03 04` (zip; docx vs xlsx not told apart, `shortcut:` comment); doc/xls `D0 CF 11 E0 A1 B1 1A E1`; txt/csv: no NUL byte in the first 4 KB.
- No other route changes: `GET /files/<id>` already serves nosniff and the right type.

## 2. Client viewer (`index.html`, Files section)
- Replace the "Open" `<a target=_blank>` in `renderFiles()` with `<button data-fopen="id">Open</button>`; handle it in the existing `#fl_table` click listener next to `data-fdel`.
- New `<dialog id="viewer">` (about `min(1100px,96vw)` x `90vh`, `background:var(--card)` like `dialog`), header with file name, Download link (`/files/<id>`) and Close.
- `openViewer(f)`: `fetch('/files/'+f.id)` to a blob, then client `sniff()` on the first bytes (same table as the server, small copy; shows a warning plus Download only on mismatch). Then render by extension:
  - pdf: `<iframe src=blobURL>` (blob typed `application/pdf`).
  - png/jpg/jpeg/webp/gif: `<img>`, max-width 100%.
  - txt: `<pre>` via `textContent`.
  - csv/xls/xlsx: SheetJS, build the table with `esc()` from `sheet_to_json(ws,{header:1})` (no `sheet_to_html`), sheet tabs if more than one, first 500 rows.
  - docx: `mammoth.convertToArrayBuffer` -> `convertToHtml`, shown in `<iframe sandbox srcdoc>` so converted HTML cannot run script.
  - doc / unknown: message plus Download.
- `loadScript(url)` helper (inject `<script>` once, cached promise) for `mammoth` and `xlsx` from jsDelivr, same style as the Chart.js tag. Load failure (offline): message plus Download.
- Revoke blob URLs on dialog `close`. Dark mode: use CSS vars; the docx iframe keeps a light background.

## 3. Docs
- README Files bullet: in-page viewer, which types render, `.doc` is download only, content check at upload, Office viewers need the CDN (internet).

## Risks / limits
- Content check is by header bytes only: a valid-header file with junk after it passes. It is not a malware scan.
- docx/xlsx cannot be told apart by magic bytes; a renamed docx<->xlsx passes the server and fails in the viewer with a parse message.
- Large xlsx parse on the main thread can briefly freeze the page; 25 MB cap and 500-row render cap limit it.
- Files uploaded before this change are not re-verified on disk; the viewer check covers them.

## Verification (Chrome, `node server.js`)
1. `curl` uploads: a PNG renamed `.pdf` -> 400; real pdf/png/jpg/docx/xlsx/csv/txt -> 200; binary renamed `.txt` -> 400; no leftover file in `files/`.
2. Files tab: Open a pdf, a png, a txt, a csv, an xlsx (multi-sheet), a docx: each renders in the pop-up with no new tab; Esc/Close works; a `.doc` shows Download.
3. Mismatch in viewer: copy a mislabelled file into `files/` + `index.json` by hand; viewer shows the warning.
4. Offline (block CDN): docx/xlsx show the fallback message; pdf/image still open.
5. Dark mode: pop-up readable. `<script>` inside a txt/csv/docx is not executed. Console clean; `node --check server.js`.
