/**
 * Security Module
 * ISO 25010 Security Quality Attributes:
 * - Confidentiality: Protect sensitive data (API keys, file content)
 * - Integrity: Validate all input data
 * - Authenticity: Verify data sources
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { SUPPORTED_EXTENSIONS } from "./config.js";

export const LIMITS = {
  MAX_FILE_SIZE: 100 * 1024 * 1024,
  MAX_FILENAME_LENGTH: 255,
  MAX_PATH_LENGTH: 4096,
  MAX_TEXT_LENGTH: 10 * 1024 * 1024,
  API_KEY_MIN_LENGTH: 10,
  API_KEY_MAX_LENGTH: 200,
} as const;

/**
 * Normalizes Unicode to NFC (macOS uses NFD internally).
 */
export function normalizeUnicode(str: string): string {
  return str ? str.normalize("NFC") : "";
}

/**
 * Expand home directory tildes in paths.
 * "~/Documents" → "/Users/username/Documents"
 * Matches the official MCP filesystem server pattern.
 */
export function expandHome(filepath: string): string {
  if (filepath === "~") return os.homedir();
  if (filepath.startsWith("~/") || filepath.startsWith("~\\")) {
    return path.join(os.homedir(), filepath.slice(1));
  }
  return filepath;
}

/**
 * Trim whitespace and remove surrounding quotes from path strings.
 * MCP clients sometimes send paths with extra quotes or whitespace.
 */
