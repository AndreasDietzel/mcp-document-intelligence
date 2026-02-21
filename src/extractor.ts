/**
 * Text Extraction Engine
 * Extracts text from PDF, DOCX, Pages, Images, TXT, RTF, DOC, ODT
 * with OCR fallback for scanned documents.
 *
 * ISO 25010: Functional Suitability, Reliability
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { createRequire } from "module";
import { exec, execSync } from "child_process";
import * as util from "util";
import { normalizeUnicode } from "./security.js";
import type { ServerConfig } from "./config.js";

const require = createRequire(import.meta.url);
const execAsync = util.promisify(exec);

// --- Lazy-loaded optional dependencies ---
function loadPdfParse(): any | null {
  try { return require("pdf-parse"); }
  catch { return null; }
}

function loadMammoth(): any | null {
  try { return require("mammoth"); }
  catch { return null; }
}

function loadAdmZip(): any | null {
  try { return require("adm-zip"); }
  catch { return null; }
}

// --- OCR Helpers ---

async function performOCR(filePath: string, isPdf: boolean, config: ServerConfig): Promise<string> {
  const tmpBase = path.join(os.homedir(), ".mcp_tmp");
  if (!fs.existsSync(tmpBase)) fs.mkdirSync(tmpBase, { recursive: true });

  const tmpDir = path.join(tmpBase, `ocr_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    let images: string[] = [];

    if (isPdf) {
      try {
        await execAsync(
          `pdftoppm -png -r 300 -f 1 -l 5 "${filePath}" "${path.join(tmpDir, "page")}"`,
          { timeout: config.ocrTimeout }
        );
        images = fs.readdirSync(tmpDir)
          .filter((f) => f.endsWith(".png"))
          .sort()
          .map((f) => path.join(tmpDir, f));
      } catch {
        return "[PDF OCR requires 'pdftoppm' (poppler)]";
      }
    } else {
      images = [filePath];
    }

    let text = "";
    const lang = config.ocrLanguage || "deu";

    for (const img of images) {
      try {
        const { stdout } = await execAsync(
          `tesseract "${img}" stdout -l ${lang} --psm 6`,
          { timeout: config.ocrTimeout }
        );
        text += stdout + "\n";
      } catch {
        // Individual page OCR failure — continue with remaining
      }
    }

    return text.trim() || "[OCR yielded no text]";
  } catch (e: any) {
    return `[OCR failed: ${e.message}]`;
  } finally {
    try {
      if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch { /* cleanup best-effort */ }
  }
}

// --- macOS textutil fallback ---

function extractWithTextutil(filePath: string): string | null {
  try {
    const result = execSync(`textutil -convert txt -stdout "${filePath}"`, {
      timeout: 15_000,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.trim().length > 10 ? result.trim() : null;
  } catch {
    return null;
  }
}

// --- Apple IWA (Protobuf) extraction for Pages ---

function extractTextFromIWA(data: Buffer): string {
  let raw = Buffer.alloc(0);
  let pos = 0;
  try {
    while (pos < data.length) {
      if (pos + 4 > data.length) break;
      pos += 1; // frame type
      const len = data[pos] | (data[pos + 1] << 8) | (data[pos + 2] << 16);
      pos += 3;
      if (pos + len > data.length) break;
      raw = Buffer.concat([raw, data.subarray(pos, pos + len)]);
      pos += len;
    }
  } catch {
    raw = Buffer.from(data);
  }

  const parts: string[] = [];
  const regex = /[\x20-\x7e\u00c0-\u024f]{8,}/g;
  const rawStr = raw.toString("latin1");
  let match: RegExpExecArray | null;
  while ((match = regex.exec(rawStr)) !== null) {
    const s = match[0];
    if (/^[i]+$/.test(s)) continue;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}/.test(s)) continue;
    if (/^[A-Z0-9_]{20,}$/.test(s)) continue;
    parts.push(s);
  }
  return parts.join(" ");
}

// --- Main extraction function ---

export async function extractText(filePath: string, config: ServerConfig): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  const pdfParse = loadPdfParse();
  const mammoth = loadMammoth();
  const AdmZip = loadAdmZip();

  try {
    // --- Plain Text ---
    if (ext === ".txt") {
      let content = fs.readFileSync(filePath, "utf-8");
      if (content.includes("\uFFFD") || content.includes("�")) {
        content = fs.readFileSync(filePath).toString("latin1");
      }
      return content.replace(/\0/g, " ");
    }

    // --- RTF ---
    if (ext === ".rtf") {
      const tu = extractWithTextutil(filePath);
      if (tu) return tu;
      const raw = fs.readFileSync(filePath, "utf-8");
      const stripped = raw
        .replace(/\{\\[^{}]*\}/g, "")
        .replace(/\\[a-z]+\d*\s?/gi, "")
        .replace(/[{}]/g, "");
      return stripped.trim();
    }

    // --- PDF ---
    if (ext === ".pdf") {
      if (pdfParse) {
        try {
          const buf = fs.readFileSync(filePath);
          const data = await pdfParse(buf);
          if (data.text?.trim().length > 50) return data.text.trim();
        } catch { /* fall through to OCR */ }
      }
      return await performOCR(filePath, true, config);
    }

    // --- DOCX ---
    if (ext === ".docx") {
      if (mammoth) {
        try {
          const result = await mammoth.extractRawText({ path: filePath });
          if (result.value?.trim().length > 10) return result.value.trim();
        } catch { /* fall through */ }
      }
      const tu = extractWithTextutil(filePath);
      if (tu) return tu;
      return "";
    }

    // --- DOC (legacy Word) ---
    if (ext === ".doc") {
      const tu = extractWithTextutil(filePath);
      if (tu) return tu;
      return "";
    }

    // --- ODT ---
    if (ext === ".odt") {
      const tu = extractWithTextutil(filePath);
      if (tu) return tu;
      return "";
    }

    // --- Pages ---
    if (ext === ".pages") {
      if (AdmZip) {
        try {
          const zip = new AdmZip(filePath);
          const entries = zip.getEntries();

          // Older format: index.xml
          const indexEntry = entries.find((e: any) => e.entryName === "index.xml");
          if (indexEntry) return indexEntry.getData().toString("utf8");

          // Newer format: IWA protobuf
          const docEntry = entries.find((e: any) => e.entryName === "Index/Document.iwa");
          if (docEntry) {
            const text = extractTextFromIWA(docEntry.getData());
            if (text.length > 10) return text;
          }

          // Fallback: QuickLook preview PDF
          const qlEntry = entries.find((e: any) => e.entryName.includes("QuickLook/Preview.pdf"));
          if (qlEntry && pdfParse) {
            const pdfData = await pdfParse(qlEntry.getData());
            if (pdfData.text?.trim().length > 10) return pdfData.text.trim();
          }
        } catch { /* fall through */ }
      }
      return "";
    }

    // --- Images ---
    if ([".jpg", ".jpeg", ".png", ".tiff", ".bmp"].includes(ext)) {
      return await performOCR(filePath, false, config);
    }
  } catch (e: any) {
    return `[Extraction error: ${e.message}]`;
  }

  return "";
}
