# -*- coding: utf-8 -*-
import os

filepath = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'project', 'functions.js')

with open(filepath, 'rb') as f:
    raw = f.read()

# 旧代码字节（跨层阻击，只有伤害没有移动）
old_bytes = (
    b'\t\t\t\t\tif (rp && rp.floorId == floorId) {\r\n'
    b'\t\t\t\t\t\tvar rk = rp.x + "," + rp.y;\r\n'
    b'\t\t\t\t\t\tdamage[rk] = (damage[rk] || 0) + (se.repulse || 0);\r\n'
    b'\t\t\t\t\t\ttype[rk] = type[rk] || {};\r\n'
    b'\t\t\t\t\t\ttype[rk]["\xe6\x8b\xa6\xe5\x87\xbb\xe4\xbc\xa4\xe5\xae\xb3"] = true;\r\n'
    b'\r\n'
    b'\t\t\t\t\t}'
)

print(f"找到旧代码: {old_bytes in raw}")

if old_bytes in raw:
    # 新代码：伤害 + 移动
    new_bytes = (
        b'\t\t\t\t\tif (rp && rp.floorId == floorId) {\r\n'
        b'\t\t\t\t\t\tvar rk = rp.x + "," + rp.y;\r\n'
        b'\t\t\t\t\t\tdamage[rk] = (damage[rk] || 0) + (se.repulse || 0);\r\n'
        b'\t\t\t\t\t\ttype[rk] = type[rk] || {};\r\n'
        b'\t\t\t\t\t\ttype[rk]["\xe6\x8b\xa6\xe5\x87\xbb\xe4\xbc\xa4\xe5\xae\xb3"] = true;\r\n'
        b'\r\n'
        # 补上移动逻辑
        b'\t\t\t\t\t\t// \xe7\xa7\xbb\xe5\x8a\xa8\xef\xbc\x9a\xe8\xae\xa1\xe7\x89\xa9\xe8\xa2\xab\xe6\x8e\xa8\xe5\x90\x8e\xe8\xb7\xa8\xe9\x9d\xa2\xe5\x87\xba\xe7\x8e\xb0\xe5\xbd\x93\xe5\x89\x8d\xe5\xb1\x82\xe7\x9a\x84\xe5\x93\xaa\xe4\xb8\xaa\xe4\xbd\x8d\xe7\xbd\xae\r\n'
        b'\t\t\t\t\t\tvar rdir = core.turnDirection(":back", rd);\r\n'
        b'\t\t\t\t\t\tvar step = core.control.controldata.cubeStep(srcF, sb.x, sb.y, rdir);\r\n'
        b'\t\t\t\t\t\tif (step && step.floorId == floorId) {\r\n'
        b'\t\t\t\t\t\t\trepulse[rk] = (repulse[rk] || []).concat([\r\n'
        b'\t\t\t\t\t\t\t\tsb.x, sb.y, sb.event.id, rdir,\r\n'
        b'\t\t\t\t\t\t\t\tsrcF, step.floorId, step.x, step.y\r\n'
        b'\t\t\t\t\t\t\t]);\r\n'
        b'\t\t\t\t\t\t}\r\n'
        b'\r\n'
        b'\t\t\t\t\t}'
    )
    new_raw = raw.replace(old_bytes, new_bytes)
    with open(filepath, 'wb') as f:
        f.write(new_raw)
    print(f"替换成功！文件大小: {len(raw)} -> {len(new_raw)}")
else:
    print("未找到旧代码，打印周围内容用于调试...")
    # 尝试找 "repulse || 0" 的位置
    idx = raw.find(b'repulse || 0')
    if idx >= 0:
        print(f"找到 repulse || 0 位置: {idx}")
        print("上下文:", raw[max(0,idx-200):idx+200])
    else:
        print("未找到 repulse || 0")
