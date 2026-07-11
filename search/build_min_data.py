#!/usr/bin/env python3
import csv, json, base64, os, sys, re

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

BASE = os.path.dirname(os.path.abspath(__file__))
DOK = os.path.join(BASE, "Untitled spreadsheet - Dokumentasi.csv")
LINKS = os.path.join(BASE, "Untitled spreadsheet - Link Penting.csv")
SERT = os.path.join(BASE, "Untitled spreadsheet - Sertifikat(1).csv")
CONTACTS = os.path.join(BASE, "contacts.csv")
SISWA = os.path.join(BASE, "Ercava Development Program - Sheet29(1).csv")
OUT = os.path.join(BASE, "data.js")

def clean_wa(phone):
    if not phone: return ""
    c = re.sub(r'\D', '', phone)
    if c.startswith("08"): c = "62" + c[1:]
    return c

def ensure_https(url):
    if not url.startswith("http://") and not url.startswith("https://"):
        return "https://" + url
    return url

def build():
    data = []

    if os.path.exists(DOK):
        with open(DOK, 'r', encoding='utf-8') as f:
            r = csv.reader(f); next(r, None)
            for row in r:
                if not row or len(row) < 3: continue
                t, d, l1 = row[0].strip(), row[1].strip(), row[2].strip()
                l2 = row[3].strip() if len(row) > 3 else ""
                if not t: continue
                links = []
                if l1: links.append({"label": "Folder 1", "url": l1})
                if l2: links.append({"label": "Folder 2", "url": l2})
                data.append({"title": t, "category": "Dokumentasi", "meta": d, "links": links})

    if os.path.exists(LINKS):
        with open(LINKS, 'r', encoding='utf-8') as f:
            for row in csv.reader(f):
                if not row or len(row) < 2: continue
                label, url = row[0].strip(), row[1].strip()
                if label and url:
                    data.append({"title": label, "category": "Link Penting", "meta": "Tautan Resmi", "links": [{"label": "Buka Link", "url": ensure_https(url)}]})

    if os.path.exists(SERT):
        with open(SERT, 'r', encoding='utf-8') as f:
            for row in csv.reader(f):
                if not row or len(row) < 3: continue
                name, ctx, url = row[0].strip(), row[1].strip(), row[2].strip()
                if name and url:
                    data.append({"title": f"Sertifikat {name}", "category": "Sertifikat", "meta": ctx, "links": [{"label": "Unduh / Lihat", "url": ensure_https(url)}]})

    if os.path.exists(CONTACTS):
        with open(CONTACTS, 'r', encoding='utf-8') as f:
            r = csv.reader(f); next(r, None)
            for row in r:
                if not row or len(row) < 2: continue
                name = row[0].strip()
                phone = row[18].strip() if len(row) > 18 else ""
                if not name: continue
                nl = name.lower()
                if "miss yuna" in nl or "ms yuna" in nl: continue
                links, meta = [], "Kontak IC"
                if phone:
                    meta = f"HP: {phone}"
                    links.append({"label": "Hubungi (WA)", "url": f"https://wa.me/{clean_wa(phone)}"})
                    links.append({"label": "Telepon", "url": f"tel:{phone}"})
                data.append({"title": name, "category": "Kontak", "meta": meta, "links": links})

    if os.path.exists(SISWA):
        seen = set()
        with open(SISWA, 'r', encoding='utf-8') as f:
            r = csv.reader(f); next(r, None)
            for row in r:
                if not row or len(row) < 2: continue
                if row[0].strip() == "NO" or row[1].strip() == "NAMA": continue
                name = row[1].strip()
                nick = row[2].strip() if len(row) > 2 else ""
                jk = row[3].strip() if len(row) > 3 else ""
                birth = row[4].strip() if len(row) > 4 else ""
                ig = row[5].strip() if len(row) > 5 else ""
                if not name or name in seen: continue
                seen.add(name)
                links, md = [], []
                if nick: md.append(f"({nick})")
                if birth: md.append(birth)
                if ig: links.append({"label": "Instagram", "url": f"https://instagram.com/{ig.replace('@','')}"})
                gs = "Laki-laki" if jk == "L" else "Perempuan" if jk == "P" else jk
                ms = " · ".join(md) if md else "Siswa A29"
                if gs: ms += f" | {gs}"
                entry = {"title": name, "category": "Siswa A29", "meta": ms, "links": links}
                if birth: entry["birthday"] = birth
                data.append(entry)

    enc = base64.b64encode(json.dumps(data, ensure_ascii=False, separators=(',',':')).encode('utf-8')).decode('ascii')
    with open(OUT, 'w', encoding='utf-8') as f:
        f.write(f'window.__SEARCH_DATA="{enc}";\n')
    print(f"Done: {len(data)} items -> {OUT}")

if __name__ == "__main__":
    build()
