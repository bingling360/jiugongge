import { describe, it, expect, beforeEach } from 'vitest';
import { createIcons } from './setup';

describe('icons', () => {
  let ic;
  beforeEach(() => {
    ic = createIcons();
    ic.icons = { hero:{down:'d',left:'l',right:'r'}, terrains:{1:'w'}, enemys:{e:'en'} };
    global.core.material.icons = ic.icons;
  });

  it('getClsFromId', () => { expect(ic.getClsFromId('e')).toBe('enemys'); expect(ic.getClsFromId('x')).toBe(null); });
  it('_getAnimateFrames', () => { expect(ic._getAnimateFrames('enemys')).toBe(2); expect(ic._getAnimateFrames('terrains')).toBe(1); });
});