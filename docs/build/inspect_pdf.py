"""Pemeriksaan PDF: jumlah halaman, teks header/footer tiap halaman, outline, dan render ke PNG untuk ditinjau.
Pemakaian: python inspect_pdf.py <pdf> <folder_keluaran> [halaman,halaman,...]
"""
import sys, os, re
import fitz  # PyMuPDF

pdf, out = sys.argv[1], sys.argv[2]
pages = [int(x) for x in sys.argv[3].split(",")] if len(sys.argv) > 3 else []
os.makedirs(out, exist_ok=True)
doc = fitz.open(pdf)
print("Halaman:", doc.page_count, "| ukuran:", doc[0].rect)

print("\n--- header/footer per halaman (baris teratas dan terbawah) ---")
for i, page in enumerate(doc, start=1):
    h = page.rect.height
    blocks = page.get_text("blocks")
    top = [b[4].strip().replace("\n", " ") for b in blocks if b[1] < 60]
    bot = [b[4].strip().replace("\n", " ") for b in blocks if b[3] > h - 60]
    print(f"{i:>3} | H: {' / '.join(top)[:70]:<70} | F: {' / '.join(bot)[:60]}")

print("\n--- outline (bookmark) ---")
for lvl, title, pg in doc.get_toc()[:40]:
    print("  " * (lvl - 1) + f"{title}  (hal PDF {pg})")

for p in pages:
    pix = doc[p - 1].get_pixmap(dpi=70)
    path = os.path.join(out, f"p{p:02d}.png")
    pix.save(path)
    print("render", path)
