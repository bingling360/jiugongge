import { describe, it, expect, beforeEach } from 'vitest';
import { createActions } from './setup';

describe('actions', () => {
  let a;
  beforeEach(() => {
    a = createActions();
    global.core.doFunc = (f,c,...args)=>f.apply(c,args);
  });

  it('registerAction', () => {
    const f=()=>{}; a.registerAction('keyDown','test',f,50);
    expect(a.actions.keyDown[0].name).toBe('test');
  });
  it('unregisterAction', () => {
    a.registerAction('keyDown','t',()=>{}); a.unregisterAction('keyDown','t');
    expect(a.actions.keyDown.length).toBe(0);
  });
  it('priority sort', () => {
    a.registerAction('keyDown','low',()=>{},10); a.registerAction('keyDown','high',()=>{},100);
    expect(a.actions.keyDown[0].name).toBe('high');
  });
});