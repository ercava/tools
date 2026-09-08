import glob, os, re, sys, pypdf, difflib

csv_path = r"c:\Users\Last Final Day\Documents\GitHub\tools\ccc\Sertifikat\edpsuperlist - nameonly.csv"
with open(csv_path, "r", encoding="utf-8") as f:
    roster = [line.strip() for line in f if line.strip()]

def sanitize(s):
    if not s: return ""
    s = re.sub(r'[\x00-\x1f\\/*?:"<>|]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def match_roster(raw):
    if not raw: return raw
    clean = re.sub(r'[^a-zA-Z\s]', ' ', raw).strip()
    if not clean: return raw
    # exact
    for n in roster:
        if clean.lower() == n.lower(): return n
    # substring
    for n in roster:
        if clean.lower() in n.lower() or n.lower() in clean.lower():
            if len(clean) >= 4: return n
    # fuzzy
    matches = difflib.get_close_matches(clean.lower(), [n.lower() for n in roster], n=1, cutoff=0.75)
    if matches:
        for n in roster:
            if n.lower() == matches[0]: return n
    return clean

base = r"c:\Users\Last Final Day\Documents\GitHub\tools\ccc\Sertifikat\2024"

# 1. ICW Nominasi 2024 - Kelas 11
print("=== 1. ICW Nominasi 2024 - Kelas 11 ===")
f_icw = glob.glob(os.path.join(base, "ICW Nominasi 2024 - Kelas 11", "*.pdf"))
for f in f_icw:
    txt = pypdf.PdfReader(f).pages[0].extract_text() or ""
    lines = [l.strip() for l in txt.split("\n") if l.strip()]
    if len(lines) >= 2:
        nom = lines[1]
        raw_name = lines[-1]
        name = match_roster(raw_name)
        new_name = f"{name} - {nom} (ICW 2024).pdf"
        new_path = os.path.join(os.path.dirname(f), sanitize(new_name))
        if f != new_path:
            if os.path.exists(new_path):
                idx = 2
                base_n = f"{name} - {nom} (ICW 2024)"
                while os.path.exists(os.path.join(os.path.dirname(f), f"{base_n} ({idx}).pdf")): idx += 1
                new_path = os.path.join(os.path.dirname(f), f"{base_n} ({idx}).pdf")
            os.rename(f, new_path)
print("ICW Nominasi 2024 done.")

# 2. Legi 2024
print("=== 2. Legi 2024 ===")
f_legi = glob.glob(os.path.join(base, "Legi 2024", "*.pdf"))
for f in f_legi:
    txt = pypdf.PdfReader(f).pages[0].extract_text() or ""
    lines = [l.strip() for l in txt.split("\n") if l.strip()]
    if len(lines) >= 2:
        raw_name = lines[-2]
        role = lines[-1]
        name = match_roster(raw_name)
        new_name = f"{name} - {role} (Legivania 2024).pdf"
        new_path = os.path.join(os.path.dirname(f), sanitize(new_name))
        if f != new_path:
            if os.path.exists(new_path):
                idx = 2
                base_n = f"{name} - {role} (Legivania 2024)"
                while os.path.exists(os.path.join(os.path.dirname(f), f"{base_n} ({idx}).pdf")): idx += 1
                new_path = os.path.join(os.path.dirname(f), f"{base_n} ({idx}).pdf")
            os.rename(f, new_path)
print("Legi 2024 done.")

# 3. FBB2022
print("=== 3. FBB2022 ===")
f_fbb = glob.glob(os.path.join(base, "FBB2022", "*.pdf"))
for f in f_fbb:
    txt = pypdf.PdfReader(f).pages[0].extract_text() or ""
    lines = [l.strip() for l in txt.split("\n") if l.strip()]
    raw_name = ""
    role = "Panitia FBB"
    for i, l in enumerate(lines):
        if "PRESENTED TO" in l.upper():
            if i + 1 < len(lines): raw_name = lines[i+1].strip()
        if "PARTICIPATION AS" in l.upper():
            if i + 1 < len(lines): role = lines[i+1].strip()
    if not raw_name or "CERTIFICATE" in raw_name:
        raw_name = lines[0]
    if "In the committee" in role:
        # Check surrounding
        for l in lines:
            if any(k in l for k in ["EVENT TEAM", "CHAIRMAN", "COOR", "DIVISION"]):
                role = l.strip(); break
    name = match_roster(raw_name)
    new_name = f"{name} - {role} (FBB 2023).pdf"
    new_path = os.path.join(os.path.dirname(f), sanitize(new_name))
    if f != new_path:
        if os.path.exists(new_path):
            idx = 2
            base_n = f"{name} - {role} (FBB 2023)"
            while os.path.exists(os.path.join(os.path.dirname(f), f"{base_n} ({idx}).pdf")): idx += 1
            new_path = os.path.join(os.path.dirname(f), f"{base_n} ({idx}).pdf")
        os.rename(f, new_path)
print("FBB2022 done.")

# 4. IFUN1445H
print("=== 4. IFUN1445H ===")
f_ifun = glob.glob(os.path.join(base, "IFUN1445H", "*.pdf"))
for f in f_ifun:
    txt = pypdf.PdfReader(f).pages[0].extract_text() or ""
    lines = [l.strip() for l in txt.split("\n") if l.strip()]
    raw_name = lines[-1] if lines else ""
    name = match_roster(raw_name)
    new_name = f"{name} - Panitia (I-FUN 1445H).pdf"
    new_path = os.path.join(os.path.dirname(f), sanitize(new_name))
    if f != new_path:
        if os.path.exists(new_path):
            idx = 2
            base_n = f"{name} - Panitia (I-FUN 1445H)"
            while os.path.exists(os.path.join(os.path.dirname(f), f"{base_n} ({idx}).pdf")): idx += 1
            new_path = os.path.join(os.path.dirname(f), f"{base_n} ({idx}).pdf")
        os.rename(f, new_path)
print("IFUN1445H done.")
