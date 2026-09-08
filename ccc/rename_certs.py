import glob
import os
import re
import sys
import pypdf

def sanitize(s):
    if not s:
        return ""
    s = re.sub(r'[\x00-\x1f\\/*?:"<>|]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def parse_cert_pdf(folder_rel, fpath):
    try:
        reader = pypdf.PdfReader(fpath)
        txt = "\n".join([p.extract_text() or "" for p in reader.pages]).strip()
    except Exception as e:
        return None, None
        
    lines = [l.strip() for l in txt.split("\n") if l.strip()]
    if not lines:
        return None, None

    f = folder_rel.replace("\\", "/")

    if "CBC 2024" in f:
        role = "CBC 2024"
        for l in lines:
            if "contributions as" in l.lower():
                m = re.search(r"contributions as an?\s+(.*)", l, re.I)
                if m:
                    role = m.group(1).strip()
        name = ""
        for i, l in enumerate(lines):
            if "CERTIFICATE" in l.upper() and i + 1 < len(lines):
                name = lines[i+1].strip()
                break
        return name, role

    if "FBB" in f:
        name = ""
        role = "Panitia FBB"
        for i, l in enumerate(lines):
            if "PRESENTED TO" in l.upper():
                # Check if line itself has name or line above/below
                if i > 0 and not lines[i-1].startswith("T H I S"):
                    name = lines[i-1].strip()
                elif i + 1 < len(lines):
                    name = lines[i+1].strip()
            if "PARTICIPATION AS" in l.upper():
                if i + 1 < len(lines):
                    role = lines[i+1].strip()
        # Fallback for name / role if reversed in some versions
        if "EVENT TEAM" in txt:
            role = "EVENT TEAM"
        elif "CHAIRMAN" in txt and not role:
            role = "CHAIRMAN"
        if not name or "CERTIFICATE" in name:
            name = lines[0]
        return name, f"{role} (FBB 2023)"

    if "I Care 2024" in f:
        name = ""
        role = "I-CARE 2024"
        for i, l in enumerate(lines):
            if "diberikan kepada" in l.lower() and i + 1 < len(lines):
                name = lines[i+1].strip()
                if i + 2 < len(lines):
                    role = lines[i+2].strip()
                break
        return name, f"{role} (I-CARE 2024)"

    if "ICW Nominasi 2024" in f:
        name = lines[0]
        nom = lines[1] if len(lines) > 1 else ""
        return name, f"{nom} (ICW 2024)"

    if "Legi 2024" in f:
        name = lines[-1]
        role = "Legivania 2024"
        for i, l in enumerate(lines):
            if "presented to" in l.lower() and i + 1 < len(lines):
                role = lines[i+1].strip()
                break
        return name, f"{role} (Legivania 2024)"

    if "MPS 24" in f:
        name = lines[0]
        role = "MPS 2024"
        for l in lines:
            if l.upper().startswith("SEBAGAI "):
                role = l[8:].strip()
                break
        return name, role

    if "OS Cendekia 2024" in f:
        name = ""
        role = "OS Cendekia"
        for i, l in enumerate(lines):
            if l.lower().startswith("nomor :") and i + 1 < len(lines):
                name = lines[i+1].strip()
                if i + 2 < len(lines) and lines[i+2].upper().startswith("SEBAGAI "):
                    role = lines[i+2][8:].strip()
                break
        return name, f"{role} (OS Cendekia)"

    if "Ophelia" in f:
        # Looking between 'For his participation as :' and 'In the committee'
        name = ""
        role = "Ophelia 2024"
        p_idx = -1
        in_idx = -1
        for i, l in enumerate(lines):
            if "participation as" in l.lower():
                p_idx = i
            if "in the committee" in l.lower():
                in_idx = i
        if p_idx != -1 and in_idx != -1 and in_idx > p_idx:
            between = [l for l in lines[p_idx+1:in_idx] if "Muhammad Atha" not in l and "C H A I R" not in l]
            if len(between) == 1:
                name = between[0]
            elif len(between) >= 2:
                # One is role, one is name
                if any(k in between[0].upper() for k in ["COORDINATOR", "DIVISION", "TREASURER", "SECRETARY", "CHAIRMAN"]):
                    role = between[0]
                    name = between[1]
                elif any(k in between[1].upper() for k in ["COORDINATOR", "DIVISION", "TREASURER", "SECRETARY", "CHAIRMAN"]):
                    name = between[0]
                    role = between[1]
                else:
                    name = between[0]
                    role = between[1]
        if not name:
            name = lines[2] if len(lines) > 2 else lines[0]
        return name, f"{role} (Ophelia 2024)"

    if "REFORMASI" in f:
        name = lines[0]
        role = "Panitia REFORMASI"
        m = re.search(r"sebagai\s+([\s\S]+?)\s+dari REFORMASI", txt, re.I)
        if m:
            role = m.group(1).replace("\n", " ").strip()
        return name, f"{role} (REFORMASI 2024)"

    if "SLC 23-24" in f:
        name = ""
        role = "SLC 23-24"
        for i, l in enumerate(lines):
            if "CERTIFICATE" in l.upper() and i > 0:
                name = lines[i-1].strip()
                break
        m = re.search(r"sebagai\s+([^\n]+)", txt, re.I)
        if m:
            role = m.group(1).strip()
        return name, role

    if "ICW 2025_" in f:
        name = lines[1] if len(lines) > 1 else lines[0]
        role = lines[-1] if len(lines) > 2 else "ICW 2025"
        return name, f"{role} (ICW 2025)"

    if "ICW Nominasi 2025" in f:
        name = lines[4] if len(lines) > 4 else lines[0]
        nom = lines[5] if len(lines) > 5 else "ICW 2025"
        return name, f"{nom} (ICW 2025)"

    return None, None

def main():
    base = r"c:\Users\Last Final Day\Documents\GitHub\tools\ccc\Sertifikat"
    dirs = [
      r"2024\CBC 2024",
      r"2024\FBB2022",
      r"2024\I Care 2024",
      r"2024\ICW Nominasi 2024 - Kelas 11",
      r"2024\Legi 2024",
      r"2024\MPS 24",
      r"2024\OS Cendekia 2024",
      r"2024\Ophelia",
      r"2024\REFORMASI",
      r"2024\SLC 23-24",
      r"2025\ICW 2025_",
      r"2025\ICW Nominasi 2025 - Kelas 12"
    ]
    
    apply_rename = "--apply" in sys.argv
    total_renamed = 0
    failed = []

    for d in dirs:
        full_dir = os.path.join(base, d)
        files = glob.glob(os.path.join(full_dir, "*.pdf"))
        print(f"=== Processing {d} ({len(files)} files) ===")
        dir_success = 0
        for fpath in files:
            fname = os.path.basename(fpath)
            name, role = parse_cert_pdf(d, fpath)
            name = sanitize(name)
            role = sanitize(role)
            if not name or len(name) < 3:
                failed.append((fpath, "No name found"))
                continue
            
            new_name = f"{name} - {role}.pdf" if role else f"{name}.pdf"
            new_path = os.path.join(full_dir, new_name)
            
            if not apply_rename:
                if dir_success < 2:
                    print(f"  [SAMPLE] {fname} -> {new_name}")
                dir_success += 1
            else:
                if fpath != new_path:
                    if os.path.exists(new_path):
                        base_noext = f"{name} - {role}" if role else name
                        idx = 2
                        while os.path.exists(os.path.join(full_dir, f"{base_noext} ({idx}).pdf")):
                            idx += 1
                        new_path = os.path.join(full_dir, f"{base_noext} ({idx}).pdf")
                    os.rename(fpath, new_path)
                dir_success += 1
        print(f"  Done: {dir_success}/{len(files)}")
        total_renamed += dir_success

    print(f"\nTotal: {total_renamed} files. Failed: {len(failed)}")

if __name__ == "__main__":
    main()
