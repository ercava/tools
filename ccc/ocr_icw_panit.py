import glob
import os
import re
import sys
import easyocr

def sanitize(s):
    if not s:
        return ""
    s = re.sub(r'[\x00-\x1f\\/*?:"<>|]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def parse_icw_panit(texts):
    nomor_idx = -1
    for i, t in enumerate(texts):
        if "NOMOR" in t.upper() or re.search(r'\d{3,}/', t) or re.search(r'\d{3,}[A-Za-z]', t):
            nomor_idx = i

    role_keywords = ["ANGGOTA", "KOORDINATOR", "KETUA", "WAKIL", "SEKRETARIS", "BENDAHARA", "AKTOR", "SUPERVISOR", "PENGARAH"]
    role = "Panitia ICW 2024"
    role_idx = -1
    for i, t in enumerate(texts):
        for kw in role_keywords:
            if kw in t.upper():
                role_idx = i
                if i + 1 < len(texts) and len(texts[i+1]) < 25 and not any(x in texts[i+1].upper() for x in ["SERTIFIKAT", "NOMOR"]):
                    role = f"{t} {texts[i+1]}"
                else:
                    role = t
                break
        if role_idx != -1:
            break

    start = (nomor_idx + 1) if nomor_idx != -1 else 0
    end = role_idx if role_idx != -1 else len(texts)
    
    name_parts = []
    for t in texts[start:end]:
        # skip numbers, long registration strings, unwanted tokens
        if re.search(r'^\d+$', t.strip()) or re.search(r'\d{3,}', t):
            continue
        if any(bad in t.upper() for bad in ["AWARD", "INSAN", "SERPONG", "MADRASAH", "NOMOR", "SERTIFIKAT"]):
            continue
        # If token has stray OCR artifacts like '@' or single characters
        t_clean = re.sub(r'[@#$%^&*()_+=\[\]{};:,.<>?/\\|`~]', '', t).strip()
        if len(t_clean) > 1:
            name_parts.append(t_clean.title())

    name = " ".join(name_parts).strip()
    return name, f"{role.title()} (ICW 2024)"

def main():
    folder = r"c:\Users\Last Final Day\Documents\GitHub\tools\ccc\Sertifikat\2024\ICW 2024 SERTIFIKAT PANIT"
    files = glob.glob(os.path.join(folder, "*.png"))
    reader = easyocr.Reader(['en'], gpu=False, download_enabled=False)
    
    success = 0
    for fpath in files:
        fname = os.path.basename(fpath)
        if "-" in fname and not fname.split(".")[0].isdigit():
            continue
        try:
            res = reader.readtext(fpath)
            texts = [r[1].strip() for r in res]
            name, role = parse_icw_panit(texts)
            name = sanitize(name)
            role = sanitize(role)
            if not name or len(name) < 3:
                continue
                
            new_name = f"{name} - {role}.png"
            new_path = os.path.join(folder, new_name)
            
            if os.path.exists(new_path) and fpath != new_path:
                idx = 2
                base_n = f"{name} - {role}"
                while os.path.exists(os.path.join(folder, f"{base_n} ({idx}).png")):
                    idx += 1
                new_path = os.path.join(folder, f"{base_n} ({idx}).png")
            os.rename(fpath, new_path)
            success += 1
        except Exception as e:
            pass
            
    print(f"Done: {success} files renamed.")

if __name__ == "__main__":
    main()
