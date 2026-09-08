import glob, os, re, json

base_certs = r"c:\Users\Last Final Day\Documents\GitHub\tools\ccc\Sertifikat"
files = glob.glob(base_certs + r"\**\*.*", recursive=True)

valid_files = [f for f in files if f.endswith(('.pdf', '.png', '.jpg'))]
print(f"Total certificate files found: {len(valid_files)}")

gibberish_patterns = [
    r'erpongssodialseriaeprogram',
    r'erponglssoddlserviceprogram',
    r'erpongssoddlseraeprogram',
    r'erpongssoddlserviaeprogram',
    r'erpongssodidlserviceprogram',
    r'erponglssodialserviceprogram',
    r'erpongssodalserviceprogram',
    r'erpongssodalservice program',
    r'erpongssoddlseriaeprogram',
    r'erpongs soddlserviaeprogram',
    r'Tteasurerbl',
    r'ExxterudPublcQelations',
    r'bterudPublicQelations',
    r'Supervsorbl-',
    r'Secretcrybl-CARE',
    r'reative& Even8hbl-',
    r'Dunnyfs Share cnd creRest',
    r'Dunnys Sodiety crebL',
    r'Dunnys Sodetyarefbl',
    r'PuBlieation & Documentatiod',
    r'PuBlieation & Docuentatiod',
    r'ApresiASi MENJADi',
    r'ApresiAS; MENJAD;',
    r'ApreSiAS; MENJAD;',
    r'SEBAGA; ApresiASi MENJAD;',
    r'SEBAGA; ApresiASi MENJADi',
    r'SEBAGA; ApresiASi MENJAD',
    r'KoorDiNATOR DiViSi',
    r'KOORDiNATOR DiViSi',
    r'KooRdinator',
    r'KOORDiNator',
    r'MULTiMEDiA',
    r'DiViSi',
    r'hadiah-konsum',
    r'HADiAH-KONSUM',
    r'SASTRA-BUDAYA',
]

def clean_filename(fname):
    name_clean = fname
    # Clean OCR artefacts in roles
    replacements = [
        ('erpongssodialseriaeprogram', 'I-CARE Binky Era'),
        ('erponglssoddlserviceprogram', 'I-CARE Binky Era'),
        ('erpongssoddlseraeprogram', 'I-CARE Binky Era'),
        ('erpongssoddlserviaeprogram', 'I-CARE Binky Era'),
        ('erpongssodidlserviceprogram', 'I-CARE Binky Era'),
        ('erponglssodialserviceprogram', 'I-CARE Binky Era'),
        ('erpongssodalserviceprogram', 'I-CARE Binky Era'),
        ('erpongssodalservice program', 'I-CARE Binky Era'),
        ('erpongssoddlseriaeprogram', 'I-CARE Binky Era'),
        ('erpongs soddlserviaeprogram', 'I-CARE Binky Era'),
        ('Tteasurerbl', 'Treasurer'),
        ('ExxterudPublcQelations', 'External Public Relations'),
        ('bterudPublicQelations', 'External Public Relations'),
        ('Supervsorbl-', 'Supervisor'),
        ('Secretcrybl-CARE', 'Secretary'),
        ('reative& Even8hbl-', 'Creative & Event'),
        ('Dunnyfs Share cnd creRest', 'Dunnys Share and Care'),
        ('Dunnys Sodiety crebL', 'Dunnys Society'),
        ('Dunnys Sodetyarefbl', 'Dunnys Society'),
        ('PuBlieation & Documentatiod', 'Publikasi & Dokumentasi'),
        ('PuBlieation & Docuentatiod', 'Publikasi & Dokumentasi'),
        ('Logistias Decoration & aterig', 'Logistics, Decoration & Catering'),
        ('Logistias  Decoration & @aterig', 'Logistics, Decoration & Catering'),
        ('SEBAGA; ApresiASi MENJAD; ', ''),
        ('SEBAGA; ApresiASi MENJADi ', ''),
        ('SEBAGA; ApresiASi MENJAD ', ''),
        ('ApresiASi MENJADi ', ''),
        ('ApresiAS; MENJAD; ', ''),
        ('ApreSiAS; MENJAD; ', ''),
        ('KoorDiNATOR DiViSi', 'Koordinator Divisi'),
        ('KOORDiNATOR DiViSi', 'Koordinator Divisi'),
        ('KooRdinator', 'Koordinator'),
        ('KOORDiNator', 'Koordinator'),
        ('MULTiMEDiA', 'Multimedia'),
        ('DiViSi', 'Divisi'),
        ('HADiAH-KONSUM', 'Hadiah & Konsumsi'),
        ('SASTRA-BUDAYA', 'Sastra & Budaya'),
        ('  ', ' ')
    ]
    for old, new in replacements:
        name_clean = name_clean.replace(old, new)
    name_clean = re.sub(r'\s+', ' ', name_clean).strip()
    return name_clean

dirty_count = 0
for f in valid_files:
    fname = os.path.basename(f)
    cleaned = clean_filename(fname)
    if cleaned != fname:
        new_path = os.path.join(os.path.dirname(f), cleaned)
        if not os.path.exists(new_path):
            os.rename(f, new_path)
            dirty_count += 1

print(f"Renamed {dirty_count} files to clean up gibberish.")
