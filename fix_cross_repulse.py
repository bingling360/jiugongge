# -*- coding: utf-8 -*-
# 修复跨层阻击：在伤害之后补上移动逻辑
import codecs

filepath = r'd:\立方体\mota-js\project\functions.js'

with codecs.open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# 定位跨层阻击段
# 当前状态：只有伤害，没有移动
old = (
    '\t\t\t\t\t\tdamage[rk] = (damage[rk] || 0) + (se.repulse || 0);\n'
    '\t\t\t\t\t\ttype[rk] = type[rk] || {};\n'
    '\t\t\t\t\t\ttype[rk]["\u963b\u51fb\u4f24\u5bb3"] = true;\n'
    '\n'
    '\t\t\t\t\t}\n'
    '\t\t\t\t}'
)

new = (
    '\t\t\t\t\t\tdamage[rk] = (damage[rk] || 0) + (se.repulse || 0);\n'
    '\t\t\t\t\t\ttype[rk] = type[rk] || {};\n'
    '\t\t\t\t\t\ttype[rk]["\u963b\u51fb\u4f24\u5bb3"] = true;\n'
    '\n'
    '\t\t\t\t\t\t// \u79fb\u52a8\uff1a\u602a\u7269\u88ab\u63a8\u540e\u8de8\u9762\u51fa\u73b0\u5728\u5f53\u524d\u5c42\n'
    '\t\t\t\t\t\tvar rdir = core.turnDirection(":back", rd);\n'
    '\t\t\t\t\t\tvar step = core.control.controldata.cubeStep(srcF, sb.x, sb.y, rdir);\n'
    '\t\t\t\t\t\tif (step && step.floorId == floorId) {\n'
    '\t\t\t\t\t\t\trepulse[rk] = (repulse[rk] || []).concat([\n'
    '\t\t\t\t\t\t\t\tsb.x, sb.y, sb.event.id, rdir,\n'
    '\t\t\t\t\t\t\t\tsrcF, step.floorId, step.x, step.y\n'
    '\t\t\t\t\t\t\t]);\n'
    '\t\t\t\t\t\t}\n'
    '\t\t\t\t\t}\n'
    '\t\t\t\t}'
)

if old in content:
    content = content.replace(old, new)
    with codecs.open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    print('替换成功！')
else:
    print('未找到匹配内容')
    # 调试：找相似内容
    idx = content.find('damage[rk] = (damage[rk] || 0) + (se.repulse')
    if idx >= 0:
        print(f'找到伤害计算位置: {idx}')
        print(repr(content[idx:idx+200]))
    else:
        print('未找到伤害计算代码')
