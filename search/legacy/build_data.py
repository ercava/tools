#!/usr/bin/env python3
"""
build_data.py — Excel to Base64 JSON converter for Ercava Search
Run this locally to regenerate data.js before deploying.

Usage:
    python build_data.py
"""

import pandas as pd
import numpy as np
import re
import os
import sys
import json
import base64
import datetime

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

# ---- Paths ----
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONGRATS_FILE = os.path.join(BASE_DIR, "Congratulations UTBK 2026(1).xlsx")
ERCAVA_FILE = os.path.join(BASE_DIR, "Ercava Development Program.xlsx")
POSDAT_FILE = os.path.join(BASE_DIR, "POSDAT - Portal Sistem Data Terpadu.xlsx")
OUTPUT_FILE = os.path.join(BASE_DIR, "data.js")

# ---- Helpers ----
def normalize_name(name):
    if not isinstance(name, str):
        return ""
    name = name.lower()
    name = re.sub(r'\(.*?\)', '', name)
    name = re.sub(r'[^a-z0-9]', '', name)
    return name

def clean_val(val):
    if pd.isna(val):
        return ""
    if isinstance(val, (datetime.datetime, pd.Timestamp)):
        return val.strftime('%d %B %Y')
    val = str(val).strip()
    # Clean up float-like strings (e.g. "1.0" -> "1")
    if re.match(r'^\d+\.0$', val):
        val = val[:-2]
    return val

def safe_read_excel(filepath, sheet_name, **kwargs):
    """Read Excel with error handling."""
    try:
        return pd.read_excel(filepath, sheet_name=sheet_name, **kwargs)
    except Exception as e:
        print(f"  ⚠ Could not read sheet '{sheet_name}': {e}")
        return pd.DataFrame()

def find_match(norm, data_dict):
    """Find a student key match by normalized name."""
    if norm in data_dict:
        return norm
    for k in data_dict:
        if len(norm) >= 4 and len(k) >= 4 and (norm in k or k in norm):
            return k
    return None


# ---- Parsers ----

