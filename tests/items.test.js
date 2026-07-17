import { describe, it, expect, beforeEach } from 'vitest';
import { createItems } from './setup';

describe('items', () => {
  let i;
  beforeEach(() => {
    i = createItems();
    global.core.material.items = { t:{id:'t',cls:'tools'}, c:{id:'c',cls:'constants'} };
    global.core.status.hero.items = { tools:{t:5}, constants:{c:1} };
  });

  it('hasItem', () => { expect(i.hasItem('t')).toBe(true); expect(i.hasItem('c')).toBe(true); expect(i.hasItem('x')).toBe(false); });
  it('itemCount', () => { expect(i.itemCount('t')).toBe(5); expect(i.itemCount('x')).toBe(0); });
});