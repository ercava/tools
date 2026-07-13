import PyPDF2
import re
import json

def parse_pdf(pdf_path, output_js_path):
    print(f"Reading {pdf_path}...")
    try:
        reader = PyPDF2.PdfReader(pdf_path)
        
        # Subtests structure based on TOC
        subtests_config = [
            { "id": "PU", "name": "Penalaran Umum", "type": "TPS", "numQuestions": 30, "duration": 30 },
            { "id": "PPU", "name": "Pengetahuan dan Pemahaman Umum", "type": "TPS", "numQuestions": 20, "duration": 15 },
            { "id": "PBM", "name": "Pemahaman Bacaan dan Menulis", "type": "TPS", "numQuestions": 20, "duration": 25 },
            { "id": "PK", "name": "Pengetahuan Kuantitatif", "type": "TPS", "numQuestions": 20, "duration": 20 },
            { "id": "LBI", "name": "Literasi dalam Bahasa Indonesia", "type": "TL", "numQuestions": 30, "duration": 42.5 },
            { "id": "LBE", "name": "Literasi dalam Bahasa Inggris", "type": "TL", "numQuestions": 20, "duration": 30 },
            { "id": "PM", "name": "Penalaran Matematika", "type": "TL", "numQuestions": 30, "duration": 42.5 }
        ]
        
        questions = []
        current_subtest_idx = 0
        current_question = None
        
        # Super simple state machine:
        # text -> wait for "1. ", "2. ", etc
        # Once in question -> wait for "A.", "B.", etc.
        
        q_pattern = re.compile(r'^(\d+)\.\s+(.*)')
        opt_pattern = re.compile(r'^([A-E])\.\s+(.*)')
        subtest_pattern = re.compile(r'(Penalaran Umum|Pengetahuan dan Pemahaman Umum|Pemahaman Bacaan dan Menulis|Pengetahuan Kuantitatif|Literasi dalam Bahasa Indonesia|Literasi dalam Bahasa Inggris|Penalaran Matematika)', re.IGNORECASE)
        
        for i, page in enumerate(reader.pages):
            # Skip first 8 pages (TOC etc)
            if i < 8:
                continue
                
            text = page.extract_text()
            if not text: continue
            
            lines = text.split('\n')
            
            for line in lines:
                line = line.strip()
                if not line: continue
                
                # Check if subtest changed
                st_match = subtest_pattern.search(line)
                if st_match:
                    name_found = st_match.group(1).lower()
                    for idx, st in enumerate(subtests_config):
                        if st['name'].lower() == name_found:
                            current_subtest_idx = idx
                            break
                
                q_match = q_pattern.match(line)
                if q_match:
                    if current_question and current_question.get('text'):
                        questions.append(current_question)
                    
                    current_question = {
                        "id": f"{subtests_config[current_subtest_idx]['id']}-page{i}-{q_match.group(1)}",
                        "subtestId": subtests_config[current_subtest_idx]['id'],
                        "text": q_match.group(2) + " <br/><br/><i>[If there was an image/equation here, please insert manually]</i>",
                        "options": [],
                        "correctOption": "A" # Default placeholder
                    }
                    continue
                
                opt_match = opt_pattern.match(line)
                if opt_match and current_question:
                    current_question["options"].append({
                        "id": opt_match.group(1),
                        "text": opt_match.group(2) + " <i>[Edit if equation needed]</i>"
                    })
                    continue
                
                if current_question and not opt_match and not q_match:
                    if len(current_question["options"]) == 0:
                        current_question["text"] += " " + line
                    else:
                        current_question["options"][-1]["text"] += " " + line

        if current_question and current_question.get('text'):
            questions.append(current_question)

        # Cleanup options to ensure A-E exist
        for q in questions:
            opts_found = {o['id'] for o in q['options']}
            for letter in ['A', 'B', 'C', 'D', 'E']:
                if letter not in opts_found:
                    q['options'].append({"id": letter, "text": f"Opsi {letter} <i>[Manually Add]</i>"})
            q['options'] = sorted(q['options'], key=lambda x: x['id'])

        js_content = f"const SUBTESTS = {json.dumps(subtests_config, indent=4)};\n\n"
        js_content += f"const mockQuestions = {json.dumps(questions, indent=4)};\n"
        js_content += "// Note: mockQuestions variable kept for compatibility, but these are real extracted questions.\n"
        js_content += "const nisnData = []; // Will fetch dynamically\n"

        with open(output_js_path, 'w', encoding='utf-8') as f:
            f.write(js_content)
        
        print(f"Successfully extracted {len(questions)} questions!")
        
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    parse_pdf("c:\\Users\\User\\Desktop\\utbk2025\\Projek MMA SNBT 2025 Lengkap.pdf", "c:\\Users\\User\\Desktop\\utbk2025\\ercavian-utbk\\js\\data.js")
