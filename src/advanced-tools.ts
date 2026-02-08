/**
 * Advanced folder management tools
 * - cleanup_old_structure: Removes old folder structures and consolidates into standard categories
 * - optimize_folder_structure: Deletes empty folders and moves single-file categories
 * - intelligent_rename: PDF content analysis for smart file naming
 * - move_loose_files: Pattern-based categorization for loose files
 */

import * as fs from "fs";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

interface CleanupResult {
  movedSubdirs: number;
  movedOldCategories: number;
  looseFiles: number;
  errors: number;
}

interface OptimizeResult {
  emptyDeleted: number;
  singleFileMoved: number;
  categoriesKept: number;
}

// Old folder patterns to move to 08_Bildung
const OLD_SUBDIRS_TO_BILDUNG = [
  "ADA", "Informatik", "Musikuntericht", "Recht",
  "Seminararbeit Pervasiv Computing", "Seminararbeit SAP-ITS"
];

// Old category mappings
const OLD_CATEGORY_MAPPING: Record<string, string> = {
  "01_Studium": "08_Bildung",
  "02_Beruf": "07_Beruf",
  "03_IT_Technik": "08_Bildung",
  "04_Persoenlich": "99_Sonstiges"
};

// Pattern-based categorization rules
const CATEGORIZATION_RULES: [RegExp, string][] = [
  [/(?:studium|vordiplom|praktikum|seminar|übung|klausur|vorlesung|hausarbeit|thesenpapier|fallbeispiel|präsentation|fallstudie|skript|literatur|stundenplan)/i, "08_Bildung"],
  [/\.(?:doc|docx|ppt|pptx|xls|xlsx)$/i, "08_Bildung"],
  [/(?:rechnung|kontoauszug|kaufvertrag|angebot|bestellung|order|lieferschein)/i, "01_Finanzen"],
  [/(?:versicherung|vertrag|police|schutz)/i, "04_Versicherungen"],
  [/(?:lebenslauf|bewerbung|arbeitsvertrag|kündigung|gehalt)/i, "07_Beruf"],
  [/(?:auto|fahrzeug|schwacke|kfz)/i, "09_Auto"],
  [/(?:miete|wohnung|immobilie)/i, "10_Wohnen"],
  [/(?:arzt|kranken|gesundheit|rezept)/i, "03_Gesundheit"],
];

/**
 * Finds all year folders in archive structure
 */
function findYearFolders(archiveBase: string): string[] {
  const yearFolders: string[] = [];
  
  try {
    const decades = fs.readdirSync(archiveBase);
    
    for (const decade of decades) {
      if (decade.startsWith(".")) continue;
      
      const decadePath = path.join(archiveBase, decade);
      if (!fs.statSync(decadePath).isDirectory()) continue;
      
      const years = fs.readdirSync(decadePath);
      for (const year of years) {
        if (year.startsWith(".")) continue;
        if (!/^\d{4}$/.test(year)) continue;
        
        const yearPath = path.join(decadePath, year);
        if (fs.statSync(yearPath).isDirectory()) {
          yearFolders.push(yearPath);
        }
      }
    }
  } catch (error: any) {
    console.error(`Error finding year folders: ${error.message}`);
  }
  
  return yearFolders.sort();
}

/**
 * Cleans up old folder structures in a year folder
 */
