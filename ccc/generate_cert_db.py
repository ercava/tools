import glob, os, re, json, csv, io, base64

# 1. Load students from PEGASUS
with open(r"c:\Users\Last Final Day\Documents\GitHub\tools\PEGASUS\assets\data.js", "r", encoding="utf-8") as f:
    text = f.read()

prefix = 'window.__DASHBOARD_DATA = "'
b64 = text[text.find(prefix) + len(prefix) : text.rfind('"')]
data = json.loads(base64.b64decode(b64).decode("utf-8"))

reader = csv.DictReader(io.StringIO(data["students_csv"]))
students = list(reader)

# Also load roster
csv_path = r"c:\Users\Last Final Day\Documents\GitHub\tools\ccc\Sertifikat\edpsuperlist - nameonly.csv"
with open(csv_path, "r", encoding="utf-8") as f:
    roster = [line.strip() for line in f if line.strip()]

# 2. Scan all certificates in ccc/Sertifikat
base_certs = r"c:\Users\Last Final Day\Documents\GitHub\tools\ccc\Sertifikat"
repo_root = r"c:\Users\Last Final Day\Documents\GitHub\tools"
cert_files = glob.glob(base_certs + r"\**\*.*", recursive=True)
cert_files = [f for f in cert_files if f.endswith(('.pdf', '.png', '.jpg', '.jpeg'))]

print(f"Total certificates to map: {len(cert_files)}")

# Map each student to their certificates
cert_db = []
for f in cert_files:
    rel_path = os.path.relpath(f, repo_root).replace('\\', '/')
    fname = os.path.basename(f)
    dir_name = os.path.basename(os.path.dirname(f))
    year = "2025" if "2025" in rel_path else "2024"
    
    # Parse student name from filename (format: 'Name - Role' or 'Name.ext')
    name_part = fname.split(' - ')[0].replace('.pdf', '').replace('.png', '').strip()
    role_part = ""
    if ' - ' in fname:
        role_part = fname[len(name_part) + 3 :].rsplit('.', 1)[0].strip()
    
    cert_db.append({
        "file": fname,
        "path": rel_path,
        "dir": dir_name,
        "year": year,
        "name": name_part,
        "role": role_part or dir_name
    })

# Structure database by student NISN and name
student_map = {}
for s in students:
    nisn = s.get("NISN", "").strip()
    name = s.get("name", "").strip()
    # Normalize NISN (with and without leading zeros)
    student_map[name.lower()] = {
        "nisn": nisn,
        "name": name,
        "angkatan": s.get("angkatan", "29"),
        "certs": []
    }

# Also ensure all roster names are present
for n in roster:
    if n.lower() not in student_map:
        student_map[n.lower()] = {
            "nisn": "",
            "name": n,
            "angkatan": "29",
            "certs": []
        }

# Match certificates to students
matched = 0
unmatched = []

for c in cert_db:
    c_name_lower = c["name"].lower()
    # 1. exact match
    found = False
    if c_name_lower in student_map:
        student_map[c_name_lower]["certs"].append(c)
        matched += 1
        found = True
    else:
        # 2. substring match
        for s_name, s_data in student_map.items():
            if (len(c_name_lower) >= 4 and c_name_lower in s_name) or (len(s_name) >= 4 and s_name in c_name_lower):
                s_data["certs"].append(c)
                matched += 1
                found = True
                break
    if not found:
        unmatched.append(c)

print(f"Matched {matched} certificates to students. Unmatched: {len(unmatched)}")

# Save cert_data.json
out_data = {
    "students": list(student_map.values()),
    "all_certs": cert_db
}

with open(r"c:\Users\Last Final Day\Documents\GitHub\tools\ccc\cert_data.json", "w", encoding="utf-8") as f:
    json.dump(out_data, f, indent=2, ensure_ascii=False)

print("Saved cert_data.json successfully!")
