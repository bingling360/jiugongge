import { vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  global.core = {
    __SIZE__: 11,
    isset: v => v != null && !(typeof v === 'number' && isNaN(v)),
    clone: d => JSON.parse(JSON.stringify(d)),
    cloneArray: a => a.map(i => JSON.parse(JSON.stringify(i))),
    getFlag: vi.fn((k, d) => d || null),
    setFlag: vi.fn(),
    status: {
      hero: { hp: 100, atk: 10, def: 5, items: { tools: {}, constants: {} }, equipment: {} },
      floorId: 1, maps: {}, id2number: {}, number2Block: {}, event: { id: '' },
      globalAttribute: { equipName: ['weapon', 'armor', 'helmet', 'accessory'] },
    },
    flags: {},
    material: { enemys: {}, items: {}, images: {}, icons: {} },
    floors: { 1: { floorId: 1, width: 13, height: 13, map: [] } },
    isReplaying: vi.fn(() => false),
    updateStatusBar: vi.fn(), insertAction: vi.fn(), changeFloor: vi.fn(),
  };
  global.main = { mode: 'play', dom: {} };
  global.LZString = { compress: s => s, decompress: s => s };
  global.devicePixelRatio = 1;
});

afterEach(() => vi.clearAllMocks());

const fs = require('fs'), path = require('path');
const names = { '../libs/utils.js': 'utils', '../libs/enemys.js': 'enemys', '../libs/maps.js': 'maps', '../libs/items.js': 'items', '../libs/icons.js': 'icons', '../libs/actions.js': 'actions', '../libs/control.js': 'control' };

export function loadModule(p) {
  const code = fs.readFileSync(path.join(__dirname, p), 'utf-8');
  const n = names[p];
  return new (eval(`(function(){${code};return ${n};})()`));
}

export const createUtils = () => loadModule('../libs/utils.js');
export const createEnemys = () => loadModule('../libs/enemys.js');
export const createMaps = () => loadModule('../libs/maps.js');
export const createItems = () => loadModule('../libs/items.js');
export const createIcons = () => loadModule('../libs/icons.js');
export const createActions = () => loadModule('../libs/actions.js');
export const createControl = () => loadModule('../libs/control.js');