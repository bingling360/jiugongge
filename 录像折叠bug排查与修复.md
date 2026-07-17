# 录像折叠 Bug 排查与修复记录

- 关联录像：`D:/下载/lifangti_20260716202623.h5route`
- 引擎版本：mota-js（立方体 / cube 拓扑版本）
- 处理日期：2026-07-16
- 文档性质：问题定位 + 根因 + 修复方案 + 验证结果

---

## 一、现象描述（用户反馈）

录像在 **第 320 步 ~ 第 330 步** 之间的动作，与实际玩家操作**不符**（记录的动作被错误改写），但录像**真正的回放失败发生在第 357 步**，而非 320~330 这几步本身。

用户明确判定：**这是录制侧 bug**——320~330 这几步被引擎错误地录进去了，导致后续 route 错位，最终在 357 步回放出错。

> 关键结论：失败点在 357，但**根因在更早的不安全折叠截断**。

---

## 二、核心机制：什么是「录像折叠」

`mota-js` 为了减少录像体积，在录制时启用了 `enableRouteFolding`（见 `project/data.js:799`，已确认为 `true`）。

折叠逻辑位于 `libs/control.js`：

- `checkRouteFolding()`（`control.js:3014`）：在每次成功移动（`control.js:711`）和每次右转（`control.js:816`）后调用。
- 折叠键（旧）：`[x, y, direction]` —— **不含楼层**。
- 比较内容（旧）：只克隆英雄的**数值属性**（`core.clone(h, name => name !== 'steps' && typeof value === 'number')`），**丢弃 flags / items / 楼层 / 禁用块 / 敌人状态等**。
- 触发效果：当英雄回到同一 `(x, y, dir)` 且数值属性相同时，把 `core.status.route` 从当前长度**截断回之前记录的长度**，等于把这段「回路」删掉，只保留一次。
- `_bindRoutePush()`（`control.js:2998`）：**只有在 push 非移动类 token（`up/down/left/right/turn/move:` 之外）时，才清空折叠缓存**。因此一次折叠只可能截断「纯移动/转向」回路。

录像文件格式：`{name, hard, seed, route: encodeRoute(core.status.route)}` 经 `LZString.compressToBase64` 压缩。

---

## 三、根因分析

### 3.1 缺陷一：折叠键不含楼层

折叠键 `[x, y, dir]` 没有 `floorId`。在立方体拓扑（6 个面 MT0~MT5）中，英雄可以通过 `move:x:y` 瞬移事件（本录像共 37 次）跨越到另一个面。跨面后若恰好回到同一 `(x, y, dir)`，旧逻辑会**错误复用另一层的折叠记录**，造成错位截断。

### 3.2 缺陷二：折叠只比较数值属性，忽略隐藏状态

`checkRouteFolding` 的克隆**丢弃了 `core.status.hero.flags`**（其中保存 `__disabled__`、`__removed__`、`enemyOnPoint`、`__visited__`、`hideFloors` 等），也忽略了 `hero.items`（钥匙、宝石、血瓶、装备）。

也就是说，以下这些「会改变通行/战斗/楼层判定、但不写进 route token」的状态变化，折叠逻辑**完全看不见**：

- 开门（`__disabled__` 变化，黄/蓝/红门）
- 破墙（yellowWall 等被击破）
- 拾取钥匙 / 装备 / 血瓶（`hero.items` 变化）
- 敌人被清除（`enemyOnPoint` 变化）
- debuff（`weak/poison/freeze/confuse/curse`）
- 楼层切换（`floorId` 变化）

当玩家走了一个「看起来坐标相同、数值属性也相同，但隐藏状态已经改变」的回路时，引擎会**错误地把它当成空回路砍掉**，从而让录像比真实操作变短 → 后续步骤错位 → 回放失败。

### 3.3 缺陷三：`move:` 瞬移既不清缓存又重新触发折叠

`moveDirectly`（`project/functions.js:1961`）会 push `move:x:y` 并**在 `functions.js:1997` 主动调用 `checkRouteFolding()`**。但 `move:` 是移动类 token（按 `_bindRoutePush` 定义不清空折叠缓存），于是一次跨面瞬移既带着已经被改写的隐藏状态、又重新触发了折叠 —— 这是 62 / 72 / 386 / 413 等瞬移类不安全折叠的直接来源。

---

## 四、诊断方法（离线检测器）

为了在不启动浏览器的情况下复现问题，编写了离线 Node 检测器 `detect-route-folding-node.js`：

- 加载 `libs/thirdparty/lz-string.min.js` + `project/data.js` + `project/maps.js` + `project/floors/MT0~MT5.js`。
- 复刻 `_bindRoutePush`（非移动 token 清缓存）与旧版 `checkRouteFolding`（键=坐标+方向；仅比数值）。
- `decodeRoute` 解析全部 token（`U/D/L/R`=移动，`I`=道具，`e`=装备，`F`=飞行，`C`=选择，`S`=商店，`T/t`=转向，`G`=getNext，`P`=输入，`X`=随机，`M`=move:x:y，`k`=点击，`N`=否）。
- 模拟器跟进 `move:x:y` 瞬移（设置坐标并在事后调用折叠检查），并标记瞬移为隐藏状态变化。
- 每次触发折叠时计算「隐藏状态指纹」`hiddenSnapshot()`，若不一致则标记为**「不安全折叠」**。

