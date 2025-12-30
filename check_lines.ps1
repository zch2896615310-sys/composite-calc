
$path = "e:\antigravity\stonecalc\stone_web\index.html"
$c = Get-Content $path
Write-Host "Total Lines: $($c.Count)"
if ($c.Count -gt 607) { Write-Host "Line 608: $($c[607])" }
if ($c.Count -gt 1583) { Write-Host "Line 1584: $($c[1583])" }
