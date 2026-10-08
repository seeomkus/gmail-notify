"""Lembar kontak: menggabungkan beberapa halaman PDF menjadi satu gambar untuk memeriksa tata letak sekilas.
Pemakaian: python contact_sheet.py <pdf> <keluaran.png> <halaman_awal> <halaman_akhir> [kolom]
"""
import sys
import pymupdf

pdf, out, a, b = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
cols = int(sys.argv[5]) if len(sys.argv) > 5 else 5
doc = pymupdf.open(pdf)
pages = list(range(a, b + 1))
scale = 0.42
pix0 = doc[0].get_pixmap(matrix=pymupdf.Matrix(scale, scale))
w, h = pix0.width, pix0.height
rows = (len(pages) + cols - 1) // cols
pad = 8
sheet = pymupdf.Pixmap(pymupdf.csRGB, pymupdf.IRect(0, 0, cols * (w + pad) + pad, rows * (h + pad) + pad), False)
sheet.set_rect(sheet.irect, (200, 205, 215))
for i, p in enumerate(pages):
    pm = doc[p - 1].get_pixmap(matrix=pymupdf.Matrix(scale, scale), alpha=False)
    x = pad + (i % cols) * (w + pad)
    y = pad + (i // cols) * (h + pad)
    pm.set_origin(x, y)
    sheet.copy(pm, pymupdf.IRect(x, y, x + pm.width, y + pm.height))
sheet.save(out)
print("tersimpan", out, sheet.width, "x", sheet.height)
