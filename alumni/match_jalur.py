import json
import csv

def normalize_name(name):
    # Keep only parts of the name that are > 1 char to avoid issues with initials like "M.", "A."
    nl = name.lower()
    return " ".join([p for p in nl.split() if len(p) > 1 and p not in ('muhammad',)])

try:
    with open('data.json', 'r', encoding='utf-8') as f:
        db = json.load(f)
except Exception as e:
    print("Cannot read data.json:", e)
    exit(1)

# Read SNBP from CSV
snbp_names = []
for file in ['snbp2024.csv', 'snbp2025.csv']:
    try:
        with open(file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                snbp_names.append(normalize_name(row['Name']))
    except Exception as e:
        print(f"Skipping {file}: {e}")

# Read SNBT from huge CSV
snbt_names = []
try:
    with open('snbt2024.csv', 'r', encoding='utf-8', errors='replace') as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get('passed') == '1':
                snbt_names.append(normalize_name(row.get('name', '')))
except Exception as e:
    print(f"Error reading snbt2024.csv: {e}")

snbt_names_set = set(snbt_names)

def determine_jalur(student_name):
    norm = normalize_name(student_name)
    if not norm: return ''
    
    # Check SNBP first
    for s in snbp_names:
        if s and (s in norm or norm in s):
            return 'SNBP'
            
    # Check SNBT
    if norm in snbt_names_set:
        return 'SNBT'
        
    for s in snbt_names_set:
        if s and norm in s:
            if len(norm) > 8: # Arbitrary safeguard to prevent false positives from very short names
                return 'SNBT'
                
    return ''

changes_made = 0

for k in db:
    for s in db[k]['spread']:
        # If they already have a jalur manually set, leave it alone.
        if 'jalur' not in s or not s['jalur'].strip():
            # If they actually got into a University (has ptn field)
            if s.get('ptn', '').strip():
                j = determine_jalur(s['name'])
                if j:
                    s['jalur'] = j
                    changes_made += 1

print(f"Assigned Jalur Masuk to {changes_made} students based on CSV records.")

with open('data.json', 'w', encoding='utf-8') as f:
    json.dump(db, f, indent=4)
