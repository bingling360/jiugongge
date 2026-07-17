import { describe, it, expect, beforeEach } from 'vitest';
import { createMaps } from './setup';

describe('maps', () => {
  let m;
  beforeEach(() => {
    m = createMaps();
    m.blocksInfo = { '1': {id:'w',cls:'terrains',noPass:true}, '10':{id:'e',cls:'enemys'} };
    global.core.icons = { getTilesetOffset:()=>null, _getAnimateFrames:c=>c.includes('enemy')?2:1 };
  });

  it('_getNumberById', () => { expect(m._getNumberById('w')).toBe(1); expect(m._getNumberById('none')).toBe(0); expect(m._getNumberById('airwall')).toBe(17); });
  it('initBlock terrain', () => { const b=m.initBlock(0,0,1,false); expect(b.event.noPass).toBe(true); });
  it('initBlock enemy', () => { const b=m.initBlock(0,0,10,true); expect(b.event.trigger).toBe('battle'); });
});