export function cleanupYearFolder(yearPath: string): CleanupResult {
  const result: CleanupResult = {
    movedSubdirs: 0,
    movedOldCategories: 0,
    looseFiles: 0,
    errors: 0
  };
  
  try {
    // Ensure 08_Bildung exists
    const bildungDir = path.join(yearPath, "08_Bildung");
    if (!fs.existsSync(bildungDir)) {
      fs.mkdirSync(bildungDir, { recursive: true });
    }
    
    // Move old subdirectories to 08_Bildung
    for (const oldSubdir of OLD_SUBDIRS_TO_BILDUNG) {
      const oldPath = path.join(yearPath, oldSubdir);
      if (fs.existsSync(oldPath) && fs.statSync(oldPath).isDirectory()) {
        try {
          const targetPath = path.join(bildungDir, oldSubdir);
          
          if (fs.existsSync(targetPath)) {
            // Merge contents
            const items = fs.readdirSync(oldPath);
            for (const item of items) {
              fs.renameSync(path.join(oldPath, item), path.join(targetPath, item));
            }
            fs.rmdirSync(oldPath);
          } else {
            fs.renameSync(oldPath, targetPath);
          }
          
          result.movedSubdirs++;
        } catch (error: any) {
          result.errors++;
        }
      }
    }
    
    // Move contents from old category folders
    for (const [oldCat, newCat] of Object.entries(OLD_CATEGORY_MAPPING)) {
      const oldCatPath = path.join(yearPath, oldCat);
      if (fs.existsSync(oldCatPath) && fs.statSync(oldCatPath).isDirectory()) {
        const newCatPath = path.join(yearPath, newCat);
        if (!fs.existsSync(newCatPath)) {
          fs.mkdirSync(newCatPath, { recursive: true });
        }
        
        try {
          const items = fs.readdirSync(oldCatPath);
          for (const item of items) {
            const target = path.join(newCatPath, item);
            if (!fs.existsSync(target)) {
              fs.renameSync(path.join(oldCatPath, item), target);
            }
          }
          
          // Remove empty old category
          if (fs.readdirSync(oldCatPath).length === 0) {
            fs.rmdirSync(oldCatPath);
            result.movedOldCategories++;
          }
        } catch (error: any) {
          result.errors++;
        }
      }
    }
    
    // Count loose files
    const items = fs.readdirSync(yearPath);
    for (const item of items) {
      if (item.startsWith(".")) continue;
      const itemPath = path.join(yearPath, item);
      if (fs.statSync(itemPath).isFile()) {
        result.looseFiles++;
      }
    }
    
  } catch (error: any) {
    result.errors++;
  }
  
  return result;
}

/**
 * Cleans up all year folders in archive
 */
export function cleanupOldStructure(archiveBase: string): string {
  const yearFolders = findYearFolders(archiveBase);
  
  let totalMoved = 0;
  let totalOldCats = 0;
  let totalLoose = 0;
  let totalErrors = 0;
  
  const details: string[] = [];
  
  for (const yearPath of yearFolders) {
    const result = cleanupYearFolder(yearPath);
    totalMoved += result.movedSubdirs;
    totalOldCats += result.movedOldCategories;
    totalLoose += result.looseFiles;
    totalErrors += result.errors;
    
    if (result.movedSubdirs > 0 || result.movedOldCategories > 0 || result.looseFiles > 0) {
      details.push(`${path.basename(path.dirname(yearPath))}/${path.basename(yearPath)}: ${result.movedSubdirs} subdirs, ${result.movedOldCategories} old cats, ${result.looseFiles} loose files`);
    }
  }
  
  return JSON.stringify({
    summary: {
      yearsProcessed: yearFolders.length,
      movedSubdirs: totalMoved,
      movedOldCategories: totalOldCats,
      looseFiles: totalLoose,
      errors: totalErrors
    },
    details: details.slice(0, 20) // Limit output
  }, null, 2);
}

/**
 * Gets all files recursively in a directory
 */
function getAllFilesRecursive(dirPath: string): string[] {
  const files: string[] = [];
  
  try {
    const items = fs.readdirSync(dirPath);
    for (const item of items) {
      if (item.startsWith(".")) continue;
      
      const itemPath = path.join(dirPath, item);
      const stat = fs.statSync(itemPath);
      
      if (stat.isFile()) {
        files.push(itemPath);
      } else if (stat.isDirectory()) {
        files.push(...getAllFilesRecursive(itemPath));
      }
    }
  } catch (error) {
    // Skip errors
  }
  
  return files;
}

/**
 * Optimizes folder structure by removing empty folders and consolidating single-file categories
 */
