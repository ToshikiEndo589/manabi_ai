
param()
$filePath = 'c:\Users\tsken\Downloads\AI-YOBIKOU-main (1)\AI-YOBIKOU-main\native\src\screens\ReviewScreen.tsx'
$rawBytes = [System.IO.File]::ReadAllBytes($filePath)
Write-Host "File size: $($rawBytes.Length) bytes"

$standaloneNewlines = [System.Collections.Generic.List[int]]::new()
for ($i = 1; $i -lt $rawBytes.Length; $i++) {
    if ($rawBytes[$i] -eq 0x0A -and $rawBytes[$i-1] -ne 0x0D) {
        $standaloneNewlines.Add($i)
    }
}
Write-Host "Standalone LF bytes found: $($standaloneNewlines.Count)"

$shown = 0
foreach ($idx in $standaloneNewlines) {
    if ($shown -ge 10) { break }
    $start2 = [Math]::Max(0, $idx - 20)
    $end2 = [Math]::Min($rawBytes.Length, $idx + 20)
    $before2 = $rawBytes[$start2..($idx-1)]
    $after2 = $rawBytes[($idx+1)..($end2-1)]
    $beforeHex2 = ($before2 | ForEach-Object { $_.ToString('X2') }) -join ' '
    $afterHex2 = ($after2 | ForEach-Object { $_.ToString('X2') }) -join ' '
    Write-Host "LF at $idx : $beforeHex2 [0A] $afterHex2"
    $shown++
}
