import { describe, it, expect, beforeEach } from 'vitest';
import { createEnemys } from './setup';

describe('enemys', () => {
  let e;
  beforeEach(() => {
    global.core.material.enemys = { t: { id:'t', special:[1,2] }, n: { id:'n' } };
    e = createEnemys();
  });

  it('hasSpecial array', () => { expect(e.hasSpecial([1,2],1)).toBe(true); expect(e.hasSpecial([1,2],3)).toBe(false); });
  it('hasSpecial null', () => { expect(e.hasSpecial(null,1)).toBe(false); });
  it('hasSpecial by id', () => { expect(e.hasSpecial('t',1)).toBe(true); expect(e.hasSpecial('n',1)).toBe(false); });
});