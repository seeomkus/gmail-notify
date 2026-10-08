// Menyeragamkan metadata DOCX hasil Word: "lastModifiedBy" otomatis berisi nama pengguna Windows,
// diganti dengan nama penulis agar tidak membawa nama akun komputer ke repositori.
import fs from "node:fs";
import JSZip from "jszip";

const file = process.argv[2];
const author = process.argv[3] || "Kusnandar R";
if (!file) throw new Error("Pemakaian: node fixmeta.mjs <berkas.docx> [nama]");

const zip = await JSZip.loadAsync(fs.readFileSync(file));
const entry = zip.file("docProps/core.xml");
let xml = await entry.async("string");
xml = xml.replace(/<cp:lastModifiedBy>[^<]*<\/cp:lastModifiedBy>/, `<cp:lastModifiedBy>${author}</cp:lastModifiedBy>`);
zip.file("docProps/core.xml", xml);
fs.writeFileSync(file, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
console.log("metadata DOCX diseragamkan:", author);
