import glob, os, json, re, csv, io, base64

# Load PEGASUS data
with open(r"c:\Users\Last Final Day\Documents\GitHub\tools\PEGASUS\assets\data.js", "r", encoding="utf-8") as f:
    text = f.read()

prefix = 'window.__DASHBOARD_DATA = "'
b64 = text[text.find(prefix) + len(prefix) : text.rfind('"')]
data = json.loads(base64.b64decode(b64).decode("utf-8"))

students = list(csv.DictReader(io.StringIO(data["students_csv"])))

# Map by normalized NISN and lowercase name
# Note: In PEGASUS, NISN might have leading zeros stripped, e.g. 79144295 vs 0079144295
nisn_to_student = {}
name_to_student = {}

for s in students:
    nisn = s.get("NISN", "").strip()
    name = s.get("name", "").strip()
    clean_nisn = nisn.lstrip("0")
    nisn_to_student[clean_nisn] = s
    name_to_student[name.lower()] = s

# Also load roster
csv_path = r"c:\Users\Last Final Day\Documents\GitHub\tools\ccc\Sertifikat\edpsuperlist - nameonly.csv"
with open(csv_path, "r", encoding="utf-8") as f:
    roster = [line.strip() for line in f if line.strip()]

# Find all certificate files
base_certs = r"c:\Users\Last Final Day\Documents\GitHub\tools\ccc\Sertifikat"
repo_root = r"c:\Users\Last Final Day\Documents\GitHub\tools"

files = glob.glob(base_certs + r"\**\*.*", recursive=True)
files = [f for f in files if f.endswith(('.pdf', '.png', '.jpg'))]

cert_entries = []
for f in files:
    fname = os.path.basename(f)
    rel_path = os.path.relpath(f, repo_root).replace('\\', '/')
    dir_name = os.path.basename(os.path.dirname(f))
    year = "2025" if "2025" in rel_path else "2024"

    # Name and role
    if " - " in fname:
        name_part = fname.split(" - ")[0].strip()
        role_part = fname[len(name_part) + 3:].rsplit(".", 1)[0].strip()
    else:
        name_part = fname.rsplit(".", 1)[0].strip()
        role_part = dir_name

    cert_entries.append({
        "filename": fname,
        "path": rel_path,
        "event": dir_name,
        "year": year,
        "name": name_part,
        "role": role_part,
        "ext": fname.rsplit(".", 1)[1].lower()
    })

# Group certificates by student
students_output = {}
for name_raw, s in name_to_student.items():
    nisn = s.get("NISN", "").strip()
    clean_nisn = nisn.lstrip("0")
    students_output[clean_nisn] = {
        "nisn": nisn,
        "name": s.get("name", "").strip(),
        "angkatan": s.get("angkatan", "29"),
        "certificates": []
    }

# Assign certs
matched_count = 0
for c in cert_entries:
    c_name = c["name"].lower()
    assigned = False
    
    # 1. Exact match
    if c_name in name_to_student:
        s = name_to_student[c_name]
        clean_nisn = s["NISN"].lstrip("0")
        students_output[clean_nisn]["certificates"].append(c)
        assigned = True
    else:
        # 2. Substring match
        for s_name, s in name_to_student.items():
            if (len(c_name) >= 4 and c_name in s_name) or (len(s_name) >= 4 and s_name in c_name):
                clean_nisn = s["NISN"].lstrip("0")
                students_output[clean_nisn]["certificates"].append(c)
                assigned = True
                break
    if assigned:
        matched_count += 1

print(f"Total certificates: {len(cert_entries)}")
print(f"Matched certificates to students: {matched_count}")

# Generate standalone JS data bundle for ccc site
js_content = "window.__CERT_DATA = " + json.dumps({
    "students": students_output,
    "all_certs": cert_entries
}, ensure_ascii=False) + ";"

os.makedirs(r"c:\Users\Last Final Day\Documents\GitHub\tools\ccc\assets", exist_ok=True)
with open(r"c:\Users\Last Final Day\Documents\GitHub\tools\ccc\assets\certs.js", "w", encoding="utf-8") as f:
    f.write(js_content)

print("Generated ccc/assets/certs.js successfully!")
