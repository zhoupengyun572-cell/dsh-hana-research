param(
  [Parameter(Mandatory = $true)][string]$InputDocx,
  [Parameter(Mandatory = $true)][string]$OutputPdf
)

$word = $null
$document = $null
try {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $document = $word.Documents.Open((Resolve-Path -LiteralPath $InputDocx).Path, $false, $true)
  $outputPath = [System.IO.Path]::GetFullPath($OutputPdf)
  $document.ExportAsFixedFormat($outputPath, 17)
  Write-Output $outputPath
} finally {
  if ($document) { $document.Close($false) }
  if ($word) { $word.Quit() }
  if ($document) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($document) }
  if ($word) { [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word) }
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
