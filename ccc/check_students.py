import json, base64, csv, io

with open(r"c:\Users\Last Final Day\Documents\GitHub\tools\PEGASUS\assets\data.js", "r", encoding="utf-8") as f:
    text = f.read()

prefix = 'window.__DASHBOARD_DATA = "'
b64 = text[text.find(prefix) + len(prefix) : text.rfind('"')]
data = json.loads(base64.b64decode(b64).decode("utf-8"))

reader = csv.DictReader(io.StringIO(data["students_csv"]))
students_csv_rows = list(reader)
print("students_csv count:", len(students_csv_rows))
print("First student:", students_csv_rows[0])

reader2 = csv.DictReader(io.StringIO(data["project_link_csv"]))
p_rows = [r for r in reader2 if r.get("NISN") and r.get("NAME")]
print("project_link_csv count:", len(p_rows))
print("First p_row:", p_rows[0]["NISN"], p_rows[0]["NAME"])
