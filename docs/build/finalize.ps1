# Membuka raw.docx di Microsoft Word, memperbarui semua field (daftar isi, daftar gambar/tabel,
# nomor halaman, STYLEREF), lalu menyimpan DOCX final dan mengekspor PDF.
# Prasyarat: Microsoft Word terpasang (otomasi COM). Jalankan: powershell -File finalize.ps1
param(
  [string]$Raw = (Join-Path $PSScriptRoot "out\raw.docx"),
  [string]$DocxOut = (Join-Path $PSScriptRoot "..\Dokumen-Teknis-Gmail-Notify-v1.0.0.docx"),
  [string]$PdfOut = (Join-Path $PSScriptRoot "..\Dokumen-Teknis-Gmail-Notify-v1.0.0.pdf")
)

$Raw = (Resolve-Path $Raw).Path
$DocxOut = [System.IO.Path]::GetFullPath($DocxOut)
$PdfOut = [System.IO.Path]::GetFullPath($PdfOut)
foreach ($f in @($DocxOut, $PdfOut)) { if (Test-Path $f) { Remove-Item $f -Force } }

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$doc = $null
try {
  $doc = $word.Documents.Open($Raw, $false, $false)

  # dua putaran: pembaruan pertama dapat menggeser halaman sehingga nomor di daftar isi perlu dihitung ulang
  for ($i = 0; $i -lt 2; $i++) {
    $doc.Repaginate()
    foreach ($t in $doc.TablesOfContents) { $t.Update() }
    foreach ($t in $doc.TablesOfFigures) { $t.Update() }
    $null = $doc.Fields.Update()
    foreach ($s in $doc.Sections) {
      foreach ($k in 1, 2, 3) {
        try { $null = $s.Headers.Item($k).Range.Fields.Update() } catch {}
        try { $null = $s.Footers.Item($k).Range.Fields.Update() } catch {}
      }
    }
  }
  $doc.Repaginate()

  $total = $doc.ComputeStatistics(2)   # wdStatisticPages
  Write-Host "Jumlah halaman (termasuk sampul): $total"
  Write-Host "Daftar isi: $($doc.TablesOfContents.Count) | Daftar gambar/tabel: $($doc.TablesOfFigures.Count) | Bagian: $($doc.Sections.Count)"

  $doc.SaveAs2($DocxOut, 16)            # wdFormatXMLDocument
  # wdExportFormatPDF=17, OptimizeForPrint=0, ExportAllDocument=0, CreateHeadingBookmarks=1
  $doc.ExportAsFixedFormat($PdfOut, 17, $false, 0, 0, 1, 1, 0, $true, $true, 1, $true, $true, $false)
  Write-Host "DOCX: $DocxOut"
  Write-Host "PDF : $PdfOut"
}
finally {
  if ($doc) { $doc.Close(0) }
  $word.Quit()
}