export function optimizeFolderStructure(archiveBase: string): string {
  const yearFolders = findYearFolders(archiveBase);
  
  let totalEmpty = 0;
  let totalMoved = 0;
  let totalKept = 0;
  
  for (const yearPath of yearFolders) {
    try {
      // Ensure 99_Sonstiges exists
      const sonstigesPath = path.join(yearPath, "99_Sonstiges");
      if (!fs.existsSync(sonstigesPath)) {
        fs.mkdirSync(sonstigesPath, { recursive: true });
      }
      
      const items = fs.readdirSync(yearPath);
      
      for (const item of items) {
        if (item.startsWith(".")) continue;
        
        const itemPath = path.join(yearPath, item);
        if (!fs.statSync(itemPath).isDirectory()) continue;
        
        const files = getAllFilesRecursive(itemPath);
        
        if (files.length === 0) {
          // Empty folder - delete
          fs.rmdirSync(itemPath, { recursive: true });
          totalEmpty++;
        } else if (files.length === 1 && item !== "99_Sonstiges") {
          // Single file - move to 99_Sonstiges
          const fileName = path.basename(files[0]);
          const target = path.join(sonstigesPath, fileName);
          
          if (!fs.existsSync(target)) {
            fs.renameSync(files[0], target);
            totalMoved++;
            
            // Clean up empty parent dirs
            let parent = path.dirname(files[0]);
            while (parent !== yearPath && fs.readdirSync(parent).length === 0) {
              fs.rmdirSync(parent);
              parent = path.dirname(parent);
            }
          }
        } else {
          totalKept++;
        }
      }
    } catch (error) {
      // Skip errors
    }
  }
  
  return JSON.stringify({
    yearsProcessed: yearFolders.length,
    emptyDeleted: totalEmpty,
    singleFileMoved: totalMoved,
    categoriesKept: totalKept
  }, null, 2);
}

/**
 * Categorizes a file based on filename patterns
 */
function categorizeFile(filename: string): string {
  for (const [pattern, category] of CATEGORIZATION_RULES) {
    if (pattern.test(filename)) {
      return category;
    }
  }
  return "99_Sonstiges";
}

/**
 * Moves loose files to appropriate categories based on filename patterns
 */
export function moveLooseFiles(archiveBase: string): string {
  const yearFolders = findYearFolders(archiveBase);
  
  const categorization: Record<string, number> = {};
  let totalMoved = 0;
  let totalSkipped = 0;
  
  for (const yearPath of yearFolders) {
    try {
      const items = fs.readdirSync(yearPath);
      
      for (const item of items) {
        if (item.startsWith(".")) continue;
        
        const itemPath = path.join(yearPath, item);
        if (!fs.statSync(itemPath).isFile()) continue;
        
        const category = categorizeFile(item);
        const categoryPath = path.join(yearPath, category);
        
        if (!fs.existsSync(categoryPath)) {
          fs.mkdirSync(categoryPath, { recursive: true });
        }
        
        const target = path.join(categoryPath, item);
        
        if (fs.existsSync(target)) {
          totalSkipped++;
        } else {
          fs.renameSync(itemPath, target);
          categorization[category] = (categorization[category] || 0) + 1;
          totalMoved++;
        }
      }
    } catch (error) {
      // Skip errors
    }
  }
  
  return JSON.stringify({
    yearsProcessed: yearFolders.length,
    moved: totalMoved,
    skipped: totalSkipped,
    categorization
  }, null, 2);
}

/**
 * Extracts text from PDF using pdftotext (requires poppler installed)
 */
async function extractTextFromPDF(filePath: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`pdftotext -l 3 "${filePath}" - 2>/dev/null | head -c 5000`);
    return stdout.trim();
  } catch (error) {
    return "";
  }
}

/**
 * Known entities for intelligent naming
 */
