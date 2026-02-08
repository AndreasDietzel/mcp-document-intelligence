#!/usr/bin/env python3
"""
UNTERORDNER ERSTELLEN: Für alle Jahre mit >25 Dateien
Erstellt die Standard-Kategorien falls noch nicht vorhanden
"""
import os
from pathlib import Path
import time

ARCHIVE_BASE = "/Users/andreasdietzel/Library/Mobile Documents/com~apple~CloudDocs/DateiArchiv/Archiv"

# Standard-Kategorien
CATEGORIES = [
    '01_Finanzen',
    '02_Vertraege',
    '03_Gesundheit',
    '04_Versicherungen',
    '05_Steuern',
    '06_Reisen',
    '07_Beruf',
    '08_Bildung',
    '09_Auto',
    '10_Wohnen',
    '99_Sonstiges'
]

# Jahre die Unterordner brauchen (aus Analyse)
YEARS_NEED_SUBDIRS = [
    ('Nuller', [2004, 2005, 2006, 2007, 2008, 2009]),
    ('Zehner', [2011, 2014, 2015, 2016, 2017, 2018, 2019]),
    ('Zwanziger', [2020, 2021, 2022, 2023, 2024, 2025]),
]

def create_categories_for_year(decade, year, dry_run=False):
    """Erstellt Kategorie-Unterordner für ein Jahr"""
    year_path = Path(ARCHIVE_BASE) / decade / str(year)
    
    if not year_path.exists():
        print(f"   ⚠️  Jahr existiert nicht: {decade}/{year}")
        return {'created': 0, 'existing': 0, 'skipped': 0}
    
    print(f"\n📁 {decade}/{year}")
    
    stats = {'created': 0, 'existing': 0, 'skipped': 0}
    
    for category in CATEGORIES:
        category_path = year_path / category
        
        if category_path.exists():
            print(f"   ✅ {category} (existiert bereits)")
            stats['existing'] += 1
        else:
            if not dry_run:
                try:
                    category_path.mkdir(parents=True, exist_ok=True)
                    print(f"   ✨ {category} (neu erstellt)")
                    stats['created'] += 1
                    time.sleep(0.05)  # Kurze Pause
                except Exception as e:
                    print(f"   ❌ {category} (Fehler: {e})")
                    stats['skipped'] += 1
            else:
                print(f"   🔍 {category} (würde erstellt werden)")
                stats['created'] += 1
    
    return stats

def main():
    print("📂 UNTERORDNER ERSTELLEN")
    print("=" * 80)
    print(f"📊 {len(CATEGORIES)} Kategorien pro Jahr")
    print(f"🎯 19 Jahre werden bearbeitet")
    print("=" * 80)
    
    # Dry-Run Option
    print("\n🔍 DRY-RUN oder ECHTE AUSFÜHRUNG?")
    print("   [1] Dry-Run (nur Vorschau)")
    print("   [2] Echte Ausführung (erstellt Ordner)")
    
    try:
        choice = input("\nWahl (1/2): ").strip()
        dry_run = choice == "1"
    except KeyboardInterrupt:
        print("\n\n❌ Abgebrochen")
        return
    
    if dry_run:
        print("\n🔍 DRY-RUN MODUS - Keine Änderungen werden vorgenommen")
    else:
        print("\n⚠️  ECHTE AUSFÜHRUNG - Ordner werden erstellt!")
        print("   Fortfahren? Drücke ENTER oder CTRL+C zum Abbrechen...")
        try:
            input()
        except KeyboardInterrupt:
            print("\n❌ Abgebrochen")
            return
    
    print("\n" + "=" * 80)
    
    overall_stats = {'created': 0, 'existing': 0, 'skipped': 0}
    start_time = time.time()
    
    for decade, years in YEARS_NEED_SUBDIRS:
        print(f"\n{'='*80}")
        print(f"📂 {decade}")
        print(f"{'='*80}")
        
        for year in years:
            stats = create_categories_for_year(decade, year, dry_run)
            overall_stats['created'] += stats['created']
            overall_stats['existing'] += stats['existing']
            overall_stats['skipped'] += stats['skipped']
    
    elapsed = time.time() - start_time
    
    # Zusammenfassung
    print(f"\n{'='*80}")
    if dry_run:
        print("🔍 DRY-RUN ABGESCHLOSSEN")
    else:
        print("🎉 UNTERORDNER ERSTELLT!")
    print(f"{'='*80}")
    print(f"⏱️  Zeit: {elapsed:.1f} Sekunden")
    print(f"✨ Neu erstellt: {overall_stats['created']}")
    print(f"✅ Existierten bereits: {overall_stats['existing']}")
    print(f"❌ Fehler: {overall_stats['skipped']}")
    
    if not dry_run and overall_stats['created'] > 0:
        print(f"\n💡 Nächster Schritt:")
        print(f"   python3 intelligent-rename.py")
        print(f"   (Analysiert PDF-Inhalte und erstellt bessere Dateinamen)")
    
    print(f"\n{'='*80}")

if __name__ == '__main__':
    main()
