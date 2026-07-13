import PyPDF2

def extract_text(pdf_path, txt_path, num_pages=5):
    try:
        reader = PyPDF2.PdfReader(pdf_path)
        with open(txt_path, "w", encoding="utf-8") as f:
            for i in range(min(num_pages, len(reader.pages))):
                f.write(f"--- Page {i+1} ---\n")
                f.write(reader.pages[i].extract_text() + "\n")
        print("Success")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    extract_text("c:\\Users\\User\\Desktop\\utbk2025\\Projek MMA SNBT 2025 Lengkap.pdf", "c:\\Users\\User\\Desktop\\utbk2025\\extracted.txt")
