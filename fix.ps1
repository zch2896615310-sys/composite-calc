
$path = "e:\antigravity\stonecalc\stone_web\index.html"
Write-Host "Reading file..."
$lines = Get-Content $path -Encoding Default
$newLines = $lines | ForEach-Object {
    $_ -replace [regex]::Escape('content: "?;'), 'content: "▶";' `
       -replace [regex]::Escape("includes('第四?)"), "includes('第四节')" `
       -replace [regex]::Escape("includes('第四')"), "includes('第四节')"
}
Write-Host "Writing file as UTF8..."
$newLines | Set-Content $path -Encoding UTF8
Write-Host "Done."
