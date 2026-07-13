import docx
import re
import json

def parse_docx(docs_path, output_js_path):
    print(f"Reading {docs_path}...")
    try:
        doc = docx.Document(docs_path)
        
        subtests_config = [
            { "id": "PU", "name": "Penalaran Umum", "type": "TPS", "numQuestions": 30, "duration": 30 },
            { "id": "PPU", "name": "Pengetahuan dan Pemahaman Umum", "type": "TPS", "numQuestions": 20, "duration": 15 },
            { "id": "PBM", "name": "Pemahaman Bacaan dan Menulis", "type": "TPS", "numQuestions": 20, "duration": 25 },
            { "id": "LBI", "name": "Literasi dalam Bahasa Indonesia", "type": "TL", "numQuestions": 30, "duration": 42.5 },
            { "id": "LBE", "name": "Literasi dalam Bahasa Inggris", "type": "TL", "numQuestions": 20, "duration": 30 }
        ]
        
        questions = []
        current_subtest_idx = -1
        current_question = None
        current_stimulus = ""
        
        q_pattern = re.compile(r'^(\d+)\.\s+(.*)')
        opt_pattern = re.compile(r'^([A-Ea-e])[\.\)]\s+(.*)')
        
        def find_subtest(text):
            t = text.lower().strip()
            if "penalaran umum" in t: return 0
            if "pengetahuan dan pemahaman umum" in t: return 1
            if "pemahaman bacaan" in t: return 2
            if "literasi dalam bahasa indonesia" in t: return 3
            if "literasi dalam bahasa inggris" in t: return 4
            return -1

        for p in doc.paragraphs:
            text = p.text.strip()
            if not text: continue
            
            st_idx = find_subtest(text)
            if st_idx != -1:
                current_subtest_idx = st_idx
                current_stimulus = ""
                continue
            
            if current_subtest_idx == -1: 
                continue
                
            q_match = q_pattern.match(text)
            if q_match:
                if current_question and current_question.get('text'):
                    questions.append(current_question)
                
                full_text = ""
                if current_stimulus.strip():
                    full_text += f"<div style='margin-bottom: 1rem; padding: 1.5rem; background: #f3f4f6; border: 1px solid #e5e5e5; border-radius: 6px; font-size: 0.95rem; color: #525252; line-height: 1.6;'>{current_stimulus}</div>"
                    current_stimulus = ""
                
                full_text += q_match.group(2)

                current_question = {
                    "id": f"{subtests_config[current_subtest_idx]['id']}-q{q_match.group(1)}-{len(questions)}",
                    "subtestId": subtests_config[current_subtest_idx]['id'],
                    "text": full_text,
                    "options": [],
                    "correctOption": "A"
                }
                continue
            
            opt_match = opt_pattern.match(text)
            if opt_match and current_question:
                opt_letter = opt_match.group(1).upper()
                current_question["options"].append({
                    "id": opt_letter,
                    "text": opt_match.group(2)
                })
                continue
            
            inline_opts = re.findall(r'\(([a-eA-E])\)\s+([^\(\)]+)', text)
            if inline_opts and current_question:
                for opt in inline_opts:
                    current_question["options"].append({
                        "id": opt[0].upper(),
                        "text": opt[1].strip()
                    })
                continue

            if current_question:
                if len(current_question["options"]) == 0:
                    current_question["text"] += "<br/>" + text
                else:
                    current_question["options"][-1]["text"] += " " + text
            else:
                current_stimulus += text + "<br/><br/>"
        
        if current_question and current_question.get('text'):
            questions.append(current_question)

        for q in questions:
            opts_found = {o['id'] for o in q['options']}
            missing = []
            for letter in ['A', 'B', 'C', 'D', 'E']:
                if letter not in opts_found:
                    missing.append(letter)
            for letter in missing:
                q['options'].append({"id": letter, "text": f"Opsi {letter}"})
            q['options'] = sorted(q['options'], key=lambda x: x['id'])

        js_content = f"const SUBTESTS = {json.dumps(subtests_config, indent=4)};\n\n"
        js_content += f"const mockQuestions = {json.dumps(questions, indent=4)};\n"
        js_content += "const nisnData = [];\n"

        with open(output_js_path, 'w', encoding='utf-8') as f:
            f.write(js_content)
        
        print(f"Successfully extracted {len(questions)} questions using python-docx!")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    parse_docx("c:\\Users\\User\\Desktop\\utbk2025\\Projek MMA SNBT 2025 Lengkap.docx", "c:\\Users\\User\\Desktop\\utbk2025\\ercavian-utbk\\js\\data.js")
