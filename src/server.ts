#!/usr/bin/env node

/**
 * MCP Document Intelligence Server v5.0.0
 *
 * A Model Context Protocol server for intelligent document analysis,
 * OCR processing, AI-powered classification, and file organization.
 *
 * Architecture: Modular design following ISO 25010 quality model
 * - Functional Suitability: Complete document lifecycle management
 * - Performance Efficiency: Lazy loading, streaming, batch processing
 * - Security: Input validation, path traversal protection, API key masking
 * - Reliability: Graceful degradation, undo/rollback, error isolation
 * - Maintainability: Clean module separation, typed interfaces
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as crypto from "crypto";

import { loadConfig, SUPPORTED_EXTENSIONS } from "./config.js";
import {
  normalizeUnicode,
  sanitizeFilename,
  validateFilePath,
  validateDirPath,
  safeRenamePath,
  validateEnvironment,
} from "./security.js";
import { extractText } from "./extractor.js";
import {
  analyzeWithAI,
  buildAIFilename,
  extractDocumentDate,
  extractReferences,
  extractKeywords,
} from "./ai-analysis.js";
import { recordOperation, undoLastBatch, getUndoStats } from "./undo.js";

const config = loadConfig();

// ─── Helpers ────────────────────────────────────────────────────────────────

function fileHash(filePath: string): string {
  try {
    const buf = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(buf).digest("hex");
  } catch {
    return "";
  }
}

function collectFiles(
  dir: string,
  recursive: boolean,
  fileTypes?: string[],
  keywords?: string[],
  maxDepth = 10,
  depth = 0,
): string[] {
  if (depth > maxDepth) return [];
  const results: string[] = [];

  try {
    for (const item of fs.readdirSync(dir)) {
      if (item.startsWith(".")) continue;
      const full = path.join(dir, item);

      try {
        const st = fs.statSync(full);
        if (st.isDirectory() && recursive) {
          results.push(...collectFiles(full, true, fileTypes, keywords, maxDepth, depth + 1));
        } else if (st.isFile()) {
          const ext = path.extname(item).toLowerCase();
          if (fileTypes?.length && !fileTypes.includes(ext.slice(1))) continue;
          if (!SUPPORTED_EXTENSIONS.has(ext)) continue;
          if (keywords?.length && !keywords.some((k) => item.toLowerCase().includes(k.toLowerCase()))) continue;
          results.push(full);
        }
      } catch { continue; }
    }
  } catch { /* skip unreadable dirs */ }

  return results;
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}

async function analyzeDocument(filePath: string): Promise<Record<string, any>> {
  const text = await extractText(filePath, config);
  const ext = path.extname(filePath);
  const originalName = path.basename(filePath);

  const date = await extractDocumentDate(text, originalName, filePath, config);
  const references = extractReferences(text);
  const keywords = extractKeywords(text);
  const aiResult = await analyzeWithAI(text, config);

  let suggestedFilename = originalName;
  if (aiResult && aiResult.confidence >= (config.aiConfidenceThreshold || 0.5)) {
    suggestedFilename = buildAIFilename(aiResult, date, ext);
  } else {
    const parts: string[] = [];
    if (date) parts.push(date);
    if (keywords.length > 0) parts.push(...keywords.slice(0, 3));
    if (references.length > 0) parts.push(references[0]);
    if (parts.length > 0) {
      suggestedFilename = sanitizeFilename(parts.join("_") + ext);
    }
  }

  return {
    originalFilename: originalName,
    suggestedFilename,
    documentDate: date,
    references,
    keywords,
    textLength: text.length,
    preview: text.slice(0, config.maxTextPreview),
    documentType: ext.slice(1),
    aiAnalysis: aiResult
      ? {
          category: aiResult.category,
          company: aiResult.company,
          documentType: aiResult.documentType,
          confidence: aiResult.confidence,
        }
      : null,
    renameRecommended: suggestedFilename !== originalName,
  };
}

// ─── Server ─────────────────────────────────────────────────────────────────

const server = new Server(
  { name: "mcp-document-intelligence", version: "5.0.0" },
  { capabilities: { tools: {} } },
);