def parse_students():
    """Parse student data from Ercava STATUS + POSDAT KELAS + birthdaychiver + GURA SIWA."""
    print("📋 Parsing students...")
    all_students = {}

    # 1. Ercava STATUS (core student list for XII)
    print("  → Ercava STATUS sheet")
    df = safe_read_excel(ERCAVA_FILE, 'STATUS')
    if not df.empty:
        for _, row in df.iterrows():
            name = clean_val(row.get('NAMA'))
            if not name:
                continue
            norm = normalize_name(name)
            all_students[norm] = {
                "name": name,
                "nickname": clean_val(row.get('ALSO KNOWN AS')),
                "gender": clean_val(row.get('JK')),
                "status": clean_val(row.get('STATUS')),
                "relationship": clean_val(row.get('HUBUNGAN')),
                "birthday": clean_val(row.get('TANGGAL LAHIR')),
                "instagram": clean_val(row.get('INSTAGRAM')),
                "major": clean_val(row.get('JURUSAN')),
                "university": clean_val(row.get('UNIVERSITAS')),
                "address": clean_val(row.get('ALAMAT')),
                "job": clean_val(row.get('PEKERJAAN')),
                "grade": "XII",
                "class": "",
                "advisor_pa": "",
                "roles": [],
            }
    print(f"    Found {len(all_students)} from STATUS")

    # 2. Ercava BPH (student leadership roles)
    print("  → Ercava BPH sheet")
    df_bph = safe_read_excel(ERCAVA_FILE, 'BPH', header=None)
    if not df_bph.empty:
        current_context = ""
        role_count = 0
        for r in range(len(df_bph)):
            ctx_val = df_bph.iloc[r, 1] if 1 < df_bph.shape[1] else None
            if pd.notna(ctx_val):
                s = str(ctx_val).strip()
                if s and s not in ["👑", "🌅", "🌟", "🌕", ""]:
                    current_context = s

            for role_col, name_col in [(2,3),(5,6),(8,9),(11,12),(14,15),(17,18)]:
                if role_col < df_bph.shape[1] and name_col < df_bph.shape[1]:
                    role_val = df_bph.iloc[r, role_col]
                    name_val = df_bph.iloc[r, name_col]
                    if pd.notna(role_val) and pd.notna(name_val):
                        role = str(role_val).strip()
                        name = str(name_val).strip()
                        if name and role not in ["NAMA GURU / STAF", "NAMA SISWA", "NAMA", ""]:
                            norm = normalize_name(name)
                            key = find_match(norm, all_students)
                            if key:
                                desc = f"{role} ({current_context})" if current_context else role
                                if desc not in all_students[key]["roles"]:
                                    all_students[key]["roles"].append(desc)
                                    role_count += 1
        print(f"    Assigned {role_count} roles from BPH")

    # 3. POSDAT KELAS (all cohorts: VASANTRA, ASHTERA, ERCAVA)
    print("  → POSDAT KELAS sheet")
    df_kelas = safe_read_excel(POSDAT_FILE, 'KELAS ', header=None)
    if not df_kelas.empty:
        cohorts = ['VASANTRA', 'ASHTERA', 'ERCAVA']
        cohort_rows = []
        for r in range(len(df_kelas)):
            val = str(df_kelas.iloc[r, 0]).strip()
            if val in cohorts:
                cohort_rows.append((val, r))
        cohort_rows.append(('END', len(df_kelas)))

        grade_map = {'VASANTRA': 'X', 'ASHTERA': 'XI', 'ERCAVA': 'XII'}
        new_students = 0

        for i in range(len(cohort_rows) - 1):
            cohort_name, start_row = cohort_rows[i]
            _, next_row = cohort_rows[i + 1]
            grade_val = grade_map.get(cohort_name, cohort_name)

            # Determine header row
            has_headers = False
            for col_idx in [3, 8, 13, 18, 23, 28, 33]:
                if col_idx < df_kelas.shape[1] and pd.notna(df_kelas.iloc[start_row, col_idx]):
                    has_headers = True
                    break

            header_row = start_row if has_headers else start_row + 1
            student_start = header_row + 1

            class_headers = {}
            for col_idx in [3, 8, 13, 18, 23, 28, 33]:
                if col_idx < df_kelas.shape[1]:
                    cls_name = df_kelas.iloc[header_row, col_idx]
                    advisor = df_kelas.iloc[header_row, col_idx + 1] if col_idx + 1 < df_kelas.shape[1] else None
                    if pd.notna(cls_name):
                        class_headers[col_idx] = (
                            str(cls_name).strip(),
                            str(advisor).strip() if pd.notna(advisor) else ''
                        )

            for col_idx, (cls_name, advisor) in class_headers.items():
                for r in range(student_start, next_row):
                    name_val = df_kelas.iloc[r, col_idx]
                    jk_val = df_kelas.iloc[r, col_idx + 1] if col_idx + 1 < df_kelas.shape[1] else None

                    if pd.isna(name_val):
                        continue
                    name_str = str(name_val).strip()
                    if not name_str or name_str in ["NAMA", "NAMA SISWA"]:
                        continue

                    norm = normalize_name(name_str)
                    key = find_match(norm, all_students)

                    if key:
                        all_students[key]["class"] = cls_name
                        all_students[key]["advisor_pa"] = advisor
                        if not all_students[key].get("gender"):
                            all_students[key]["gender"] = str(jk_val).strip() if pd.notna(jk_val) else ""
                    else:
                        all_students[norm] = {
                            "name": name_str,
                            "nickname": "",
                            "gender": str(jk_val).strip() if pd.notna(jk_val) else "",
                            "status": "",
                            "relationship": "",
                            "birthday": "",
                            "instagram": "",
                            "major": "",
                            "university": "",
                            "address": "",
                            "job": "",
                            "grade": grade_val,
                            "class": cls_name,
                            "advisor_pa": advisor,
                            "roles": [],
                        }
                        new_students += 1

        print(f"    Added {new_students} new students from KELAS")

    # 4. POSDAT birthdaychiver (birthday + zodiac)
    print("  → POSDAT birthdaychiver sheet")
    df_bd = safe_read_excel(POSDAT_FILE, 'birthdaychiver')
    if not df_bd.empty:
        bd_count = 0
        # Columns in birthdaychiver:
        # Col 0 (or 'Unnamed: 0'): Date string like "1-Jan"
        # Col 29 (named 29 or '29'): Comma-separated names of students
        # Col 'Guru' (or unnamed): Guru names
        date_col = df_bd.columns[0]
        # Find column 29
        col_29 = None
        for col in df_bd.columns:
            if str(col).strip() == '29':
                col_29 = col
                break
        
        if col_29 is not None:
            for _, row in df_bd.iterrows():
                date_str = clean_val(row.get(date_col))
                names_val = row.get(col_29)
                if pd.notna(names_val) and date_str:
                    # Clean date string (e.g. "1-Jan" -> "01 January" or similar format if possible)
                    # We can keep it as is, e.g. "1-Jan" or format it nicely
                    names = [n.strip() for n in str(names_val).split(',') if n.strip()]
                    for name in names:
                        norm = normalize_name(name)
                        key = find_match(norm, all_students)
                        if key:
                            # Only set birthday if it was not already set from STATUS sheet
                            if not all_students[key].get("birthday"):
                                all_students[key]["birthday"] = date_str
                            bd_count += 1
        print(f"    Matched {bd_count} birthday records")

    # 5. POSDAT GURA SIWA (guru asuh)
    print("  → POSDAT GURA SIWA sheet")
    df_gs = safe_read_excel(POSDAT_FILE, 'GURA SIWA', header=None)
    if not df_gs.empty:
        ga_count = 0
        current_putra_guru = ""
        current_putri_guru = ""
        
        for r in range(2, len(df_gs)):
            # Index 2: Putra Guru, Index 4: Putra Student
            if 2 < df_gs.shape[1] and pd.notna(df_gs.iloc[r, 2]):
                current_putra_guru = str(df_gs.iloc[r, 2]).strip()
            
            # Index 11: Putri Guru, Index 13: Putri Student
            if 11 < df_gs.shape[1] and pd.notna(df_gs.iloc[r, 11]):
                current_putri_guru = str(df_gs.iloc[r, 11]).strip()
                
            # Parse Putra Student
            if 4 < df_gs.shape[1]:
                p_name = df_gs.iloc[r, 4]
                if pd.notna(p_name) and str(p_name).strip() not in ["NAMA SISWA", ""]:
                    norm = normalize_name(str(p_name))
                    key = find_match(norm, all_students)
                    if key:
                        all_students[key]["guru_asuh"] = current_putra_guru
                        ga_count += 1
                        
            # Parse Putri Student
            if 13 < df_gs.shape[1]:
                w_name = df_gs.iloc[r, 13]
                if pd.notna(w_name) and str(w_name).strip() not in ["NAMA SISWA", ""]:
                    norm = normalize_name(str(w_name))
                    key = find_match(norm, all_students)
                    if key:
                        all_students[key]["guru_asuh"] = current_putri_guru
                        ga_count += 1
                        
        print(f"    Matched {ga_count} guru asuh records")

    # 6. Congratulations UTBK
    print("  → Congratulations UTBK sheet")
    df_congrats = safe_read_excel(CONGRATS_FILE, 'Congratulations', header=4)
    if not df_congrats.empty:
        utbk_count = 0
        for _, row in df_congrats.iterrows():
            name = clean_val(row.get('Nama Siswa'))
            ptn = clean_val(row.get('Diterima Di PTN'))
            prodi = clean_val(row.get('Diterima di Program Studi'))
            if name:
                norm = normalize_name(name)
                key = find_match(norm, all_students)
                if key:
                    all_students[key]["utbk_ptn"] = ptn
                    all_students[key]["utbk_prodi"] = prodi
                    utbk_count += 1
        print(f"    Matched {utbk_count} UTBK records")

    # Convert to list
    students_list = list(all_students.values())
    print(f"  ✅ Total students: {len(students_list)}")
    return students_list


