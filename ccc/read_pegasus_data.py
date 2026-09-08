import json, base64

with open(r"c:\Users\Last Final Day\Documents\GitHub\tools\PEGASUS\assets\data.js", "r", encoding="utf-8") as f:
    text = f.read()

prefix = 'window.__DASHBOARD_DATA = "'
idx = text.find(prefix)
if idx != -1:
    b64 = text[idx + len(prefix) : text.rfind('"')]
    data = json.loads(base64.b64decode(b64).decode("utf-8"))
    print("Keys:", list(data.keys()))
    csv_lines = data["project_link_csv"].split("\n")
    print("Header:", csv_lines[0])
    for l in csv_lines[1:5]:
        print("Row:", l.split(",")[:3])