// ─── Tool Definitions ───────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "scan_directory",
      description: "Scan a directory for documents and return filename + content preview (OCR-enabled). Supports PDF, DOCX, DOC, Pages, images, TXT, RTF, ODT.",
      inputSchema: {
        type: "object" as const,
        properties: {
          path: { type: "string" as const, description: "Absolute path to directory" },
          recursive: { type: "boolean" as const, description: "Scan subdirectories (default: false)" },
        },
        required: ["path"],
      },
    },
    {
      name: "analyze_document",
      description: "Deep-analyze a single document: extract text (with OCR fallback), detect dates, references, keywords, and suggest an intelligent filename. Optionally uses Perplexity AI for classification.",
      inputSchema: {
        type: "object" as const,
        properties: {
          filePath: { type: "string" as const, description: "Absolute path to document file" },
        },
        required: ["filePath"],
      },
    },
    {
      name: "analyze_folder",
      description: "Batch-analyze all documents in a folder. Returns metadata, filename suggestions, duplicate detection, and performance metrics.",
      inputSchema: {
        type: "object" as const,
        properties: {
          folderPath: { type: "string" as const, description: "Absolute path to folder" },
          recursive: { type: "boolean" as const, description: "Include subdirectories (default: false)" },
          fileTypes: { type: "array" as const, items: { type: "string" as const }, description: "Filter by extension (e.g. ['pdf','docx'])" },
        },
        required: ["folderPath"],
      },
    },
    {
      name: "rename_document",
      description: "Safely rename a document with collision protection and undo tracking.",
      inputSchema: {
        type: "object" as const,
        properties: {
          originalPath: { type: "string" as const, description: "Absolute path of the file" },
          newName: { type: "string" as const, description: "Desired new filename (e.g. '2024-01-01_Invoice.pdf')" },
        },
        required: ["originalPath", "newName"],
      },
    },
    {
      name: "move_document",
      description: "Move a document to a different directory with collision protection and undo tracking. Creates target directory if needed.",
      inputSchema: {
        type: "object" as const,
        properties: {
          filePath: { type: "string" as const, description: "Absolute path of the file to move" },
          targetDirectory: { type: "string" as const, description: "Absolute path of destination folder" },
        },
        required: ["filePath", "targetDirectory"],
      },
    },
    {
      name: "smart_rename",
      description: "AI-powered smart rename: analyzes document content and renames it intelligently based on detected date, company, document type, and reference numbers. Uses Perplexity AI when configured, falls back to pattern matching.",
      inputSchema: {
        type: "object" as const,
        properties: {
          filePath: { type: "string" as const, description: "Absolute path of the file to analyze and rename" },
          dryRun: { type: "boolean" as const, description: "Preview only — do not rename (default: false)" },
        },
        required: ["filePath"],
      },
    },
    {
      name: "find_folder",
      description: "Fuzzy-search for a folder by name. Supports typo tolerance via Levenshtein distance and returns ranked matches.",
      inputSchema: {
        type: "object" as const,
        properties: {
          folderName: { type: "string" as const, description: "Name of the folder to find" },
          basePath: { type: "string" as const, description: "Base path for search (default: home directory)" },
        },
        required: ["folderName"],
      },
    },
    {
      name: "batch_organize",
      description: "Batch rename and move files according to a list of operations. Supports move/copy mode, automatic backup for undo, and detailed reporting.",
      inputSchema: {
        type: "object" as const,
        properties: {
          baseFolder: { type: "string" as const, description: "Base folder for target structure" },
          operations: {
            type: "array" as const,
            description: "Array of {originalPath, targetFolder, newFilename}",
            items: {
              type: "object" as const,
              properties: {
                originalPath: { type: "string" as const },
                targetFolder: { type: "string" as const },
                newFilename: { type: "string" as const },
              },
              required: ["originalPath", "targetFolder", "newFilename"],
            },
          },
          mode: { type: "string" as const, enum: ["move", "copy"], description: "Operation mode (default: move)" },
        },
        required: ["baseFolder", "operations"],
      },
    },
    {
      name: "auto_organize",
      description: "Autonomously analyze and organize all documents in a source folder — combines analysis + rename + move in one step.",
      inputSchema: {
        type: "object" as const,
        properties: {
          sourcePath: { type: "string" as const, description: "Source folder with documents" },
          archivePath: { type: "string" as const, description: "Target folder for organized files" },
          dryRun: { type: "boolean" as const, description: "Preview without changes (default: false)" },
        },
        required: ["sourcePath", "archivePath"],
      },
    },
    {
      name: "process_downloads",
      description: "Scan the downloads folder, analyze documents, and sort them into an archive. Supports auto-move or preview mode.",
      inputSchema: {
        type: "object" as const,
        properties: {
          downloadsPath: { type: "string" as const, description: "Path to downloads folder (default: ~/Downloads)" },
          archiveBasePath: { type: "string" as const, description: "Target archive folder" },
          autoMove: { type: "boolean" as const, description: "Auto-move files (default: false = preview only)" },
          maxFiles: { type: "number" as const, description: "Max files to process (default: 50)" },
        },
        required: ["archiveBasePath"],
      },
    },
    {
      name: "undo_operation",
      description: "Undo the last batch of rename/move operations. Restores original filenames and locations.",
      inputSchema: { type: "object" as const, properties: {} },
    },
    {
      name: "export_metadata",
      description: "Export document metadata to JSON or CSV format.",
      inputSchema: {
        type: "object" as const,
        properties: {
          documents: { type: "array" as const, description: "Array of analyzed document objects" },
          format: { type: "string" as const, enum: ["json", "csv"], description: "Export format (default: json)" },
        },
        required: ["documents"],
      },
    },
    {
      name: "suggest_structure",
      description: "Suggest an intelligent folder structure based on analyzed documents — groups by year, category, and company.",
      inputSchema: {
        type: "object" as const,
        properties: {
          documents: { type: "array" as const, description: "Array of analyzed document objects (from analyze_folder)" },
        },
        required: ["documents"],
      },
    },
  ],
}));

