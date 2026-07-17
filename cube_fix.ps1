# cube_fix.ps1 - fix cross-floor repulse
$file = $PSScriptRoot + "\project\functions.js"
$enc = [System.Text.Encoding]::UTF8
$raw = [System.IO.File]::ReadAllBytes($file)

# Use string replacement (simpler than byte replacement)
$content = $enc.GetString($raw)

# Old string: cross-floor repulse, damage only, no movement
$oldStr = "`t`t`t`t`tif (rp && rp.floorId == floorId) {`r`n`t`t`t`t`tvar rk = rp.x + `",`" + rp.y;`r`n`t`t`t`t`t// damage`r`n`t`t`t`t`tdamage[rk] = (damage[rk] || 0) + (se.repulse || 0);`r`n`t`t`t`t`ttype[rk] = type[rk] || {};`r`n`t`t`t`t`ttype[rk][`"repulse_damage`"] = true;`r`n`t`t`t`t}"

Write-Host "Old string found:" ($content.Contains($oldStr))

if ($content.Contains($oldStr)) {
    # New string: damage + movement
    $newStr = "`t`t`t`t`tif (rp && rp.floorId == floorId) {`r`n" +
               "`t`t`t`t`tvar rk = rp.x + `",`" + rp.y;`r`n" +
               "`t`t`t`t`t// damage`r`n" +
               "`t`t`t`t`tdamage[rk] = (damage[rk] || 0) + (se.repulse || 0);`r`n" +
               "`t`t`t`t`ttype[rk] = type[rk] || {};`r`n" +
               "`t`t`t`t`ttype[rk][`"repulse_damage`"] = true;`r`n" +
               "`r`n" +
               "`t`t`t`t`t// movement: calculate where monster appears on current floor`r`n" +
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
    Write-Host "Replacement done! File size:" $raw.Length "->" $enc.GetByteCount($newContent)
} else {
    Write-Host "NOT FOUND - debug info:"
    $idx = $content.IndexOf("repulse || 0")
    if ($idx -ge 0) {
        Write-Host "Found 'repulse || 0' at index $idx"
        Write-Host $content.Substring($idx - 300, 600)
    } else {
        Write-Host "Did not find 'repulse || 0'"
    }
}
