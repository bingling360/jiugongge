import { describe, it, expect, beforeEach } from 'vitest';
import { createUtils } from './setup';

describe('utils', () => {
  let u;
  beforeEach(() => { u = createUtils(); });

  it('setTwoDigits', () => { expect(u.setTwoDigits(5)).toBe('05'); expect(u.setTwoDigits(12)).toBe(12); });
  it('formatSize', () => { expect(u.formatSize(0)).toBe('0B'); expect(u.formatSize(1024)).toBe('1.00KB'); });
  it('formatBigNumber', () => { expect(u.formatBigNumber(10000)).toBe('1w'); expect(u.formatBigNumber(100000000)).toBe('1e'); });
  it('clamp', () => { expect(u.clamp(5,0,10)).toBe(5); expect(u.clamp(-5,0,10)).toBe(0); });
  it('isset', () => { expect(u.isset(0)).toBe(true); expect(u.isset(null)).toBe(false); expect(u.isset(NaN)).toBe(false); });
  it('strlen', () => { expect(u.strlen('abc')).toBe(3); expect(u.strlen('中文')).toBe(4); });
  it('parseSpecial', () => { expect(u.parseSpecial([1,2,0,1])).toEqual([1,2]); expect(u.parseSpecial(5)).toEqual([5]); });
  it('deepEqual', () => { expect(u.deepEqual({a:1},{a:1})).toBe(true); expect(u.deepEqual([1,2],[1,3])).toBe(false); });
  it('arrayToRGB', () => { expect(u.arrayToRGB([255,0,0])).toBe('#ff0000'); });
  it('arrayToRGBA', () => { expect(u.arrayToRGBA([255,0,0,1])).toBe('rgba(255,0,0,1)'); });
});