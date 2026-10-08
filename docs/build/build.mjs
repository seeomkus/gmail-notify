// Membuat dokumen teknis dari satu sumber isi (content-*.mjs):
//   out/raw.docx            -> DOCX mentah dengan field Word asli (TOC, SEQ, PAGE, SECTIONPAGES, STYLEREF)
//   ../DOKUMEN-TEKNIS.md    -> versi Markdown
// Langkah berikutnya (finalize.ps1) membuka raw.docx di Microsoft Word, memperbarui seluruh field,
// lalu menyimpan DOCX final dan mengekspor PDF.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  AlignmentType, BorderStyle, Document, ExternalHyperlink, Footer, Header, HeadingLevel, HorizontalPositionRelativeFrom, ImageRun,
  LevelFormat, NumberFormat, Packer, Paragraph, SimpleField, Tab, TabStopType, Table, TableCell, TableLayoutType,
  TableOfContents, TableRow, TextRun, TextWrappingType, VerticalPositionRelativeFrom, WidthType, ShadingType, PageNumber,
  VerticalAlign,
} from "docx";
import { part1 } from "./content-1.mjs";
import { bibliography, part2 } from "./content-2.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const IMG = path.resolve(here, "..", "images");
const OUT = path.join(here, "out");
fs.mkdirSync(OUT, { recursive: true });

// ======================================================================
//  Metadata dokumen
// ======================================================================
const meta = {
  title: "Gmail Notify",
  subtitle: "Dokumen Teknis Aplikasi Notifikasi Email",
  tagline: "Arsitektur, basis data, antarmuka, spesifikasi API, keamanan, deployment, pengujian, dan operasional",
  code: "GN-TD-001",
  version: "1.0.0",
  date: "8 Oktober 2026",
  status: "Rilis",
  classification: "Internal",
  author: "Kusnandar Rohim (SeeOmKus)",
  website: "www.seeomkus.com",
  websiteUrl: "https://www.seeomkus.com",
  period: "Oktober 2026",
};

const revisions = [
  { version: "1.0.0", date: "8 Oktober 2026", author: "Kusnandar Rohim (SeeOmKus)", change: "Rilis awal dokumen teknis: arsitektur, desain basis data, antarmuka, spesifikasi fungsional dan API, keamanan, konfigurasi dan deployment, pengujian, operasional, serta rencana pengembangan.", status: "Rilis" },
];

const body = [...part1, ...part2];

// ======================================================================
//  Konstanta tata letak (A4, satuan DXA = 1/20 pt)
// ======================================================================
const PAGE_W = 11906, PAGE_H = 16838;
const M = { top: 1418, bottom: 1418, left: 1701, right: 1134, header: 709, footer: 709 };
const CONTENT_W = PAGE_W - M.left - M.right; // 9071
const INDIGO = "312E81", BLUE = "4338CA", SLATE = "475569", INK = "0F172A", MUTED = "64748B", LINE = "CBD5E1";
const FONT = "Calibri", MONO = "Consolas";

// ======================================================================
//  Penanda sebaris: **tebal**  *miring*  `kode`
// ======================================================================
const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*)/g;

function runs(text, base = {}) {
  return String(text).split(INLINE).filter((s) => s !== "").map((tok) => {
    if (tok.startsWith("**") && tok.endsWith("**") && tok.length > 4) return new TextRun({ ...base, text: tok.slice(2, -2), bold: true });
    if (tok.startsWith("`") && tok.endsWith("`") && tok.length > 2) {
      return new TextRun({ ...base, text: tok.slice(1, -1), font: MONO, size: Math.max(16, (base.size ?? 22) - 2), color: "9D174D", shading: { type: ShadingType.CLEAR, fill: "F1F5F9", color: "auto" } });
    }
    if (tok.startsWith("*") && tok.endsWith("*") && tok.length > 2) return new TextRun({ ...base, text: tok.slice(1, -1), italics: true });
    return new TextRun({ ...base, text: tok });
  });
}

