import glob, os, re, sys, easyocr, difflib, numpy as np
from PIL import Image

csv_path = r"c:\Users\Last Final Day\Documents\GitHub\tools\ccc\Sertifikat\edpsuperlist - nameonly.csv"
with open(csv_path, "r", encoding="utf-8") as f:
    roster = [line.strip() for line in f if line.strip()]

def sanitize(s):
    if not s: return ""
    s = re.sub(r'[\x00-\x1f\\/*?:"<>|]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def match_roster(raw):
    clean = re.sub(r'[^a-zA-Z\s]', ' ', raw).strip()
    if not clean: return raw
    # exact
    for n in roster:
        if clean.lower() == n.lower(): return n
    # fuzzy
    matches = difflib.get_close_matches(clean.lower(), [n.lower() for n in roster], n=1, cutoff=0.52)
    if matches:
        for n in roster:
            if n.lower() == matches[0]: return n
    return clean

reader = easyocr.Reader(['en'], gpu=False, download_enabled=False)
folder = r"c:\Users\Last Final Day\Documents\GitHub\tools\ccc\Sertifikat\2025\I Care Binky Era"
files = glob.glob(folder + r"\*.png")

print(f"Processing I Care Binky Era: {len(files)} files...")
count = 0
for f in files:
    try:
        im = Image.open(f)
        w, h = im.size
        # Crop name box
        crop_name = np.array(im.crop((int(w * 0.15), int(h * 0.35), int(w * 0.85), int(h * 0.46))))
        res = reader.readtext(crop_name)
        raw_name = " ".join([r[1] for r in res]).strip()
        name = match_roster(raw_name)
        if not name or len(name) < 3:
            name = raw_name if raw_name else "Unknown"

        # Crop role box
        crop_role = np.array(im.crop((int(w * 0.15), int(h * 0.47), int(w * 0.85), int(h * 0.58))))
        res_role = reader.readtext(crop_role)
        role = "Panitia"
        for r in res_role:
            t = r[1]
            m = re.search(r'(?:as|partic[a-z]*as)\s*(.*)', t, re.I)
            if m:
                cand = m.group(1).replace('@', '').strip()
                cand = re.sub(r'(?:bl-CARB|I-CARE|CARB|2024|MANlscn|MAN|program).*', '', cand, flags=re.I).strip()
                if len(cand) > 2:
                    role = cand
                    break

        new_name = sanitize(f"{name} - {role} (I-CARE Binky Era).png")
        new_path = os.path.join(folder, new_name)
        if f != new_path:
            if os.path.exists(new_path):
                idx = 2
                base_n = f"{name} - {role} (I-CARE Binky Era)"
                while os.path.exists(os.path.join(folder, f"{base_n} ({idx}).png")): idx += 1
                new_path = os.path.join(folder, f"{base_n} ({idx}).png")
            os.rename(f, new_path)
        count += 1
    except Exception as e:
        print(f"Error on {f}: {e}")

print(f"Done I Care Binky Era: {count}/{len(files)}")
