/**
 * Performance Utilities - v4.4.0
 * Memory-optimized helpers for batch processing
 */

/**
 * Generator function for reading directory recursively
 * Uses streaming approach to avoid loading all files in memory
 * 
 * @param dirPath - Directory to scan
 * @param maxDepth - Maximum recursion depth
 * @param currentDepth - Current recursion level
 * @yields File paths one at a time
 */
export async function* scanDirectoryRecursive(
  dirPath: string,
  maxDepth: number = 3,
  currentDepth: number = 0
): AsyncGenerator<string, void, unknown> {
  if (currentDepth > maxDepth) {
    return;
  }

  try {
    const fs = await import('fs/promises');
    const path = await import('path');
    
    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden files
      if (entry.name.startsWith('.')) {
        continue;
      }

      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Recurse into subdirectories
        yield* scanDirectoryRecursive(fullPath, maxDepth, currentDepth + 1);
      } else if (entry.isFile()) {
        yield fullPath;
      }
    }
  } catch (error) {
    // Silently skip directories with permission issues
    console.error(`Error scanning ${dirPath}:`, error);
  }
}

/**
 * Process files in batches with memory management
 * 
 * @param files - Async generator of file paths
 * @param batchSize - Number of files per batch
 * @param processor - Function to process each file
 * @param onBatchComplete - Optional callback after each batch
 */
export async function processBatches<T>(
  files: AsyncGenerator<string>,
  batchSize: number,
  processor: (filePath: string) => Promise<T>,
  onBatchComplete?: (results: T[], batchNumber: number) => void
): Promise<T[]> {
  const allResults: T[] = [];
  let batch: string[] = [];
  let batchNumber = 0;

  for await (const filePath of files) {
    batch.push(filePath);

    if (batch.length >= batchSize) {
      // Process current batch
      const results = await Promise.all(batch.map(processor));
      allResults.push(...results);

      batchNumber++;
      if (onBatchComplete) {
        onBatchComplete(results, batchNumber);
      }

      // Clear batch for garbage collection
      batch = [];
      
      // Force garbage collection hint
      if (global.gc) {
        global.gc();
      }

      // Pause between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Process remaining files
  if (batch.length > 0) {
    const results = await Promise.all(batch.map(processor));
    allResults.push(...results);

    batchNumber++;
    if (onBatchComplete) {
      onBatchComplete(results, batchNumber);
    }
  }

  return allResults;
}

/**
 * Memory-efficient file filtering
 * Filters files by extension without loading all in memory
 * 
 * @param files - Async generator of file paths
 * @param extensions - Allowed file extensions
 * @yields Filtered file paths
 */
export async function* filterFilesByExtension(
  files: AsyncGenerator<string>,
  extensions: string[]
): AsyncGenerator<string, void, unknown> {
  const path = await import('path');
  
  for await (const filePath of files) {
    const ext = path.extname(filePath).toLowerCase();
    if (extensions.includes(ext)) {
      yield filePath;
    }
  }
}

/**
 * Rate limiter for API calls or file operations
 * Prevents overwhelming the system
 */
export class RateLimiter {
  private queue: Array<() => void> = [];
  private running = 0;
  
  constructor(
    private maxConcurrent: number,
    private minInterval: number = 0
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    while (this.running >= this.maxConcurrent) {
      await new Promise(resolve => this.queue.push(resolve as () => void));
    }

    this.running++;
    
    try {
      const result = await fn();
      return result;
    } finally {
      this.running--;
      
      if (this.minInterval > 0) {
        await new Promise(resolve => setTimeout(resolve, this.minInterval));
      }
      
      const next = this.queue.shift();
      if (next) {
        next();
      }
    }
  }
}

/**
 * Memory monitor for tracking usage
 * Useful for debugging memory issues
 */
export function getMemoryUsage(): {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
} {
  const usage = process.memoryUsage();
  return {
    heapUsed: Math.round(usage.heapUsed / 1024 / 1024 * 100) / 100,
    heapTotal: Math.round(usage.heapTotal / 1024 / 1024 * 100) / 100,
    external: Math.round(usage.external / 1024 / 1024 * 100) / 100,
    rss: Math.round(usage.rss / 1024 / 1024 * 100) / 100
  };
}

/**
 * Safe file size check
 * Returns size in MB or null if file doesn't exist
 */
export async function getFileSizeMB(filePath: string): Promise<number | null> {
  try {
    const fs = await import('fs/promises');
    const stats = await fs.stat(filePath);
    return Math.round(stats.size / 1024 / 1024 * 100) / 100;
  } catch {
    return null;
  }
}

/**
 * Batch processor with progress tracking
 */
export interface BatchProgress {
  processed: number;
  total: number;
  currentBatch: number;
  success: number;
  errors: number;
}

export async function processBatchesWithProgress<T>(
  files: string[],
  batchSize: number,
  processor: (filePath: string) => Promise<T>,
  onProgress?: (progress: BatchProgress) => void
): Promise<{ results: T[], errors: Error[] }> {
  const results: T[] = [];
  const errors: Error[] = [];
  const total = files.length;
  let processed = 0;
  let currentBatch = 0;

  for (let i = 0; i < files.length; i += batchSize) {
    const batch = files.slice(i, i + batchSize);
    currentBatch++;

    const batchResults = await Promise.allSettled(
      batch.map(processor)
    );

    for (const result of batchResults) {
      processed++;
      
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        errors.push(result.reason);
      }
    }

    if (onProgress) {
      onProgress({
        processed,
        total,
        currentBatch,
        success: results.length,
        errors: errors.length
      });
    }

    // Memory cleanup
    if (global.gc) {
      global.gc();
    }

    // Pause between batches
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  return { results, errors };
}
