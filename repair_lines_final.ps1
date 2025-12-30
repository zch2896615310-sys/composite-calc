
$path = "e:\antigravity\stonecalc\stone_web\index.html"
$c = Get-Content $path
# Index 606 correlates to Line ~608 ("content")
# Index 1583 correlates to Line ~1584 ("includes")

# Verify and Swap CSS
if ($c[606] -match "content") {
    Write-Host "Fixing CSS at index 606..."
    $c[606] = '            content: "▶";'
}
else {
    Write-Host "WARNING: Index 606 does not look like content line: $($c[606])"
    # Fallback: check neighbors
    if ($c[607] -match "content") { $c[607] = '            content: "▶";'; Write-Host "Fixed at 607" }
    elseif ($c[605] -match "content") { $c[605] = '            content: "▶";'; Write-Host "Fixed at 605" }
}

# Verify and Swap JS
if ($c[1583] -match "includes") {
    Write-Host "Fixing JS at index 1583..."
    $c[1583] = "                const sec4Header = Array.from(document.querySelectorAll('.sec-title')).find(el => el.innerText.includes('第四节'));"
}

$c | Set-Content $path -Encoding UTF8
Write-Host "Repairs complete."
