// test_cross_repulse.js - 验证跨层阻击逻辑
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'project', 'functions.js');
let content = fs.readFileSync(file, 'utf8');

// 检查1：跨层阻击段是否存在移动逻辑
const hasMoveLogic = content.includes('// 移动：计算怪物被推后跨面出现在当前层的哪个位置');
console.log('[检查1] 跨层阻击移动逻辑:', hasMoveLogic ? '✅ 存在' : '❌ 缺失');

// 检查2：repulse[rk] 写入是否包含 srcF, floorId, step.x, step.y
const hasRepulseWrite = content.includes('repulse[rk] = (repulse[rk] || []).concat(');
console.log('[检查2] repulse[] 写入代码:', hasRepulseWrite ? '✅ 存在' : '❌ 缺失');

// 检查3：_checkBlock_repulse 里是否有跨层搬运+推格逻辑
const controlFile = path.join(__dirname, 'libs', 'control.js');
let controlContent = fs.readFileSync(controlFile, 'utf8');

// 检查3a：是否有 srcFloor 判断（跨层识别）
const hasCrossLayerCheck = controlContent.includes("typeof t[4] === 'string'");
console.log('[检查3a] _checkBlock_repulse 跨层识别:', hasCrossLayerCheck ? '✅ 存在' : '❌ 缺失');

// 检查3b：是否有怪物搬运逻辑（sm.map -> dm.map）
const hasMoveLogic = controlContent.includes('dm.map[destY][destX] = val;') || 
                       controlContent.includes('dm.map[destY][destX] = val;');
console.log('[检查3b] 怪物跨层搬运逻辑:', hasMoveLogic ? '✅ 存在' : '❌ 缺失');

// 检查3c：是否有推格逻辑（moveDir 计算）
const hasPushLogic = controlContent.includes('var moveDir = rdir;') || 
                      controlContent.includes('var nextX = destX + core.utils.scan[moveDir].x;');
console.log('[检查3c] 怪物推格逻辑:', hasPushLogic ? '✅ 存在' : '❌ 缺失');

// 检查4：语法错误扫描
const syntaxErrors = [];
// 检查是否有不平衡的括号
let braceCount = 0;
let bracketCount = 0;
for (let i = 0; i < controlContent.length; i++) {
    if (controlContent[i] === '{') braceCount++;
    if (controlContent[i] === '}') braceCount--;
    if (controlContent[i] === '[') bracketCount++;
    if (controlContent[i] === ']') bracketCount--;
}
if (braceCount !== 0) syntaxErrors.push(`花括号不平衡: ${braceCount}`);
if (bracketCount !== 0) syntaxErrors.push(`方括号不平衡: ${bracketCount}`);

console.log('\n[检查4] 语法平衡检查:');
if (syntaxErrors.length > 0) {
    syntaxErrors.forEach(e => console.log('  ❌', e));
} else {
    console.log('  ✅ 括号平衡正常');
}

// 输出总结
console.log('\n===== 总结 =====');
if (hasMoveLogic && hasRepulseWrite && hasCrossLayerCheck && hasMoveLogic && hasPushLogic && syntaxErrors.length === 0) {
    console.log('✅ 跨层阻击逻辑完整，可以测试！');
} else {
    console.log('❌ 还有缺失的逻辑，请检查上方 ❌ 项');
}
