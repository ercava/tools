import csv
import json
import urllib.request
import urllib.parse
from pathlib import Path
import os
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

ALUMNI_DIR = Path(r"c:\Users\User\Desktop\utbk2025\alumni")

def read_lsc_students():
    students = []
    filepath = ALUMNI_DIR / "lsc.csv"
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        for line in f:
            name = line.strip()
            if name and name.lower() != 'total':
                students.append(name)
    return students

def read_cls_students():
    students = []
    filepath = ALUMNI_DIR / "cls.csv"
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        for line in f:
            name = line.strip()
            if name and name.lower() != 'total':
                students.append(name)
    return students

def read_snbt_lsc(lsc_names):
    snbt_results = {}
    lsc_names_lower = {n.lower(): n for n in lsc_names}
    filepath = ALUMNI_DIR / "snbt2024.csv"
    
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        reader = csv.DictReader(f)
        for row in reader:
            db_name = row.get('name')
            if not db_name: continue
            db_name = db_name.strip()
            db_name_lower = db_name.lower()
            
            # Substring match heuristics or exact match
            for query_lower, original_name in lsc_names_lower.items():
                if query_lower == db_name_lower or query_lower in db_name_lower or db_name_lower in query_lower:
                    if snbt_results.get(original_name): continue
                    snbt_results[original_name] = {
                        "passed": row['passed'] == '1',
                        "ptn": row['ptn'],
                        "prodi": row['prodi']
                    }
                    
    return snbt_results

def fetch_cls_snbt(cls_names):
    snbt_results = {}
    total = len(cls_names)
    for i, name in enumerate(cls_names):
        try:
            url = f"https://utbk2025-api.mnct.eu.org/students?name={urllib.parse.quote(name)}"
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, context=ctx) as response:
                data = json.loads(response.read().decode('utf-8'))
                if "data" in data and len(data["data"]) > 0:
                    student_data = data["data"][0]
                    snbt_results[name] = {
                        "passed": student_data.get("passed", False),
                        "ptn": student_data.get("ptn", ""),
                        "prodi": student_data.get("prodi", "")
                    }
                else:
                    snbt_results[name] = {"passed": False, "ptn": "", "prodi": ""}
        except Exception as e:
            print(f"Error fetching API for {name}: {e}")
            snbt_results[name] = {"passed": False, "ptn": "", "prodi": ""}
        
        if (i+1) % 10 == 0:
            print(f"Fetched {i+1}/{total} CLS students from API...")
            
    return snbt_results

def read_lsc_spread():
    spread = []
    filepath = ALUMNI_DIR / "lsc sebaran.csv"
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get('University / Institution') and row.get('Student Name'):
                spread.append({
                    "name": row['Student Name'].strip(),
                    "ptn": row['University / Institution'].strip(),
                    "prodi": row.get('Major / Program', '').strip()
                })
    return spread

def read_cls_spread():
    spread = []
    filepath = ALUMNI_DIR / "cls sebaran.csv"
    with open(filepath, 'r', encoding='utf-8', errors='replace') as f:
        reader = csv.reader(f)
        for row in reader:
            if len(row) > 6 and row[0].strip().isdigit():
                name = row[1].strip()
                ptn = row[4].strip()
                prodi = row[5].strip()
                if name and ptn:
                    spread.append({
                        "name": name,
                        "ptn": ptn,
                        "prodi": prodi
                    })
    return spread

def main():
    print("Reading student lists...")
    lsc_students = read_lsc_students()
    cls_students = read_cls_students()
    
    print(f"Total LSC students: {len(lsc_students)}")
    print(f"Total CLS students: {len(cls_students)}")
    
    print("Processing LSC SNBT results...")
    lsc_snbt = read_snbt_lsc(lsc_students)
    lsc_passed = sum(1 for res in lsc_snbt.values() if res['passed'])
    print(f"LSC Passed SNBT: {lsc_passed}")
    
    print("Fetching CLS SNBT results...")
    cls_snbt = fetch_cls_snbt(cls_students)
    cls_passed = sum(1 for res in cls_snbt.values() if res['passed'])
    print(f"CLS Passed SNBT: {cls_passed}")
    
    print("Reading Spread arrays...")
    lsc_spread = read_lsc_spread()
    cls_spread = read_cls_spread()
    
    out_data = {
        "lsc": {
            "total_students": len(lsc_students),
            "snbt_passed": lsc_passed,
            "snbt_failed": len(lsc_students) - lsc_passed,
            "spread": lsc_spread
        },
        "cls": {
            "total_students": len(cls_students),
            "snbt_passed": cls_passed,
            "snbt_failed": len(cls_students) - cls_passed,
            "spread": cls_spread
        }
    }
    
    out_path = ALUMNI_DIR / "data.json"
    print(f"Saving combined data to {out_path}...")
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(out_data, f, indent=4)
    print("Done!")

if __name__ == "__main__":
    main()
