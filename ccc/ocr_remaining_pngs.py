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

def parse_icare_binky(texts):
    name = ""
    role = "I-CARE 2024"
    for i, t in enumerate(texts):
        if "PROUDLY" in t.upper() or "CERTIFICATE" in t.upper():
            if i + 1 < len(texts) and not texts[i+1].upper().startswith("ROR") and not texts[i+1].upper().startswith("FOR"):
                name = texts[i+1].strip()
        m = re.search(r'(?:partic[a-z]*as|as)\s*(.*)', t, re.I)
        if m:
            clean_role = m.group(1).replace("@", "").strip()
            # remove tailing event tokens
            clean_role = re.sub(r'(?:bl-CARB|I-CARE|CARB|2024).*', '', clean_role, flags=re.I).strip()
            if clean_role:
                role = clean_role
    return name, f"{role} (I-CARE Binky Era)"

def parse_ifun_1446(texts):
    name = ""
    role = "I-FUN 1446H"
    for i, t in enumerate(texts):
        if "diberikan kepada" in t.lower() and i + 1 < len(texts):
            name = texts[i+1].strip()
        if "sebagai" in t.lower():
            m = re.search(r'sebagai\s*(.*)', t, re.I)
            if m and m.group(1).strip():
                role = m.group(1).strip()
            elif i + 1 < len(texts) and not "Kepala" in texts[i+1]:
                role = texts[i+1].strip()
    return name, f"{role} (I-FUN 1446H)"

def parse_fbk_2024(texts):
    name = ""
    role = "FBK 2024"
    for i, t in enumerate(texts):
        if any(kw in t.lower() for kw in ["kepa da", "kepada", "diberikan"]):
            if i + 1 < len(texts) and not "sebagai" in texts[i+1].lower():
                name = texts[i+1].strip()
        if "sebagai" in t.lower() or "menjadi" in t.lower():
            m = re.search(r'(?:menjad[a-z;:]*|sebagai[a-z;:]*)\s*(.*)', t, re.I)
            cand_role = m.group(1).strip() if m else ""
            if i + 1 < len(texts) and not any(k in texts[i+1].lower() for k in ["ketua", "zulfan", "sarah"]):
                cand_role += " " + texts[i+1].strip()
            if cand_role:
                role = cand_role
    return name, f"{role} (FBK 2024)"

def process_folder(folder_path, parser_func, apply_rename):
    print(f"=== Processing: {os.path.basename(folder_path)} ===")
    files = glob.glob(os.path.join(folder_path, "*.png"))
    reader = easyocr.Reader(['en'], gpu=False, download_enabled=False)
    success = 0
    for fpath in files:
        fname = os.path.basename(fpath)
        # Skip if already renamed to 'Name - Role'
        if " - " in fname and not fname.split(".")[0].isdigit():
            continue
        try:
            res = reader.readtext(fpath)
            texts = [r[1].strip() for r in res]
            name, role = parser_func(texts)
            name = sanitize(name)
            role = sanitize(role)
            if not name or len(name) < 3:
                print(f"  [SKIP] {fname}: name not found ({repr(name)})")
                continue
            new_name = f"{name} - {role}.png"
            new_path = os.path.join(folder_path, new_name)
            if apply_rename:
                if os.path.exists(new_path) and fpath != new_path:
                    idx = 2
                    base_n = f"{name} - {role}"
                    while os.path.exists(os.path.join(folder_path, f"{base_n} ({idx}).png")):
                        idx += 1
                    new_path = os.path.join(folder_path, f"{base_n} ({idx}).png")
                os.rename(fpath, new_path)
            print(f"  [{'RENAMED' if apply_rename else 'DRY'}] {fname} -> {os.path.basename(new_path)}")
            success += 1
        except Exception as e:
            print(f"  [ERR] {fname}: {e}")
    print(f"Done: {success} files processed in {os.path.basename(folder_path)}.\n")

def main():
    base = r"c:\Users\Last Final Day\Documents\GitHub\tools\ccc\Sertifikat\2025"
    apply_rename = "--apply" in sys.argv

    folders = [
        (os.path.join(base, "I Care Binky Era"), parse_icare_binky),
        (os.path.join(base, "IFUN 1446H"), parse_ifun_1446),
        (os.path.join(base, "SERTIFIKAT FBK 2024"), parse_fbk_2024),
    ]

    for fpath, parser in folders:
        process_folder(fpath, parser, apply_rename)

if __name__ == "__main__":
    main()
