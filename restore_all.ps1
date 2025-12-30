
$path = "e:\antigravity\stonecalc\stone_web\index.html"
$c = Get-Content $path -Raw -Encoding UTF8

# Helper for sidebar replacements
$c = $c -replace 'HISTORY \(.*?\)', 'HISTORY (历史记录)' `
    -replace 'BOLT CONFIG \(.*?\)', 'BOLT CONFIG (背栓配置)' `
    -replace 'HANGER MECHANICS \(.*?\)', 'HANGER MECHANICS (挂件详参)' `
    -replace 'FORCE ARMS \(.*?\)', 'FORCE ARMS (力臂参数)' `
    -replace 'SECTION PROPS \(.*?\)', 'SECTION PROPS (截面参数)' `
    -replace 'TRANSVERSE BEAM \(.*?\)', 'TRANSVERSE BEAM (横梁)' `
    -replace '6. ANCHOR \(.*?\)', '6. ANCHOR (埋件)' `
    -replace 'Back Bolt \(.*?\)', 'Back Bolt (背栓)' `
    -replace 'Kerf \(.*?\)', 'Kerf (短槽)'

# Header
# Replace the garbage subtitle xxxx...
$c = $c -replace 'margin-top:5px;">xxxx.*?</div>', 'margin-top:5px;">xxxx石材幕墙计算书(Project Calc)</div>'

# Section Headers (Targeting the div.sec-title which usually precedes SECTION X)
# We can't easily regex "preceding" line, but we can match the garbage text if unique enough.
# Or we match known garbage patterns seen in view_file: '绗竴鑺? -> 第一节
$c = $c -replace '绗竴鑺.*?(?=<)', '第一节 系统说明' `
    -replace '绗簩鑺.*?(?=<)', '第二节 幕墙荷载说明' `
    -replace 'LOAD ANALYSIS \(.*?\)', 'LOAD ANALYSIS (荷载分析)'

# Icons
# 鉁? -> ✓ (Check)
# 鈻? -> ▼ (Down Arrow)
# 馃彚 -> 📐 (App Icon, maybe?)
$c = $c -replace '鉁\?', '✓' `
    -replace '鈻\?', '▼' `
    -replace '馃彚', '📐'

# Result Labels (Context based)
# We match "<div class="header-label">GARBAGE Gk</div>"
$c = $c -replace '(?<=class="header-label">).*?(?= Gk</div>)', '石材面板自重标准值' `
    -replace '(?<=class="header-label">).*?(?= Gd</div>)', '石材面板自重设计值' `
    -replace '(?<=class="header-label">).*?(?= GGK</div>)', '综合重力荷载标准值' `
    -replace '(?<=class="header-label">).*?(?= qEk</div>)', '地震作用标准值' `
    -replace '(?<=class="header-label">).*?(?= qE</div>)', '地震作用设计值' 

# Fix Section 4/5/6 if accessible
# If specific patterns appear for Section 4 title, replace them.
# I'll rely on the SECTION X subtitle to anchor updates if needed, but for now this covers the main ones.

$c | Set-Content $path -Encoding UTF8
Write-Host "Restoration complete."
