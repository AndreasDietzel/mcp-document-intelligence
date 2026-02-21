/**
 * Undo Module
 * Tracks file operations and enables rollback.
 *
 * ISO 25010: Reliability (Recoverability)
 */

import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface RenameRecord {
  timestamp: number;
  oldPath: string;
  newPath: string;
}

interface UndoState {
  operations: RenameRecord[];
  lastBatch: number;
}

const STATE_PATH = path.join(os.homedir(), ".mcp-doc-intel-undo.json");
const BATCH_GAP_MS = 5000;

function load(): UndoState {
  try {
    if (fs.existsSync(STATE_PATH)) {
      return JSON.parse(fs.readFileSync(STATE_PATH, "utf-8"));
    }
  } catch { /* ignore */ }
  return { operations: [], lastBatch: 0 };
}

function save(state: UndoState): void {
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
  } catch { /* best effort */ }
}

/**
 * Record a rename/move operation for later undo.
 */
export function recordOperation(oldPath: string, newPath: string): void {
  const state = load();
  const now = Date.now();

  if (state.operations.length === 0 || now - state.operations.at(-1)!.timestamp > BATCH_GAP_MS) {
    state.lastBatch = now;
  }

  state.operations.push({ timestamp: now, oldPath, newPath });
  save(state);
}

/**
 * Undo the last batch of operations (reverse order).
 */
export function undoLastBatch(): { restored: number; failed: number; errors: string[] } {
  const state = load();
  if (state.operations.length === 0) {
    return { restored: 0, failed: 0, errors: ["No operations to undo"] };
  }

  const batch = state.operations.filter((op) => op.timestamp >= state.lastBatch);
  if (batch.length === 0) {
    return { restored: 0, failed: 0, errors: ["No operations in last batch"] };
  }

  let restored = 0;
  let failed = 0;
  const errors: string[] = [];

  for (let i = batch.length - 1; i >= 0; i--) {
    const op = batch[i];
    try {
      if (!fs.existsSync(op.newPath)) {
        errors.push(`${path.basename(op.newPath)}: file not found`);
        failed++;
        continue;
      }
      if (fs.existsSync(op.oldPath)) {
        errors.push(`${path.basename(op.oldPath)}: original name already taken`);
        failed++;
        continue;
      }
      fs.renameSync(op.newPath, op.oldPath);
      restored++;
    } catch (e: any) {
      errors.push(`${path.basename(op.newPath)}: ${e.message}`);
      failed++;
    }
  }

  if (restored > 0) {
    state.operations = state.operations.filter((op) => op.timestamp < state.lastBatch);
    save(state);
  }

  return { restored, failed, errors };
}

/**
 * Get undo statistics.
 */
export function getUndoStats(): { total: number; lastBatchSize: number; lastBatchTime: string | null } {
  const state = load();
  const batch = state.operations.filter((op) => op.timestamp >= state.lastBatch);
  return {
    total: state.operations.length,
    lastBatchSize: batch.length,
    lastBatchTime: batch.length > 0 ? new Date(batch[0].timestamp).toISOString() : null,
  };
}