export function trimPath(p: string): string {
  if (!p) return p;
  return p.trim().replace(/^["']|["']$/g, "");
}

/**
 * Fix broken iCloud paths where MCP clients strip tildes.
 * "comappleCloudDocs" → "com~apple~CloudDocs"
 */
export function fixICloudPath(inputPath: string): string {
  if (!inputPath) return inputPath;
  // Fix the most common pattern: "comappleCloudDocs" → "com~apple~CloudDocs"
  let fixed = inputPath.replace(
    /Mobile Documents\/comappleCloudDocs/g,
    "Mobile Documents/com~apple~CloudDocs",
  );
  // Also handle other iCloud container patterns: "comapple<Name>" → "com~apple~<Name>"
  fixed = fixed.replace(
    /Mobile Documents\/comapple([A-Z])/g,
    "Mobile Documents/com~apple~$1",
  );
  if (fixed !== inputPath) {
    console.error(`[fixICloudPath] Repaired: "${inputPath}" → "${fixed}"`);
  }
  return fixed;
}

/**
 * Sanitize filename — removes dangerous characters, preserves umlauts.
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== "string") return "unnamed";
  let s = normalizeUnicode(filename);
  s = s.replace(/[\x00-\x1f\x7f<>:"|?*]/g, "");
  s = s.replace(/[\\\/]/g, "_");
  s = s.replace(/\s+/g, "_").replace(/\.+/g, ".").replace(/_+/g, "_");
  s = s.replace(/^[._]+|[._]+$/g, "").trim();
  if (s.length > LIMITS.MAX_FILENAME_LENGTH) {
    const ext = path.extname(s);
    s = s.slice(0, LIMITS.MAX_FILENAME_LENGTH - ext.length) + ext;
  }
  const reserved = /^(CON|PRN|AUX|NUL|COM\d|LPT\d)$/i;
  if (reserved.test(path.basename(s, path.extname(s)))) s = "_" + s;
  return s || "unnamed";
}

/**
 * Validate file path — prevents path traversal, rejects symlinks and oversized files.
 */
export function validateFilePath(filePath: string): { valid: boolean; error?: string } {
  if (!filePath || typeof filePath !== "string") {
    return { valid: false, error: "No file path provided" };
  }
  if (filePath.length > LIMITS.MAX_PATH_LENGTH) {
    return { valid: false, error: "Path too long" };
  }
  const abs = path.resolve(filePath);
  if (abs !== path.normalize(abs)) {
    return { valid: false, error: "Path traversal detected" };
  }
  if (!fs.existsSync(abs)) {
    return { valid: false, error: "File not found" };
  }
  const stats = fs.lstatSync(abs);
  if (stats.isSymbolicLink()) {
    return { valid: false, error: "Symbolic links are not allowed" };
  }
  if (!stats.isFile()) {
    return { valid: false, error: "Path is not a regular file" };
  }
  if (stats.size > LIMITS.MAX_FILE_SIZE) {
    return { valid: false, error: `File too large (${Math.round(stats.size / 1024 / 1024)} MB)` };
  }
  const ext = path.extname(abs).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    return { valid: false, error: `Unsupported file type: ${ext}` };
  }
  return { valid: true };
}

/**
 * Validate directory path.
 */
export function validateDirPath(dirPath: string): { valid: boolean; error?: string } {
  if (!dirPath || typeof dirPath !== "string") {
    return { valid: false, error: "No directory path provided" };
  }
  const abs = path.resolve(dirPath);
  if (!fs.existsSync(abs)) {
    return { valid: false, error: `Directory not found: ${abs}` };
  }
  if (!fs.statSync(abs).isDirectory()) {
    return { valid: false, error: "Path is not a directory" };
  }
  return { valid: true };
}

/**
 * Validate Perplexity API key format.
 */
export function validateApiKey(key: string | undefined): { valid: boolean; error?: string } {
  if (!key) return { valid: false, error: "API key missing" };
  if (key.length < LIMITS.API_KEY_MIN_LENGTH) return { valid: false, error: "API key too short" };
  if (key.length > LIMITS.API_KEY_MAX_LENGTH) return { valid: false, error: "API key too long" };
  if (!/^[a-zA-Z0-9_-]+$/.test(key)) return { valid: false, error: "API key contains invalid characters" };
  return { valid: true };
}

/**
 * Mask API key for logging (first 8 + last 4 characters visible).
 */
export function maskApiKey(key: string): string {
  if (!key || key.length < 12) return "***";
  return `${key.slice(0, 8)}...${key.slice(-4)}`;
}

/**
 * Compute safe rename target — avoids collisions.
 */
export function safeRenamePath(dir: string, oldName: string, desiredName: string): string {
  let ext = path.extname(desiredName);
  if (!ext) {
    ext = path.extname(oldName);
    desiredName += ext;
  }
  const base = path.basename(desiredName, ext);
  let safeName = sanitizeFilename(base + ext);
  let target = path.join(dir, safeName);

  if (target.toLowerCase() === path.join(dir, oldName).toLowerCase()) return target;

  let counter = 1;
  while (fs.existsSync(target)) {
    if (path.resolve(target) === path.resolve(path.join(dir, oldName))) break;
    safeName = sanitizeFilename(`${base}_${counter}${ext}`);
    target = path.join(dir, safeName);
    counter++;
  }
  return target;
}

/**
 * Validate runtime environment.
 */
export function validateEnvironment(): { secure: boolean; warnings: string[] } {
  const warnings: string[] = [];
  if (process.getuid?.() === 0) warnings.push("Running as root — not recommended");
  for (const v of ["LD_PRELOAD", "DYLD_INSERT_LIBRARIES", "DYLD_LIBRARY_PATH"]) {
    if (process.env[v]) warnings.push(`Suspicious env variable: ${v}`);
  }
  return { secure: warnings.length === 0, warnings };
}

/**
 * Secure cleanup of temporary files (zero-fill before deletion).
 */
export function secureCleanup(paths: string[]): void {
  for (const p of paths) {
    try {
      if (!fs.existsSync(p)) continue;
      const size = fs.statSync(p).size;
      if (size < 100 * 1024 * 1024) fs.writeFileSync(p, Buffer.alloc(size, 0));
      fs.unlinkSync(p);
    } catch {
      // Best-effort cleanup
    }
  }
}