const plain = (text) => String(text).replace(/\*\*([^*]+)\*\*/g, "$1").replace(/`([^`]+)`/g, "$1").replace(/\*([^*\s][^*]*)\*/g, "$1");

// ======================================================================
//  Konversi blok -> elemen docx
// ======================================================================
let figNo = 0, tblNo = 0, olNo = 0;
const olRefs = [];

function pngSize(file) {
  const b = fs.readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), data: b };
}

const caption = (kind, n, text, align) =>
  new Paragraph({
    style: "Caption",
    alignment: align,
    keepNext: kind === "Tabel",
    children: [
      new TextRun({ text: `${kind} ` }),
      new SimpleField(`SEQ ${kind} \\* ARABIC`, String(n)),
      new TextRun({ text: `. ${plain(text)}`, bold: false, color: SLATE }),
    ],
  });

const border = (color = LINE, size = 4) => ({ style: BorderStyle.SINGLE, size, color });
const noBorder = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

function scaleCols(weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  const cols = weights.map((w) => Math.floor((w / sum) * CONTENT_W));
  cols[cols.length - 1] += CONTENT_W - cols.reduce((a, b) => a + b, 0);
  return cols;
}

function tableBlock(b) {
  tblNo++;
  const cols = scaleCols(b.cols);
  const cell = (text, i, header, rowIdx) =>
    new TableCell({
      width: { size: cols[i], type: WidthType.DXA },
      verticalAlign: VerticalAlign.TOP,
      margins: { top: 70, bottom: 70, left: 110, right: 110 },
      shading: header
        ? { type: ShadingType.CLEAR, fill: INDIGO, color: "auto" }
        : rowIdx % 2 === 1 ? { type: ShadingType.CLEAR, fill: "F8FAFC", color: "auto" } : undefined,
      children: [new Paragraph({
        spacing: { before: 0, after: 0, line: 252 },
        children: runs(text, header ? { size: 19, bold: true, color: "FFFFFF" } : { size: 19 }),
      })],
    });
  const rows = [
    new TableRow({ tableHeader: true, cantSplit: true, children: b.head.map((h, i) => cell(h, i, true, 0)) }),
    ...b.rows.map((r, ri) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, i, false, ri)) })),
  ];
  return [
    caption("Tabel", tblNo, b.caption, AlignmentType.LEFT),
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: cols,
      layout: TableLayoutType.FIXED,
      borders: { top: border(), bottom: border(), left: border(), right: border(), insideHorizontal: border(), insideVertical: border() },
      rows,
    }),
    new Paragraph({ spacing: { before: 0, after: 200 }, children: [] }),
  ];
}

function codeBlock(b) {
  const lines = b.text.split("\n");
  const long = lines.length > 28;
  return [
    ...lines.map((ln, i) =>
      new Paragraph({
        keepLines: true,
        keepNext: !long && i < lines.length - 1,
        spacing: { before: i === 0 ? 60 : 0, after: i === lines.length - 1 ? 200 : 0, line: 240 },
        indent: { left: 170, right: 100 },
        shading: { type: ShadingType.CLEAR, fill: "F1F5F9", color: "auto" },
        border: { left: { style: BorderStyle.SINGLE, size: 18, color: "6366F1", space: 6 } },
        children: [new TextRun({ text: ln === "" ? " " : ln, font: MONO, size: 16, color: "1E293B" })],
      })
    ),
  ];
}

function noteBlock(b) {
  const pal = { info: ["EFF6FF", "2563EB"], warn: ["FFF7ED", "EA580C"], tip: ["F0FDF4", "16A34A"] }[b.kind] ?? ["F8FAFC", "64748B"];
  return [
    new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      columnWidths: [CONTENT_W],
      layout: TableLayoutType.FIXED,
      borders: { top: noBorder, bottom: noBorder, right: noBorder, insideHorizontal: noBorder, insideVertical: noBorder, left: { style: BorderStyle.SINGLE, size: 36, color: pal[1] } },
      rows: [new TableRow({
        cantSplit: true,
        children: [new TableCell({
          width: { size: CONTENT_W, type: WidthType.DXA },
          margins: { top: 110, bottom: 110, left: 200, right: 160 },
          shading: { type: ShadingType.CLEAR, fill: pal[0], color: "auto" },
          children: [
            new Paragraph({ keepNext: true, spacing: { before: 0, after: 50 }, children: [new TextRun({ text: b.title, bold: true, color: pal[1], size: 21 })] }),
            new Paragraph({ spacing: { before: 0, after: 0, line: 264 }, children: runs(b.text, { size: 20 }) }),
          ],
        })],
      })],
    }),
    new Paragraph({ spacing: { before: 0, after: 200 }, children: [] }),
  ];
}

function figBlock(b) {
  figNo++;
  const file = path.join(IMG, b.file);
  if (!fs.existsSync(file)) throw new Error("Gambar tidak ditemukan: " + file);
  const { w, h, data } = pngSize(file);
  const maxW = b.widthCm, maxH = b.maxHeightCm;
  let wc = maxW, hc = (maxW * h) / w;
  if (hc > maxH) { hc = maxH; wc = (maxH * w) / h; }
  const px = (cm) => Math.round((cm / 2.54) * 96);
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER, keepNext: true, spacing: { before: 120, after: 80 },
      children: [new ImageRun({ type: "png", data, transformation: { width: px(wc), height: px(hc) }, altText: { title: b.caption, description: b.caption, name: b.file } })],
    }),
    caption("Gambar", figNo, b.caption, AlignmentType.CENTER),
  ];
}

function listBlock(b, ordered) {
  let ref = "bullets";
  if (ordered) {
    ref = `ol${++olNo}`;
    olRefs.push(ref);
  }
  return b.items.map((it, i) =>
    new Paragraph({
      numbering: { reference: ref, level: 0 },
      spacing: { before: 0, after: i === b.items.length - 1 ? 160 : 60, line: 288 },
      children: runs(it),
    })
  ).concat([]);
}

const headingStyle = { h1: HeadingLevel.HEADING_1, h2: HeadingLevel.HEADING_2, h3: HeadingLevel.HEADING_3 };

function convert(blocks) {
  const out = [];
  for (const b of blocks) {
    switch (b.type) {
      case "h1": case "h2": case "h3":
        out.push(new Paragraph({
          heading: headingStyle[b.type],
          numbering: { reference: "headings", level: Number(b.type[1]) - 1 },
          children: [new TextRun({ text: b.text })],
        }));
        break;
      case "p": out.push(new Paragraph({ spacing: { before: 0, after: 160, line: 300 }, alignment: AlignmentType.JUSTIFIED, children: runs(b.text) })); break;
      case "ul": out.push(...listBlock(b, false)); break;
      case "ol": out.push(...listBlock(b, true)); break;
      case "table": out.push(...tableBlock(b)); break;
      case "code": out.push(...codeBlock(b)); break;
      case "note": out.push(...noteBlock(b)); break;
      case "fig": out.push(...figBlock(b)); break;
      default: throw new Error("Jenis blok tidak dikenal: " + b.type);
    }
  }
  return out;
}

const bodyChildren = convert(body);

// Daftar Pustaka: judul tanpa nomor (tetap tampil di daftar isi karena memakai Heading 1)
bodyChildren.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: "Daftar Pustaka" })] }));
bodyChildren.push(new Paragraph({ spacing: { after: 160 }, alignment: AlignmentType.JUSTIFIED, children: runs("Rujukan berikut dipakai sebagai dasar teknis dan dokumentasi resmi komponen yang digunakan Gmail Notify. Seluruh tautan diakses pada 8 Oktober 2026.") }));
for (const ref of bibliography) {
  bodyChildren.push(new Paragraph({
    spacing: { before: 0, after: 110, line: 276 },
    indent: { left: 567, hanging: 567 },
    children: runs(ref, { size: 21 }),
  }));
}

// ======================================================================
//  Sampul
// ======================================================================
const banner = pngSize(path.join(IMG, "cover-banner.png"));
const cover = [
  new Paragraph({
    spacing: { before: 0, after: 0 },
    children: [new ImageRun({
      type: "png", data: banner.data, transformation: { width: 794, height: 468 }, altText: { title: "Sampul", description: "Banner sampul", name: "cover-banner" },
      floating: {
        horizontalPosition: { relative: HorizontalPositionRelativeFrom.PAGE, offset: 0 },
        verticalPosition: { relative: VerticalPositionRelativeFrom.PAGE, offset: 0 },
        behindDocument: true, allowOverlap: true, wrap: { type: TextWrappingType.NONE },
      },
    })],
  }),
  new Paragraph({ spacing: { before: 0, after: 80 }, children: [new TextRun({ text: meta.title, font: FONT, size: 92, bold: true, color: "FFFFFF" })] }),
  new Paragraph({ spacing: { before: 0, after: 200 }, children: [new TextRun({ text: meta.subtitle, font: FONT, size: 40, color: "FFFFFF" })] }),
  new Paragraph({ spacing: { before: 0, after: 0, line: 300 }, children: [new TextRun({ text: meta.tagline, font: FONT, size: 24, color: "E0E7FF" })] }),
];

const infoRows = [
  ["Kode dokumen", meta.code], ["Versi", meta.version], ["Tanggal", meta.date],
  ["Status", meta.status], ["Klasifikasi", meta.classification], ["Penyusun", meta.author],
  ["Situs web", meta.website], ["Periode", meta.period],
];
cover.push(new Paragraph({ spacing: { before: 2750, after: 120 }, children: [new TextRun({ text: "INFORMASI DOKUMEN", font: FONT, size: 20, bold: true, color: "4F46E5", characterSpacing: 40 })] }));
cover.push(new Table({
  width: { size: 10092, type: WidthType.DXA },
  columnWidths: [2400, 7692],
  layout: TableLayoutType.FIXED,
  borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder, insideVertical: noBorder, insideHorizontal: border("E2E8F0", 4) },
  rows: infoRows.map(([k, v]) => new TableRow({
    children: [
      new TableCell({ width: { size: 2400, type: WidthType.DXA }, margins: { top: 90, bottom: 90, left: 0, right: 100 }, children: [new Paragraph({ children: [new TextRun({ text: k, font: FONT, size: 22, color: MUTED })] })] }),
      new TableCell({ width: { size: 7692, type: WidthType.DXA }, margins: { top: 90, bottom: 90, left: 0, right: 0 }, children: [new Paragraph({ children: [new TextRun({ text: v, font: FONT, size: 24, bold: true, color: INK })] })] }),
    ],
  })),
}));

cover.push(new Paragraph({
  spacing: { before: 360, after: 0 },
  children: [
    new TextRun({ text: `© ${meta.period} · ${meta.author} · `, font: FONT, size: 20, color: MUTED }),
    new ExternalHyperlink({ link: meta.websiteUrl, children: [new TextRun({ text: meta.website, font: FONT, size: 20, color: "4F46E5", underline: {} })] }),
  ],
}));

// ======================================================================
//  Bagian depan (romawi): informasi, riwayat revisi, daftar isi/gambar/tabel
// ======================================================================
const frontHeading = (text, pageBreak = false) =>
  new Paragraph({ style: "FrontHeading", pageBreakBefore: pageBreak, children: [new TextRun({ text })] });

const simpleTable = (cols, head, rows, widths) => new Table({
  width: { size: CONTENT_W, type: WidthType.DXA },
  columnWidths: widths,
  layout: TableLayoutType.FIXED,
  borders: { top: border(), bottom: border(), left: border(), right: border(), insideHorizontal: border(), insideVertical: border() },
  rows: [
    new TableRow({ tableHeader: true, cantSplit: true, children: head.map((h, i) => new TableCell({
      width: { size: widths[i], type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 110, right: 110 },
      shading: { type: ShadingType.CLEAR, fill: INDIGO, color: "auto" },
      children: [new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: h, bold: true, color: "FFFFFF", size: 19 })] })],
    })) }),
    ...rows.map((r, ri) => new TableRow({ cantSplit: true, children: r.map((c, i) => new TableCell({
      width: { size: widths[i], type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 110, right: 110 },
      shading: ri % 2 === 1 ? { type: ShadingType.CLEAR, fill: "F8FAFC", color: "auto" } : undefined,
      children: [new Paragraph({ spacing: { after: 0, line: 252 }, children: runs(c, { size: 19 }) })],
    })) })),
  ],
});

const front = [
  frontHeading("Informasi Dokumen"),
  simpleTable(2, ["Atribut", "Keterangan"], [
    ["Nama dokumen", `${meta.title}: ${meta.subtitle}`],
    ["Kode dokumen", meta.code],
    ["Versi", meta.version],
    ["Tanggal terbit", meta.date],
    ["Status", meta.status],
    ["Klasifikasi", meta.classification],
    ["Penyusun", meta.author],
    ["Situs web", meta.website],
    ["Periode pembuatan", meta.period],
    ["Cakupan versi aplikasi", "Gmail Notify 1.0.0 (backend dan frontend)"],
  ], [2800, CONTENT_W - 2800]),
  new Paragraph({ spacing: { before: 0, after: 300 }, children: [] }),

  frontHeading("Riwayat Revisi"),
  simpleTable(5, ["Versi", "Tanggal", "Penyusun", "Perubahan", "Status"],
    revisions.map((r) => [r.version, r.date, r.author, r.change, r.status]),
    [900, 1500, 1700, CONTENT_W - 900 - 1500 - 1700 - 900, 900]),
  new Paragraph({ spacing: { before: 160, after: 0, line: 276 }, children: runs("Setiap perubahan dokumen dicatat pada tabel ini. Penomoran versi mengikuti pola *mayor.minor.patch*: mayor untuk perubahan struktur besar, minor untuk penambahan bagian atau fitur yang didokumentasikan, dan patch untuk perbaikan redaksi.", { size: 20, color: SLATE }) }),

  frontHeading("Daftar Isi", true),
  new TableOfContents("Daftar Isi", { hyperlink: true, headingStyleRange: "1-2" }),

  frontHeading("Daftar Gambar", true),
  new Paragraph({ children: [new SimpleField('TOC \\h \\z \\c "Gambar"', "Daftar gambar akan terisi saat bidang diperbarui (tekan F9).")] }),

  frontHeading("Daftar Tabel", true),
  new Paragraph({ children: [new SimpleField('TOC \\h \\z \\c "Tabel"', "Daftar tabel akan terisi saat bidang diperbarui (tekan F9).")] }),
];

// ======================================================================
//  Header & footer (tidak dipakai pada sampul)
// ======================================================================
const hfRun = (t, extra = {}) => new TextRun({ text: t, font: FONT, size: 18, color: MUTED, ...extra });
const tabsRight = [{ type: TabStopType.RIGHT, position: CONTENT_W }];

const headerFor = (rightChildren) => new Header({
  children: [new Paragraph({
    style: "HFText",
    tabStops: tabsRight,
    spacing: { after: 0 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "C7D2FE", space: 4 } },
    children: [hfRun("Dokumen Teknis · Gmail Notify", { bold: true, color: INDIGO }), new TextRun({ children: [new Tab()] }), ...rightChildren],
  })],
});

const footerFor = (totalField) => new Footer({
  children: [new Paragraph({
    style: "HFText",
    tabStops: tabsRight,
    spacing: { before: 0 },
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: "C7D2FE", space: 4 } },
    children: [
      hfRun(`Versi ${meta.version} · Dokumen ${meta.classification} · © 2026 SeeOmKus`),
      new TextRun({ children: [new Tab()] }),
      new TextRun({ children: ["Hal ", PageNumber.CURRENT, " dari "], font: FONT, size: 18, color: MUTED }),
      totalField,
    ],
  })],
});

const frontHeader = headerFor([hfRun("Bagian Depan")]);
const bodyHeader = headerFor([new SimpleField('STYLEREF "Heading 1"', "Pendahuluan")]);
const frontFooter = footerFor(new SimpleField("SECTIONPAGES \\* roman", "iv"));
const bodyFooter = footerFor(new TextRun({ children: [PageNumber.TOTAL_PAGES_IN_SECTION], font: FONT, size: 18, color: MUTED }));

// ======================================================================
//  Dokumen
// ======================================================================
const headingLevels = [
  { level: 0, format: LevelFormat.DECIMAL, text: "%1", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 567 } } } },
  { level: 1, format: LevelFormat.DECIMAL, text: "%1.%2", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 709, hanging: 709 } } } },
  { level: 2, format: LevelFormat.DECIMAL, text: "%1.%2.%3", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 851, hanging: 851 } } } },
];

const doc = new Document({
  creator: meta.author,
  title: `${meta.title}: ${meta.subtitle}`,
  subject: `Dokumen teknis versi ${meta.version}`,
  description: meta.tagline,
  keywords: "Gmail Notify, dokumen teknis, Vue, Express, SQLite",
  styles: {
    default: { document: { run: { font: FONT, size: 22, color: "1E293B" }, paragraph: { spacing: { line: 300 } } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 36, bold: true, color: INDIGO },
        paragraph: { pageBreakBefore: true, keepNext: true, keepLines: true, spacing: { before: 0, after: 240 }, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: "6366F1", space: 6 } } } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 28, bold: true, color: BLUE },
        paragraph: { keepNext: true, keepLines: true, spacing: { before: 320, after: 140 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 24, bold: true, color: SLATE },
        paragraph: { keepNext: true, keepLines: true, spacing: { before: 240, after: 100 }, outlineLevel: 2 } },
      { id: "FrontHeading", name: "Front Heading", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 36, bold: true, color: INDIGO },
        paragraph: { keepNext: true, spacing: { before: 0, after: 240 },
          border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: "6366F1", space: 6 } } } },
      { id: "Caption", name: "caption", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { font: FONT, size: 19, bold: true, color: INDIGO },
        paragraph: { spacing: { before: 60, after: 140, line: 252 } } },
      // gaya header/footer: hasil field (STYLEREF, SECTIONPAGES) mewarisi ukuran dan warna ini
      { id: "HFText", name: "Header Footer Text", basedOn: "Normal", next: "Normal",
        run: { font: FONT, size: 18, color: MUTED }, paragraph: { spacing: { line: 240 } } },
      { id: "TOC1", name: "toc 1", basedOn: "Normal", next: "Normal", run: { bold: true, size: 22 }, paragraph: { spacing: { before: 100, after: 20, line: 250 } } },
      { id: "TOC2", name: "toc 2", basedOn: "Normal", next: "Normal", run: { size: 20 }, paragraph: { spacing: { before: 0, after: 0, line: 250 }, indent: { left: 340 } } },
      { id: "TableofFigures", name: "table of figures", basedOn: "Normal", next: "Normal", run: { size: 21 }, paragraph: { spacing: { before: 0, after: 50 } } },
    ],
  },
  numbering: {
    config: [
      { reference: "headings", levels: headingLevels },
      { reference: "bullets", levels: [
        { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 270 } } } },
        { level: 1, format: LevelFormat.BULLET, text: "–", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1000, hanging: 270 } } } },
      ] },
      ...olRefs.map((reference) => ({ reference, levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 540, hanging: 340 } } } }] })),
    ],
  },
  sections: [
    // 1. Sampul: tanpa header dan footer
    {
      properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: { top: 2380, bottom: 700, left: 907, right: 907, header: 0, footer: 0 } } },
      children: cover,
    },
    // 2. Bagian depan: nomor romawi
    {
      properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: M, pageNumbers: { start: 1, formatType: NumberFormat.LOWER_ROMAN } } },
      headers: { default: frontHeader }, footers: { default: frontFooter },
      children: front,
    },
    // 3. Isi: nomor arab mulai 1
    {
      properties: { page: { size: { width: PAGE_W, height: PAGE_H }, margin: M, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } } },
      headers: { default: bodyHeader }, footers: { default: bodyFooter },
      children: bodyChildren,
    },
  ],
});

const buf = await Packer.toBuffer(doc);
fs.writeFileSync(path.join(OUT, "raw.docx"), buf);
console.log(`raw.docx dibuat: ${(buf.length / 1024).toFixed(0)} KB · ${figNo} gambar · ${tblNo} tabel · ${bibliography.length} pustaka`);

// ======================================================================
//  Markdown
// ======================================================================
const slug = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "-");
const cell = (s) => String(s).replace(/\|/g, "\\|");
const md = [];
const toc = [];
const c = [0, 0, 0];
let mf = 0, mt = 0;

md.push(`# ${meta.title}: ${meta.subtitle}`, "", `> ${meta.tagline}.`, "");
md.push("| Atribut | Keterangan |", "|---|---|");
for (const [k, v] of infoRows) md.push(`| ${k} | ${v} |`);
md.push("", "## Riwayat Revisi", "", "| Versi | Tanggal | Penyusun | Perubahan | Status |", "|---|---|---|---|---|");
for (const r of revisions) md.push(`| ${r.version} | ${r.date} | ${r.author} | ${cell(r.change)} | ${r.status} |`);
md.push("", "> Dokumen ini dibuat otomatis dari sumber yang sama dengan PDF (`docs/build`). Versi PDF: [`Dokumen-Teknis-Gmail-Notify-v1.0.0.pdf`](Dokumen-Teknis-Gmail-Notify-v1.0.0.pdf).", "");