def parse_news():
    """Parse news from POSDAT NEWS ARCHIVE."""
    print("📰 Parsing news...")
    news_list = []
    df = safe_read_excel(POSDAT_FILE, 'NEWS ARCHIVE', header=None)
    if df.empty:
        return news_list

    # Structure: complex layout with dates, titles, content scattered across columns
    # Try to extract structured entries from the archive
    for r in range(4, len(df)):
        # Look for rows with content
        title = None
        date = ""
        content = ""
        category = ""

        # Column patterns vary — scan for content
        for c in range(df.shape[1]):
            val = df.iloc[r, c]
            if pd.isna(val):
                continue
            s = str(val).strip()
            if not s:
                continue

            # Detect date-like values
            if isinstance(val, (datetime.datetime, pd.Timestamp)):
                date = val.strftime('%d %B %Y')
            elif len(s) > 10 and not title:
                if not title:
                    title = s
                elif not content:
                    content = s

        if title and len(title) > 3:
            news_list.append({
                "title": title[:200],
                "date": date,
                "content": content[:500],
                "category": category,
            })

    # Deduplicate by title
    seen = set()
    unique_news = []
    for n in news_list:
        key = normalize_name(n["title"])
        if key not in seen:
            seen.add(key)
            unique_news.append(n)

    print(f"  ✅ Total news: {len(unique_news)}")
    return unique_news