// ─── Tool Handlers ──────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const a = (args as any) || {};

  try {
    switch (name) {
      // ── scan_directory ──
      case "scan_directory": {
        const dirPath = normalizeUnicode(a.path);
        const v = validateDirPath(dirPath);
        if (!v.valid) return err(v.error!);

        const files = collectFiles(dirPath, !!a.recursive);
        const results = [];

        for (const f of files) {
          const st = fs.statSync(f);
          if (st.size > config.maxFileSize) continue;
          const text = await extractText(f, config);
          results.push({
            filename: path.basename(f),
            path: f,
            size: st.size,
            content: text.slice(0, config.maxTextPreview),
            fullContentAvailable: text.length > config.maxTextPreview,
          });
        }
        return ok(results);
      }

      // ── analyze_document ──
      case "analyze_document": {
        const fp = normalizeUnicode(a.filePath);
        const v = validateFilePath(fp);
        if (!v.valid) return err(v.error!);
        return ok(await analyzeDocument(fp));
      }

      // ── analyze_folder ──
      case "analyze_folder": {
        const fp = normalizeUnicode(a.folderPath);
        const v = validateDirPath(fp);
        if (!v.valid) return err(v.error!);

        const files = collectFiles(fp, !!a.recursive, a.fileTypes);
        const start = Date.now();
        const results = [];
        const hashes: Record<string, string[]> = {};
        const errors: Array<{ file: string; error: string }> = [];

        for (let i = 0; i < files.length; i++) {
          try {
            const hash = fileHash(files[i]);
            if (hash) (hashes[hash] ??= []).push(files[i]);
            const analysis = await analyzeDocument(files[i]);
            results.push({ originalPath: files[i], fileHash: hash, ...analysis });
          } catch (e: any) {
            errors.push({ file: path.basename(files[i]), error: e.message });
          }
        }

        const elapsed = Date.now() - start;
        const dupes = Object.entries(hashes)
          .filter(([, v]) => v.length > 1)
          .map(([hash, paths]) => ({ hash, files: paths, count: paths.length }));

        return ok({
          folderPath: fp,
          totalFiles: files.length,
          processed: results.length,
          failed: errors.length,
          errors: errors.length > 0 ? errors : undefined,
          performance: {
            totalMs: elapsed,
            avgMs: Math.round(elapsed / (files.length || 1)),
            filesPerSecond: ((files.length / (elapsed / 1000)) || 0).toFixed(2),
          },
          documents: results,
          duplicates: dupes.length > 0 ? dupes : undefined,
        });
      }

      // ── rename_document ──
      case "rename_document": {
        const origPath = normalizeUnicode(a.originalPath);
        const newName = normalizeUnicode(a.newName);
        if (!fs.existsSync(origPath)) return err("File not found");

        const dir = path.dirname(origPath);
        const target = safeRenamePath(dir, path.basename(origPath), newName);

        if (target !== origPath) {
          fs.renameSync(origPath, target);
          recordOperation(origPath, target);
          return ok({ renamed: true, from: path.basename(origPath), to: path.basename(target) });
        }
        return ok({ renamed: false, reason: "Name unchanged or collision resolved to same path" });
      }

      // ── move_document ──
      case "move_document": {
        const src = normalizeUnicode(a.filePath);
        const targetDir = normalizeUnicode(a.targetDirectory);
        if (!fs.existsSync(src)) return err("Source file not found");
        if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

        const fname = path.basename(src);
        const target = safeRenamePath(targetDir, fname, fname);
        fs.renameSync(src, target);
        recordOperation(src, target);
        return ok({ moved: true, to: target });
      }

      // ── smart_rename ──
      case "smart_rename": {
        const fp = normalizeUnicode(a.filePath);
        const v = validateFilePath(fp);
        if (!v.valid) return err(v.error!);

        const analysis = await analyzeDocument(fp);
        const dryRun = a.dryRun ?? false;

        if (!analysis.renameRecommended) {
          return ok({ action: "none", reason: "Current name is already optimal", analysis });
        }

        if (dryRun) {
          return ok({ action: "preview", suggestedName: analysis.suggestedFilename, analysis });
        }

        const dir = path.dirname(fp);
        const target = safeRenamePath(dir, path.basename(fp), analysis.suggestedFilename);
        fs.renameSync(fp, target);
        recordOperation(fp, target);
        return ok({
          action: "renamed",
          from: path.basename(fp),
          to: path.basename(target),
          analysis,
        });
      }

      // ── find_folder ──
      case "find_folder": {
        const folderName = normalizeUnicode(a.folderName);
        const basePath = normalizeUnicode(a.basePath || os.homedir());
        if (!folderName) return err("folderName is required");

        const search = folderName.toLowerCase();
        const matches: Array<{ path: string; score: number }> = [];

        function walk(dir: string, depth: number) {
          if (depth > 5) return;
          try {
            for (const item of fs.readdirSync(dir)) {
              if (item.startsWith(".")) continue;
              const full = path.join(dir, item);
              try {
                if (!fs.statSync(full).isDirectory()) continue;
              } catch { continue; }

              const lower = item.toLowerCase();
              if (lower === search) { matches.push({ path: full, score: 0 }); return; }
              if (lower.includes(search) || search.includes(lower)) {
                matches.push({ path: full, score: levenshtein(search, lower) });
              } else {
                const d = levenshtein(search, lower);
                if (d <= 3) matches.push({ path: full, score: d });
              }
              walk(full, depth + 1);
            }
          } catch { /* skip */ }
        }
        walk(basePath, 0);
        matches.sort((x, y) => x.score - y.score);

        if (matches.length === 0) {
          return ok({ found: false, searchTerm: folderName, basePath });
        }

        return ok({
          found: true,
          bestMatch: { fullPath: matches[0].path, name: path.basename(matches[0].path) },
          totalMatches: matches.length,
          suggestions: matches.slice(0, 5).map((m) => ({
            path: m.path,
            name: path.basename(m.path),
            similarity: m.score === 0 ? "exact" : `${m.score} chars diff`,
          })),
        });
      }

      // ── batch_organize ──
      case "batch_organize": {
        const baseFolder = normalizeUnicode(a.baseFolder);
        const ops = a.operations as Array<{ originalPath: string; targetFolder: string; newFilename: string }>;
        const mode: "move" | "copy" = a.mode || "move";
        if (!ops?.length) return err("No operations provided");

        const results = [];
        const errors = [];
        let foldersCreated = 0;

        if (mode === "move") {
          const backupPath = path.join(baseFolder, `.backup_${Date.now()}.json`);
          const backupData = ops.map((op) => ({
            from: op.originalPath,
            to: path.join(baseFolder, op.targetFolder, op.newFilename),
          }));
          fs.mkdirSync(baseFolder, { recursive: true });
          fs.writeFileSync(backupPath, JSON.stringify({ operations: backupData }, null, 2));
        }

        for (const op of ops) {
          try {
            const targetDir = path.join(baseFolder, op.targetFolder);
            const targetPath = path.join(targetDir, op.newFilename);
            if (!fs.existsSync(targetDir)) { fs.mkdirSync(targetDir, { recursive: true }); foldersCreated++; }
            if (!fs.existsSync(op.originalPath)) { errors.push({ op, error: "Source not found" }); continue; }
            if (fs.existsSync(targetPath)) { errors.push({ op, error: "Target exists" }); continue; }

            if (mode === "copy") fs.copyFileSync(op.originalPath, targetPath);
            else { fs.renameSync(op.originalPath, targetPath); recordOperation(op.originalPath, targetPath); }

            results.push({ from: op.originalPath, to: targetPath, mode });
          } catch (e: any) {
            errors.push({ op, error: e.message });
          }
        }

        return ok({ processed: results.length, failed: errors.length, foldersCreated, results, errors });
      }

      // ── auto_organize ──
      case "auto_organize": {
        const src = normalizeUnicode(a.sourcePath);
        const dst = normalizeUnicode(a.archivePath);
        const dryRun = a.dryRun ?? false;
        const v = validateDirPath(src);
        if (!v.valid) return err(v.error!);

        const files = collectFiles(src, true);
        const results = { total: files.length, processed: 0, moved: 0, previews: [] as any[], errors: [] as any[] };

        for (const f of files) {
          try {
            const analysis = await analyzeDocument(f);
            const newName = sanitizeFilename(analysis.suggestedFilename);
            const target = path.join(dst, newName);

            if (dryRun) {
              results.previews.push({ from: f, suggestedTarget: target, analysis });
            } else {
              fs.mkdirSync(dst, { recursive: true });
              fs.renameSync(f, target);
              recordOperation(f, target);
              results.moved++;
            }
            results.processed++;
          } catch (e: any) {
            results.errors.push({ file: path.basename(f), error: e.message });
          }
        }

        return ok({ ...results, dryRun, message: dryRun ? "Preview complete" : "Organization complete" });
      }

      // ── process_downloads ──
      case "process_downloads": {
        const dlPath = normalizeUnicode(a.downloadsPath || path.join(os.homedir(), "Downloads"));
        const archivePath = normalizeUnicode(a.archiveBasePath);
        const autoMove = a.autoMove ?? false;
        const maxFiles = a.maxFiles ?? 50;

        const v = validateDirPath(dlPath);
        if (!v.valid) return err(v.error!);

        const files = collectFiles(dlPath, false).slice(0, maxFiles);
        if (files.length === 0) return ok({ scanned: 0, message: "No supported documents found" });

        const suggestions = [];
        const filed = [];
        const errors = [];

        for (const f of files) {
          try {
            const analysis = await analyzeDocument(f);
            const newName = sanitizeFilename(analysis.suggestedFilename);
            const target = path.join(archivePath, newName);
            suggestions.push({ from: f, to: target, filename: newName });

            if (autoMove) {
              fs.mkdirSync(archivePath, { recursive: true });
              fs.renameSync(f, target);
              recordOperation(f, target);
              filed.push({ from: f, to: target });
            }
          } catch (e: any) {
            errors.push({ file: path.basename(f), error: e.message });
          }
        }

        return ok({
          scanned: files.length,
          suggestions,
          filed: filed.length,
          errors,
          autoMove,
          message: autoMove
            ? `${filed.length} files moved to archive`
            : `${suggestions.length} suggestions — set autoMove=true to execute`,
        });
      }

      // ── undo_operation ──
      case "undo_operation": {
        return ok(undoLastBatch());
      }

      // ── export_metadata ──
      case "export_metadata": {
        const docs = a.documents as any[];
        const fmt = a.format || "json";
        if (!docs?.length) return err("No documents provided");

        if (fmt === "csv") {
          let csv = "Filename,Path,Date,References,Keywords,Type\n";
          for (const d of docs) {
            if (d.error) continue;
            csv += [
              d.originalFilename || "",
              d.originalPath || "",
              d.documentDate || "",
              (d.references || []).join(";"),
              (d.keywords || []).join(";"),
              d.documentType || "",
            ].map((f) => `"${String(f).replace(/"/g, '""')}"`).join(",") + "\n";
          }
          return ok(csv);
        }
        return ok(docs);
      }

      // ── suggest_structure ──
      case "suggest_structure": {
        const docs = a.documents as any[];
        if (!docs?.length) return err("No documents provided");

        const years = new Set<string>();
        const categories = new Set<string>();
        const assignments = [];

        for (const doc of docs) {
          if (doc.error) continue;
          let year = "Unknown";
          if (doc.documentDate) {
            const ym = doc.documentDate.match(/(\d{4})/);
            if (ym) year = ym[1];
          }
          years.add(year);

          const cat = doc.aiAnalysis?.documentType || doc.keywords?.[0] || "Other";
          categories.add(cat);

          const company = doc.aiAnalysis?.company || "";
          const targetPath = company ? path.join(year, cat, company) : path.join(year, cat);

          assignments.push({
            originalPath: doc.originalPath,
            targetFolder: targetPath,
            newFilename: doc.suggestedFilename,
          });
        }

        return ok({
          structure: { years: [...years], categories: [...categories] },
          assignments,
          totalDocuments: docs.length,
        });
      }

      default:
        return err(`Unknown tool: ${name}`);
    }
  } catch (e: any) {
    return err(`Internal error: ${e.message}`);
  }
});

// ─── Response helpers ───────────────────────────────────────────────────────

function ok(data: any) {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: "text" as const, text }] };
}

function err(message: string) {
  return { content: [{ type: "text" as const, text: `Error: ${message}` }], isError: true };
}

// ─── Startup ────────────────────────────────────────────────────────────────

async function main() {
  const env = validateEnvironment();
  if (!env.secure) {
    for (const w of env.warnings) console.error(`[WARN] ${w}`);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Document Intelligence Server v5.0.0 running");
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
