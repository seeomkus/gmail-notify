// Konstruktor blok isi dokumen. Satu sumber untuk DOCX/PDF dan Markdown.
//
// Penanda teks sebaris yang didukung di semua string:  **tebal**   *miring*   `kode`

export const h1 = (text) => ({ type: "h1", text });
export const h2 = (text) => ({ type: "h2", text });
export const h3 = (text) => ({ type: "h3", text });
export const p = (text) => ({ type: "p", text });
export const ul = (items) => ({ type: "ul", items });
export const ol = (items) => ({ type: "ol", items });

/** table({ caption, cols: [bobot kolom], head: [...], rows: [[...]] }) */
export const table = (o) => ({ type: "table", ...o });

/** code("ts", "isi kode") */
export const code = (lang, text) => ({ type: "code", lang, text: text.replace(/^\n+|\n+$/g, "") });

/** fig("diagram-erd.png", "Keterangan gambar", 15.5) → lebar dalam cm */
export const fig = (file, caption, widthCm = 15.5, maxHeightCm = 19) => ({ type: "fig", file, caption, widthCm, maxHeightCm });

/** note("info" | "warn" | "tip", "Judul", "isi") */
export const note = (kind, title, text) => ({ type: "note", kind, title, text });
