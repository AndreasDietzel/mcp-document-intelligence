/**
 * Configuration Module
 * Manages server and runtime configuration
 *
 * ISO 25010: Maintainability (Modularity, Reusability)
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface ServerConfig {
  ocrLanguage: string;
  ocrTimeout: number;
  maxFileSize: number;
  maxTextPreview: number;
  maxFilenameLength: number;
  enableAI: boolean;
  perplexityApiKey?: string;
  perplexityModel: string;
  aiConfidenceThreshold: number;
  birthDate?: string;
  customCompanies: string[];
}

export const DEFAULT_CONFIG: ServerConfig = {
  ocrLanguage: "deu",
  ocrTimeout: 30_000,
  maxFileSize: 100 * 1024 * 1024,
  maxTextPreview: 2000,
  maxFilenameLength: 255,
  enableAI: false,
  perplexityModel: "sonar",
  aiConfidenceThreshold: 0.5,
  customCompanies: [],
};

const CONFIG_PATH = path.join(os.homedir(), ".mcp-doc-intel.json");

export const SUPPORTED_EXTENSIONS = new Set([
  ".pdf", ".docx", ".doc", ".pages",
  ".png", ".jpg", ".jpeg", ".tiff", ".bmp",
  ".txt", ".rtf",
  ".odt",
]);

export function loadConfig(): ServerConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, "utf-8");
      return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
    }
  } catch {
    // Fall through to defaults
  }
  return { ...DEFAULT_CONFIG };
}

export function getConfigPath(): string {
  return CONFIG_PATH;
}