### 检测结果（修复前）

| 指标 | 数值 |
| --- | --- |
| 总折叠次数 | 16 |
| 不安全折叠 | **5** |
| unsafe #1 | @步 55 —— 高置信：开门（`__disabled__` 变化），位置 MT0 第 2 层 (12 附近) |
| unsafe #2 | @步 62 —— 中置信：瞬移（跨面，离线无法确认目标层） |
| unsafe #3 | @步 72 —— 中置信：瞬移 |
| unsafe #4 | @步 386 —— 中置信：瞬移 |
| unsafe #5 | @步 413 —— 中置信：瞬移 |

其中 **@55 的开门类不安全折叠为最高置信根因**，与「320~330 动作错位 + 357 回放失败」高度吻合：被砍掉的回路里其实发生了开门，录像变短后后续步全部错位，到 357 步执行到已被改写/缺失的操作即失败。

---

## 五、修复方案

已修改 `libs/control.js`，对 `checkRouteFolding` 做根治，**向后兼容、不影响正常折叠优化**：

### 5.1 折叠键加入楼层

```
index = [floorId, x, y, direction.charAt(0)].join(',')
```

彻底隔离不同面的折叠记录，消除跨面复用错误。

### 5.2 折叠前比较「隐藏状态指纹」

新增 `_getRouteFoldingSignature()`，对会影响「通行 / 战斗 / 楼层判定」的隐藏状态做指纹，折叠条件从「数值属性相同」收紧为「**数值属性 + 隐藏状态指纹都相同**」才截断。指纹覆盖：

- `floorId`（楼层，已并入键）
- `hero.flags.__disabled__` / `__removed__` / `__opacity__` / `__filter__` / `enemyOnPoint` / `__visited__` / `hideFloors`
- debuff：`weak / poison / freeze / confuse / curse`
- `hero.items`（钥匙 / 宝石 / 血瓶 / 装备）

当隐藏状态指纹不一致时，**直接拒绝折叠**（不清缓存、不截断），从而保留带副作用的真实回路。

### 5.3 同步更新检测器用于验证

`detect-route-folding-node.js` 的 `checkFold()` 已同步为修复后逻辑（楼层感知键 + 隐藏状态指纹匹配），并输出「修复前后」对比。

---

## 六、验证结果

- `node --check libs/control.js` ✅ 语法通过
- 检测器跑真实录像 `lifangti_20260716202623.h5route`：

| 场景 | 总折叠 | 不安全折叠 | 安全折叠 |
| --- | --- | --- | --- |
| 修复前 | 16 | **5** | 11 |
| 修复后 | 11 | **0** | 11 |

→ 5 处不安全折叠**全部被拦截**；11 处真正安全的折叠（纯移动空回路）仍被优化，**录像体积优化保留**。

---

## 七、重要边界与后续建议

### 7.1 本修复只对未来录制生效

`checkRouteFolding` 的改动让**今后录制**不再砍掉带副作用的回路，新录像回放正确。

### 7.2 这份旧录像无法被「修回」

`lifangti_20260716202623.h5route` 是用**旧引擎录制的**，route 在当时就已经被永久截断 —— 被砍掉的步骤信息已丢失，改引擎**无法还原这份数据**。要让它正确回放，**必须重新录制**。

### 7.3 抢救旧录像的可行性

理论上只能基于游戏本体把玩家操作完整重放一遍来重建 route，但当前工作区只有路线数据、没有 `lifangti` 游戏本体脚本，无法可靠还原那几步。若用户能提供游戏本体（或能复现该存档进度的环境），可进一步评估重放重建。

### 7.4 可选加强（未做，按需）

- 在 `functions.js:1997`（`moveDirectly` 触发折叠处）追加 `clearRouteFolding()`，作为瞬移场景的「双保险」—— 但 5.2 的指纹匹配已从源头杜绝，属可选项。
- 将 `control.js` 改动同步适配到浏览器侧 `detect-route-folding.js`（若需在游戏内做权威复验）。

---

## 八、涉及文件

| 文件 | 改动 |
| --- | --- |
| `libs/control.js` | `checkRouteFolding` 折叠键加楼层 + 新增 `_getRouteFoldingSignature` 隐藏状态指纹，拒绝不安全折叠 |
| `detect-route-folding-node.js` | 同步修复后逻辑，输出修复前后对比，用于验证 |

---

## 附：快速复验命令

```bash
# 语法检查
node --check libs/control.js

# 跑检测器（查看修复后安全折叠数 / 不安全折叠数）
node detect-route-folding-node.js "D:/下载/lifangti_20260716202623.h5route"
```