const KNOWN_ENTITIES: Record<string, string[]> = {
  versicherungen: ["hallesche", "huk", "axa", "allianz", "generali", "ergo", "ukv"],
  finanzen: ["ing", "postbank", "sparkasse", "commerzbank", "volksbank", "deutsche bank", "comdirect"],
  gesundheit: ["arzt", "praxis", "apotheke", "krankenhaus", "klinik"],
  steuern: ["finanzamt", "steuer"],
  auto: ["auto", "kfz", "reparatur", "werkstatt"],
  wohnen: ["miete", "wohnung", "gas", "strom", "wasser", "eigentümerversammlung"]
};

/**
 * Document type patterns
 */
const DOCUMENT_TYPES: Record<string, RegExp> = {
  rechnung: /rechnung|invoice|bill/i,
  vertrag: /vertrag|contract/i,
  bescheid: /bescheid|notice/i,
  bestaetigung: /bestätigung|confirmation/i,
  abrechnung: /abrechnung|statement/i
};

/**
 * Intelligent rename using PDF content analysis
 */
export async function intelligentRename(archiveBase: string, dryRun: boolean = true): Promise<string> {
  const yearFolders = findYearFolders(archiveBase);
  
  let totalProcessed = 0;
  let totalMoved = 0;
  let totalSkipped = 0;
  const maxFiles = 200; // Safety limit
  
  for (const yearPath of yearFolders) {
    if (totalProcessed >= maxFiles) break;
    
    try {
      const items = fs.readdirSync(yearPath);
      
      for (const item of items) {
        if (totalProcessed >= maxFiles) break;
        if (!item.toLowerCase().endsWith(".pdf")) continue;
        if (item.startsWith(".")) continue;
        
        const itemPath = path.join(yearPath, item);
        if (!fs.statSync(itemPath).isFile()) continue;
        
        totalProcessed++;
        
        // Extract PDF text
        const text = await extractTextFromPDF(itemPath);
        if (!text) {
          totalSkipped++;
          continue;
        }
        
        // Detect entity and category
        let detectedEntity = "";
        let category = "99_Sonstiges";
        
        for (const [cat, entities] of Object.entries(KNOWN_ENTITIES)) {
          for (const entity of entities) {
            if (text.toLowerCase().includes(entity)) {
              detectedEntity = entity;
              
              // Map to category
              if (cat === "finanzen") category = "01_Finanzen";
              else if (cat === "versicherungen") category = "04_Versicherungen";
              else if (cat === "gesundheit") category = "03_Gesundheit";
              else if (cat === "steuern") category = "05_Steuern";
              else if (cat === "auto") category = "09_Auto";
              else if (cat === "wohnen") category = "10_Wohnen";
              
              break;
            }
          }
          if (detectedEntity) break;
        }
        
        // Detect document type
        let docType = "dokument";
        for (const [type, pattern] of Object.entries(DOCUMENT_TYPES)) {
          if (pattern.test(text)) {
            docType = type;
            break;
          }
        }
        
        // Create new filename
        const dateMatch = item.match(/^(\d{4}-\d{2}-\d{2})/);
        const date = dateMatch ? dateMatch[1] : item.substring(0, 10);
        const entityPart = detectedEntity ? `_${detectedEntity.charAt(0).toUpperCase() + detectedEntity.slice(1)}` : "";
        const newName = `${date}_${docType.charAt(0).toUpperCase() + docType.slice(1)}${entityPart}.pdf`;
        
        if (!dryRun) {
          const categoryPath = path.join(yearPath, category);
          if (!fs.existsSync(categoryPath)) {
            fs.mkdirSync(categoryPath, { recursive: true });
          }
          
          const target = path.join(categoryPath, newName);
          if (!fs.existsSync(target)) {
            fs.renameSync(itemPath, target);
            totalMoved++;
          } else {
            totalSkipped++;
          }
        } else {
          totalMoved++; // Count for dry run
        }
      }
    } catch (error) {
      // Skip errors
    }
  }
  
  return JSON.stringify({
    mode: dryRun ? "dry-run" : "execute",
    processed: totalProcessed,
    moved: totalMoved,
    skipped: totalSkipped
  }, null, 2);
}