def parse_lostfound():
    """Parse lost and found items from POSDAT LOST and FOUND sheets."""
    print("🔍 Parsing lost & found...")
    items = []

    for sheet_name, item_type in [('LOST', 'Lost'), ('FOUND', 'Found')]:
        df = safe_read_excel(POSDAT_FILE, sheet_name, header=None)
        if df.empty:
            continue

        # Real data starts at row 2, headers at row 1
        for r in range(2, len(df)):
            # Columns: 0=NO, 3=STATUS, 4=BARANG, 5=NAMA/KONTAK, 6=TANGGAL, 7=TEMPAT, 8=CATATAN
            no = df.iloc[r, 0] if 0 < df.shape[1] else None
            if pd.isna(no):
                continue

            status = clean_val(df.iloc[r, 3]) if 3 < df.shape[1] else ""
            barang = clean_val(df.iloc[r, 4]) if 4 < df.shape[1] else ""
            contact = clean_val(df.iloc[r, 5]) if 5 < df.shape[1] else ""
            tanggal = clean_val(df.iloc[r, 6]) if 6 < df.shape[1] else ""
            tempat = clean_val(df.iloc[r, 7]) if 7 < df.shape[1] else ""
            catatan = clean_val(df.iloc[r, 8]) if 8 < df.shape[1] else ""

            if barang:
                items.append({
                    "item": barang,
                    "type": item_type,
                    "status": status if status else item_type,
                    "contact": contact,
                    "date": tanggal,
                    "location": tempat,
                    "description": catatan,
                })

    print(f"  ✅ Total lost & found items: {len(items)}")
    return items


def parse_competitions():
    """Parse competition data from POSDAT DAFTAR LOMBA."""
    print("🏆 Parsing competitions...")
    comps = []
    df = safe_read_excel(POSDAT_FILE, 'DAFTAR LOMBA', header=None)
    if df.empty:
        return comps

    # Real headers at row 2: Deadline | Sisa Waktu | Bidang | Cabang | Nama Lomba | Penyelenggara | Tanggal | Status Kurasi | Biaya | Catatan
    for r in range(3, len(df)):
        nama_lomba = clean_val(df.iloc[r, 4]) if 4 < df.shape[1] else ""
        if not nama_lomba:
            continue

        bidang = clean_val(df.iloc[r, 2]) if 2 < df.shape[1] else ""
        cabang = clean_val(df.iloc[r, 3]) if 3 < df.shape[1] else ""
        penyelenggara = clean_val(df.iloc[r, 5]) if 5 < df.shape[1] else ""
        tanggal = clean_val(df.iloc[r, 6]) if 6 < df.shape[1] else ""
        status = clean_val(df.iloc[r, 7]) if 7 < df.shape[1] else ""
        deadline = clean_val(df.iloc[r, 0]) if 0 < df.shape[1] else ""

        comps.append({
            "competition": nama_lomba,
            "name": penyelenggara,
            "level": bidang,
            "achievement": cabang,
            "year": tanggal,
            "participants": f"Status: {status}" if status else "",
        })

    print(f"  ✅ Total competitions: {len(comps)}")
    return comps