const bodyMd = [];
for (const b of body) {
  switch (b.type) {
    case "h1": c[0]++; c[1] = 0; c[2] = 0; { const t = `${c[0]}. ${b.text}`; toc.push([1, t]); bodyMd.push("", `## ${t}`, ""); } break;
    case "h2": c[1]++; c[2] = 0; { const t = `${c[0]}.${c[1]} ${b.text}`; toc.push([2, t]); bodyMd.push("", `### ${t}`, ""); } break;
    case "h3": c[2]++; bodyMd.push("", `#### ${c[0]}.${c[1]}.${c[2]} ${b.text}`, ""); break;
    case "p": bodyMd.push(b.text, ""); break;
    case "ul": bodyMd.push(...b.items.map((i) => `- ${i}`), ""); break;
    case "ol": bodyMd.push(...b.items.map((i, k) => `${k + 1}. ${i}`), ""); break;
    case "table": {
      mt++;
      bodyMd.push(`**Tabel ${mt}.** ${b.caption}`, "", `| ${b.head.map(cell).join(" | ")} |`, `|${b.head.map(() => "---").join("|")}|`);
      for (const r of b.rows) bodyMd.push(`| ${r.map(cell).join(" | ")} |`);
      bodyMd.push("");
      break;
    }
    case "code": bodyMd.push("```" + b.lang, b.text, "```", ""); break;
    case "fig": mf++; bodyMd.push(`![Gambar ${mf}. ${b.caption}](images/${b.file})`, "", `*Gambar ${mf}. ${b.caption}*`, ""); break;
    case "note": bodyMd.push(`> **${b.title}.** ${b.text}`, ""); break;
  }
}
toc.push([1, "Daftar Pustaka"]);

md.push("## Daftar Isi", "");
for (const [lvl, t] of toc) md.push(`${lvl === 2 ? "  " : ""}- [${t}](#${slug(t)})`);
md.push(...bodyMd, "", "## Daftar Pustaka", "", ...bibliography.map((r, i) => `${i + 1}. ${r}`), "");

md.push("---", "", `© ${meta.period} ${meta.author} · [${meta.website}](${meta.websiteUrl})`, "");
fs.writeFileSync(path.resolve(here, "..", "DOKUMEN-TEKNIS.md"), md.join("\n"), "utf8");
console.log("DOKUMEN-TEKNIS.md dibuat");
