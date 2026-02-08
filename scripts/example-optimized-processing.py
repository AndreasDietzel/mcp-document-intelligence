#!/usr/bin/env python3
"""
EXAMPLE: Memory-Optimized Document Processing Script
Demonstrates performance optimizations from v4.4.0

This script shows how to:
- Use generators for memory-efficient file scanning
- Implement batch processing with safety limits
- Perform explicit garbage collection
- Track progress and statistics
"""
import os
import re
import time
from pathlib import Path
import gc

# CONFIGURATION - Adjust these to your needs
ARCHIVE_BASE = "/path/to/your/archive"  # Change this!
BATCH_SIZE = 25
PAUSE_BETWEEN_BATCHES = 1.5
MAX_FILES_PER_RUN = 500
FILE_EXTENSIONS = ('.pdf', '.txt', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx')

FORMATTED_PATTERN = re.compile(r'^\d{4}-\d{2}-\d{2}_')

def find_unformatted_files_generator(dir_path, max_depth=3, current_depth=0):
    """
    Generator: Finds unformatted files WITHOUT loading all in memory
    
    Key Optimization: Uses 'yield' instead of building a list
    Memory footprint: O(1) instead of O(n)
    """
    if current_depth > max_depth:
        return
    
    try:
        # iterdir() is a generator itself - no list created
        for item in dir_path.iterdir():
            if item.name.startswith('.'):
                continue
            
            if item.is_dir():
                # Recursive generator - still no lists!
                yield from find_unformatted_files_generator(item, max_depth, current_depth + 1)
            
            elif item.is_file() and item.suffix.lower() in FILE_EXTENSIONS:
                if not FORMATTED_PATTERN.match(item.name):
                    yield item
    except PermissionError:
        pass
    except Exception:
        pass

def process_file(file_path):
    """Process a single file - your logic here"""
    try:
        # Example: Just print filename
        print(f"   Processing: {file_path.name}")
        time.sleep(0.01)  # Simulate work
        return True
    except Exception as e:
        print(f"   Error: {e}")
        return False

def process_directory_optimized(dir_path):
    """
    Process directory with memory optimization
    
    Key Features:
    1. Generator-based file discovery
    2. Batch processing with limits
    3. Explicit garbage collection
    4. Progress tracking
    """
    print(f"\n📁 Processing: {dir_path}")
    
    stats = {'success': 0, 'errors': 0}
    batch = []
    batch_count = 0
    
    # Generator - files processed one at a time
    for file_path in find_unformatted_files_generator(dir_path):
        batch.append(file_path)
        
        if len(batch) >= BATCH_SIZE:
            # Process batch
            for f in batch:
                if process_file(f):
                    stats['success'] += 1
                else:
                    stats['errors'] += 1
            
            batch_count += 1
            print(f"   📊 Batch {batch_count}: {stats['success']} processed, {stats['errors']} errors")
            
            # CRITICAL: Memory cleanup
            batch.clear()
            gc.collect()
            
            # Pause to let system breathe
            time.sleep(PAUSE_BETWEEN_BATCHES)
            
            # Safety limit
            if stats['success'] >= MAX_FILES_PER_RUN:
                print(f"   ⚠️  Safety limit reached ({MAX_FILES_PER_RUN})")
                break
    
    # Process remaining files
    if batch:
        for f in batch:
            if process_file(f):
                stats['success'] += 1
            else:
                stats['errors'] += 1
        batch.clear()
    
    # Final cleanup
    gc.collect()
    
    return stats

def main():
    print("🚀 MEMORY-OPTIMIZED PROCESSING EXAMPLE")
    print("=" * 80)
    print("This script demonstrates v4.4.0 performance optimizations")
    print(f"📊 Batch size: {BATCH_SIZE}")
    print(f"🛡️  Safety limit: {MAX_FILES_PER_RUN} files")
    print("=" * 80)
    
    # Check if path exists
    archive_path = Path(ARCHIVE_BASE)
    if not archive_path.exists():
        print(f"\n❌ Error: Path does not exist: {ARCHIVE_BASE}")
        print("   Please update ARCHIVE_BASE in this script!")
        return
    
    start_time = time.time()
    
    # Process directory
    stats = process_directory_optimized(archive_path)
    
    elapsed = time.time() - start_time
    
    print(f"\n{'='*80}")
    print("🎉 PROCESSING COMPLETE!")
    print(f"{'='*80}")
    print(f"⏱️  Time: {elapsed:.1f} seconds")
    print(f"✅ Success: {stats['success']}")
    print(f"❌ Errors: {stats['errors']}")
    print(f"{'='*80}")

if __name__ == '__main__':
    main()
