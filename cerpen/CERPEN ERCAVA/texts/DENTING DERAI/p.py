import os
import platform
import subprocess
from docx import Document

def create_and_open_blank_docx():
    # Daftar judul yang akan dijadikan file terpisah
    titles = [
        "Eksisi",
        "L.N.E.R Insiden",
        "Mariposa Di Ujung Asa",
        "Stasiun Tanpa Akhir",
        "Titip Salam Untuk Papa",
        "Tujuh Belas",
        "Unit 731",
        "Yang Penting Tidak [PESAN DIHAPUS]"
    ]

    generated_files = []

    print("--- Membuat File .docx Kosong ---")
    for title_text in titles:
        # Membuat dokumen baru yang benar-benar bersih tanpa isi
        doc = Document()
        
        # Membersihkan karakter bracket agar aman saat disimpan di sistem operasi
        safe_filename = f"{title_text.replace('[', '').replace(']', '')}.docx"
        
        # Simpan dokumen dalam keadaan kosong murni
        doc.save(safe_filename)
        generated_files.append(safe_filename)
        print(f"[Kosong] Berhasil dibuat -> {safe_filename}")

    print("\n--- Membuka Semua File Sekaligus ---")
    # Membuka semua berkas secara paralel
    for filename in generated_files:
        try:
            if platform.system() == "Windows":
                os.startfile(filename)
            elif platform.system() == "Darwin":  # macOS
                subprocess.Popen(["open", filename])
            else:  # Linux
                subprocess.Popen(["xdg-open", filename])
            print(f"[Membuka] -> {filename}")
        except Exception as e:
            print(f"[Gagal Membuka] {filename}: {e}")

if __name__ == "__main__":
    create_and_open_blank_docx()