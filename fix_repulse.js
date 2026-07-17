// fix_repulse.js - 修复跨层阻击：补上移动逻辑
const fs = require('fs');
const path = require('path');

const file = 'd:\\立方体\\mota-js\\project\\functions.js';
let content = fs.readFileSync(file, 'utf8');

// 找到跨层阻击段的起始位置（激光段之后，捕捉段之前）
const marker = '\t\t\t\t// 阻击伤害（仅伤害）';
const newCode = `\t\t\t\t// 阻击（伤害+移动）
\t\t\t\tif (core.hasSpecial(se.special, 18) && !core.hasFlag('no_repulse')) {
\t\t\t\t\tvar rs = se.zoneSquare ? core.utils.scan2 : core.utils.scan;
\t\t\t\t\tfor (var rd in rs) {
\t\t\t\t\t\t// rd = 怪物面朝的方向（阻击推人的方向）
\t\t\t\t\t\t// 先算伤害位置：怪物面朝方向的邻格投影到当前层
\t\t\t\t\t\tvar rp = core.control.controldata.cubeProject(srcF, sb.x, sb.y, rs[rd].x, rs[rd].y);
\t\t\t\t\t\tif (rp && rp.floorId == floorId) {
\t\t\t\t\t\t\tvar rk = rp.x + "," + rp.y;
\t\t\t\t\t\t\t// 伤害
\t\t\t\t\t\t\tdamage[rk] = (damage[rk] || 0) + (se.repulse || 0);
\t\t\t\t\t\t\ttype[rk] = type[rk] || {};
\t\t\t\t\t\t\ttype[rk]["阻击伤害"] = true;

\t\t\t\t\t\t\t// 移动：计算怪物被推后跨面出现在当前层的哪个位置
\t\t\t\t\t\t\t// rdir = 玩家相对怪物的方向（即怪物推人的方向）
\t\t\t\t\t\t\tvar rdir = core.turnDirection(":back", rd);
\t\t\t\t\t\t\tvar step = core.control.controldata.cubeStep(srcF, sb.x, sb.y, rdir);
\t\t\t\t\t\t\tif (step && step.floorId == floorId) {
\t\t\t\t\t\t\t\t// 怪物跨面后出现在 step.x, step.y，然后向 rdir 方向推一步
\t\t\t\t\t\t\t\trepulse[rk] = (repulse[rk] || []).concat([
\t\t\t\t\t\t\t\t\tsb.x, sb.y, sb.event.id, rdir,
\t\t\t\t\t\t\t\t\tsrcF,      // 源楼层
\t\t\t\t\t\t\t\t\tfloorId,   // 目标楼层
\t\t\t\t\t\t\t\t\tstep.x, step.y  // 出现在当前层的位置
\t\t\t\t\t\t\t\t]);
\t\t\t\t\t\t\t}
\t\t\t\t\t\t}
\t\t\t\t\t}
\t\t\t\t}`;

if (content.includes(marker)) {
    content = content.replace(marker, newCode);
    fs.writeFileSync(file, content, 'utf8');
    console.log('替换成功！');
} else {
    console.log('未找到标记，手动检查...');
    // 尝试找类似内容
    const idx = content.indexOf('阻击伤害');
    console.log('找到"阻击伤害"位置：', idx);
    if (idx > 0) {
        console.log('上下文：', content.substring(idx - 100, idx + 200));
    }
}