def parse_teachers():
    """Parse teacher data from POSDAT GURU sheet."""
    print("👨‍🏫 Parsing teachers...")
    teachers = []
    df = safe_read_excel(POSDAT_FILE, 'GURU', header=None)
    if df.empty:
        return teachers

    # Real headers at row 1: No. | Nama Lengkap | Mata Pelajaran | Inisial | Nomor HP
    for r in range(2, len(df)):
        nama = clean_val(df.iloc[r, 1]) if 1 < df.shape[1] else ""
        if not nama or nama in ["Nama Lengkap", "No."]:
            continue

        mapel = clean_val(df.iloc[r, 2]) if 2 < df.shape[1] else ""
        inisial = clean_val(df.iloc[r, 3]) if 3 < df.shape[1] else ""
        hp = clean_val(df.iloc[r, 4]) if 4 < df.shape[1] else ""

        teachers.append({
            "name": nama,
            "subject": mapel,
            "role": inisial,
            "nip": hp,
        })

    print(f"  ✅ Total teachers: {len(teachers)}")
    return teachers


def parse_quotes():
    """Parse facts and quotes from POSDAT FACTS N QUOTES sheet."""
    print("💬 Parsing facts & quotes...")
    quotes = []
    df = safe_read_excel(POSDAT_FILE, 'FACTS N QUOTES', header=None)
    if df.empty:
        return quotes

    # Facts in columns 5-6, Quotes in columns 11-12
    for r in range(len(df)):
        # Facts
        if 6 < df.shape[1]:
            fact_text = df.iloc[r, 6]
            if pd.notna(fact_text):
                text = str(fact_text).strip()
                if text and len(text) > 5:
                    quotes.append({
                        "text": text,
                        "author": "Fakta Menarik",
                    })

        # Quotes
        if 12 < df.shape[1]:
            quote_text = df.iloc[r, 12]
            if pd.notna(quote_text):
                text = str(quote_text).strip()
                if text and len(text) > 5:
                    # Try to split author from quote
                    # Pattern: "quote text – Author"  or  "quote text - Author"
                    parts = re.split(r'\s*[–—-]\s*(?=[A-Z])', text, maxsplit=1)
                    if len(parts) == 2:
                        quotes.append({"text": parts[0].strip(' "'), "author": parts[1].strip()})
                    else:
                        quotes.append({"text": text, "author": ""})

    print(f"  ✅ Total facts & quotes: {len(quotes)}")
    return quotes


# ---- Main Build ----
def build():
    print("=" * 50)
    print("🚀 Ercava Search — Data Build")
    print("=" * 50)

    data = {
        "students": parse_students(),
        "news": parse_news(),
        "lostfound": parse_lostfound(),
        "competitions": parse_competitions(),
        "teachers": parse_teachers(),
        "quotes": parse_quotes(),
    }

    # Serialize to JSON
    json_str = json.dumps(data, ensure_ascii=False, separators=(',', ':'))

    # Base64 encode
    encoded = base64.b64encode(json_str.encode('utf-8')).decode('ascii')

    # Write as JS file
    js_content = f'window.__SEARCH_DATA = "{encoded}";\n'

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        f.write(js_content)

    # Summary
    total = sum(len(v) for v in data.values() if isinstance(v, list))
    file_size = os.path.getsize(OUTPUT_FILE)
    print()
    print("=" * 50)
    print(f"✅ Build complete!")
    print(f"   Total records: {total}")
    print(f"   Output: {OUTPUT_FILE}")
    print(f"   File size: {file_size / 1024:.1f} KB")
    print("=" * 50)


if __name__ == '__main__':
    build()
