# -*- coding: utf-8 -*-
# 修复跨层阻击：在伤害之后补上移动逻辑
import re

filepath = r'd:\立方体\mota-js\project\functions.js'

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 定位跨层阻击段（在激光段之后，捕捉段之前）
# 当前状态：注释已改为"阻击（伤害+移动）"，但代码只有伤害部分
old_marker = '// 阻击（伤害+移动）'
idx = content.find(old_marker)
if idx < 0:
    print("未找到标记 // 阻击（伤害+移动）")
    # 尝试找其他标记
    for m in ['// 阻击伤害', 'no_repulse']:
        i = content.find(m)
        if i >= 0:
            print(f"找到相关标记 '{m}' 位置: {i}")
    exit(1)

print(f"找到标记位置: {idx}")

# 找到这段代码块的结束位置（下一个 '}' 或 '// 捕捉'）
# 当前代码块结构：
#   // 阻击（伤害+移动）
#   if (core.hasSpecial(se.special, 18) ...) {
#       var rs = ...;
#       for (var rd in rs) {
#           var rp = ...;
#           if (rp && rp.floorId == floorId) {
#               var rk = ...;
#               damage[rk] = ...;
#               type[rk] = ...;
#               type[rk]["阻击伤害"] = true;
#           }
#       }
#   }
# 需要找到最外层 if 的结束 '}'

# 用简单方法：找到标记后，找接下来的 '// 捕捉' 或 '// 领域' 作为结束
rest = content[idx:]
# 找下一个顶级块注释（// ...）
# 跨层处理段中，阻击之后是 '// 阻击伤害（仅伤害）' 已经改了
# 实际文件中，阻击段之后应该是 '// 捕捉' 或 '}' 
# 从 idx 开始，找到 '// 捕捉' 的位置
catch_idx = rest.find('// 捕捉')
if catch_idx < 0:
    # 尝试找 '// 领域'（本层处理部分）
    catch_idx = rest.find('// 领域')
if catch_idx < 0:
    print("无法定位阻击段结束位置")
    exit(1)

block_end = idx + catch_idx
print(f"阻击段结束位置: {block_end}")
print(f"阻击段内容（前500字）:\n{rest[:500]}")

# 现在构造新的阻击段代码
# 注意缩进：文件用 \t（Tab）缩进，每一级一个 Tab
new_block = """\t\t\t\t// 阻击（伤害+移动）
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
\t\t\t\t\t\t\t\t\tsrcF,
\t\t\t\t\t\t\t\t\tfloorId,
\t\t\t\t\t\t\t\t\tstep.x, step.y
\t\t\t\t\t\t\t\t]);
\t\t\t\t\t\t\t}
\t\t\t\t\t\t}
\t\t\t\t\t}
\t\t\t\t}"""

# 替换：从 idx 到 block_end
new_content = content[:idx] + new_block + content[block_end:]

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("替换成功！")
print(f"写入字节数: {len(new_content)}")
