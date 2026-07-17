# fix_cross_repulse.ps1 - 修复跨层阻击，补上移动逻辑
$file = Join-Path $PSScriptRoot "project\functions.js"
$raw = [System.IO.File]::ReadAllBytes($file)

# 旧代码：只有伤害，没有移动
$old = @(
    0x09,0x09,0x09,0x09,                    # 4 Tabs
    0x69,0x66,0x28,0x72,0x70,0x20,0x26,0x26,0x20,0x72,0x70,0x2e,0x66,0x6c,0x6f,0x6f,0x72,0x49,0x64,0x20,0x3d,0x3d,0x20,0x66,0x6c,0x6f,0x6f,0x72,0x49,0x64,0x29,0x20,0x7b,  # if (rp && rp.floorId == floorId) {
    0x0d,0x0a,
    0x09,0x09,0x09,0x09,0x09,                # 5 Tabs
    0x76,0x61,0x72,0x20,0x72,0x6b,0x20,0x3d,0x20,0x72,0x70,0x2e,0x78,0x20,0x2b,0x20,0x22,0x2c,0x22,0x20,0x2b,0x20,0x72,0x70,0x2e,0x79,0x3b,  # var rk = rp.x + "," + rp.y;
    0x0d,0x0a
)
# 这太复杂了，换个方式：用字符串 + 编码
$enc = [System.Text.Encoding]::UTF8

# 旧代码字符串（只有伤害，没有移动）
$oldStr = "`t`t`t`tif (rp && rp.floorId == floorId) {`r`n`t`t`t`t`tvar rk = rp.x + `",`" + rp.y;`r`n`t`t`t`t`tdamage[rk] = (damage[rk] || 0) + (se.repulse || 0);`r`n`t`t`t`t`ttype[rk] = type[rk] || {};`r`n`t`t`t`t`ttype[rk][`"阻击伤害`"] = true;`r`n`t`t`t`t}`r`n`t`t`t`t}"
Write-Host "旧代码长度: $($oldStr.Length)"

$content = $enc.GetString($raw)
$found = $content.IndexOf($oldStr)
Write-Host "找到旧代码: $($found -ge 0)"
if ($found -ge 0) {
    Write-Host "位置: $found"
    # 新代码：伤害 + 移动
    $newStr = "`t`t`t`tif (rp && rp.floorId == floorId) {`r`n" +
               "`t`t`t`t`tvar rk = rp.x + `",`" + rp.y;`r`n" +
               "`t`t`t`t`t// 伤害`r`n" +
               "`t`t`t`t`t`tdamage[rk] = (damage[rk] || 0) + (se.repulse || 0);`r`n" +
               "`t`t`t`t`t`ttype[rk] = type[rk] || {};`r`n" +
               "`t`t`t`t`t`ttype[rk][`"阻击伤害`"] = true;`r`n" +
               "`r`n" +
               "`t`t`t`t`t// 移动：计算怪物被推后跨面出现在当前层的哪个位置`r`n" +
               "`t`t`t`t`tvar rdir = core.turnDirection(`":back`", rd);`r`n" +
               "`t`t`t`t`tvar step = core.control.controldata.cubeStep(srcF, sb.x, sb.y, rdir);`r`n" +
               "`t`t`t`t`tif (step && step.floorId == floorId) {`r`n" +
               "`t`t`t`t`t`trepulse[rk] = (repulse[rk] || []).concat([`r`n" +
               "`t`t`t`t`t`t`t sb.x, sb.y, sb.event.id, rdir,`r`n" +
               "`t`t`t`t`t`t`t srcF, step.floorId, step.x, step.y`r`n" +
               "`t`t`t`t`t`t]);`r`n" +
               "`t`t`t`t`t`t}`r`n" +
               "`t`t`t`t`t}`r`n" +
               "`t`t`t`t}"
    $newContent = $content.Replace($oldStr, $newStr)
    [System.IO.File]::WriteAllText($file, $newContent, $enc)
    Write-Host "替换成功！"
} else {
    Write-Host "未找到旧代码，手动检查..."
    $idx = $content.IndexOf("阻击")
    if ($idx -ge 0) {
        Write-Host "找到'阻击'位置: $idx"
        Write-Host $content.Substring($idx, 800)
    }
}
