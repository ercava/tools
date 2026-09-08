import glob, os, re, sys, fitz, easyocr, difflib, numpy as np

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
    for n in roster:
        if clean.lower() == n.lower(): return n
    matches = difflib.get_close_matches(clean.lower(), [n.lower() for n in roster], n=1, cutoff=0.55)
    if matches:
        for n in roster:
            if n.lower() == matches[0]: return n
    return clean

reader = easyocr.Reader(['en'], gpu=False, download_enabled=False)

# 1. CLADISTICS
folder_clad = r"c:\Users\Last Final Day\Documents\GitHub\tools\ccc\Sertifikat\2024\CLADISTICS"
files_clad = glob.glob(os.path.join(folder_clad, "*.pdf"))
print(f"=== CLADISTICS: {len(files_clad)} files ===")
for f in files_clad:
    try:
        doc = fitz.open(f)
        pix = doc[0].get_pixmap(dpi=130)
        img_np = np.frombuffer(pix.samples, dtype=np.uint8).reshape((pix.height, pix.width, pix.n))
        if pix.n == 4:
            img_np = img_np[:, :, :3]
        h, w = img_np.shape[:2]
        # Crop name: middle area y: 50% to 68%
        crop_name = img_np[int(h*0.50):int(h*0.68), int(w*0.1):int(w*0.9)]
        res = reader.readtext(crop_name)
        raw_name = " ".join([r[1] for r in res if not any(x in r[1].upper() for x in ['TELAH', 'BERPARTISIPASI', 'KEPANITIAAN'])]).strip()
        name = match_roster(raw_name)
        
        # Crop role: y: 65% to 80%
        crop_role = img_np[int(h*0.65):int(h*0.80), int(w*0.2):int(w*0.8)]
        res_r = reader.readtext(crop_role)
        role = "Panitia CLADISTICS"
        for r in res_r:
            t = r[1]
            if "sebagai" in t.lower() or "tim" in t.lower() or "divisi" in t.lower():
                clean_r = re.sub(r'.*sebagai\s*', '', t, flags=re.I).strip()
                if len(clean_r) > 2:
                    role = clean_r
                    break
        new_name = sanitize(f"{name} - {role} (CLADISTICS 2024).pdf")
        new_path = os.path.join(folder_clad, new_name)
        if f != new_path:
            if os.path.exists(new_path):
                idx = 2
                base_n = f"{name} - {role} (CLADISTICS 2024)"
                while os.path.exists(os.path.join(folder_clad, f"{base_n} ({idx}).pdf")): idx += 1
                new_path = os.path.join(folder_clad, f"{base_n} ({idx}).pdf")
            doc.close()
            os.rename(f, new_path)
    except Exception as e:
        print(f"Error on {f}: {e}")
print("CLADISTICS done.")

# 2. Sonic Linguistic 24
folder_sl = r"c:\Users\Last Final Day\Documents\GitHub\tools\ccc\Sertifikat\2024\Sonic Linguistic 24"
files_sl = glob.glob(os.path.join(folder_sl, "*.pdf"))
print(f"=== Sonic Linguistic 24: {len(files_sl)} files ===")
for f in files_sl:
    try:
        doc = fitz.open(f)
        pix = doc[0].get_pixmap(dpi=130)
        img_np = np.frombuffer(pix.samples, dtype=np.uint8).reshape((pix.height, pix.width, pix.n))
        if pix.n == 4:
            img_np = img_np[:, :, :3]
        h, w = img_np.shape[:2]
        # Crop name: y: 44% to 54%
        crop_name = img_np[int(h*0.44):int(h*0.54), int(w*0.1):int(w*0.9)]
        res = reader.readtext(crop_name)
        raw_name = " ".join([r[1] for r in res]).strip()
        name = match_roster(raw_name)

        # Crop role: y: 54% to 64%
        crop_role = img_np[int(h*0.54):int(h*0.64), int(w*0.15):int(w*0.85)]
        res_r = reader.readtext(crop_role)
        role = "Panitia SL24"
        for r in res_r:
            t = r[1]
            if any(k in t.upper() for k in ["ANGGOTA", "KOORDINATOR", "DIVISI", "KETUA"]):
                role = t.strip()
                break
        new_name = sanitize(f"{name} - {role} (Sonic Linguistic 2024).pdf")
        new_path = os.path.join(folder_sl, new_name)
        if f != new_path:
            if os.path.exists(new_path):
                idx = 2
                base_n = f"{name} - {role} (Sonic Linguistic 2024)"
                while os.path.exists(os.path.join(folder_sl, f"{base_n} ({idx}).pdf")): idx += 1
                new_path = os.path.join(folder_sl, f"{base_n} ({idx}).pdf")
            doc.close()
            os.rename(f, new_path)
    except Exception as e:
        print(f"Error on {f}: {e}")
print("Sonic Linguistic 24 done.")
