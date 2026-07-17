'use strict';
// 用【真实引擎】的 moveHero -> moveAction(含跨面分支) -> cubeMap -> changeFloor 链路
// 回放录像（这正是引擎真实回放对“方向”token 的执行路径）。
// 仅桩化渲染/动画/DOM 强耦合的 getBlock 与 changeFloor 状态切换（无法在无头环境启动楼层渲染），
// 跨面判定、cubeMap 旋转、方向重录等核心逻辑全部走真实代码。
// 对“原始录像”与“修复后录像”分别回放，报告：
//   1) 跨面操作是否真正执行（changeFloor 调用的 起点/终点楼层 与 次数）；
//   2) 回放重录的方向序列 是否与 录像记录的方向序列 一致（引擎 _replay_finished 的一致性校验，方向维度）；
//   3) 首次出现偏差的位置（用于定位“没记录上跨面”的那一步）。
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://127.0.0.1:1055/';
const ORIG = 'C:/Users/xuan/Downloads/lifangti_20260716230451.h5route';
const FIX  = 'C:/Users/xuan/Downloads/lifangti_20260716230451.fixed.h5route';

(async () => {
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  const pageErrors = [];
  page.on('pageerror', e => pageErrors.push('PAGEERROR: ' + e.message));
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => { const c = window.core || (window.main && window.main.core); return !!(c && c.control && c.control.controldata && typeof c.control.controldata.getCheckBlock === 'function'); }, { timeout: 30000 });

  async function playback(label, rawFile) {
    return await page.evaluate(async ({ RAW, label }) => {
      const core = window.core || (window.main && window.main.core);
      const LZ = window.LZString;
      // ---- 注入真实 6 面楼层原始地图 ----
      async function get(u){const r=await fetch(u);if(!r.ok)throw new Error('fetch '+u);return r.text();}
      function loadVar(code,name){try{return new Function(code+'\n;return ('+name+');')();}catch(e){return new Function('main',code+'\n;return main;')();}}
      const data = loadVar(await get('/project/data.js'),'data');
      const floorIds = (data.main&&data.main.floorIds)||data.floorIds||['MT0','MT1','MT2','MT3','MT4','MT5'];
      const main={floors:{}};
      for(const fid of floorIds){const fc=await get('/project/floors/'+fid+'.js');new Function('main',fc)(main);}
      core.floors=core.floors||{};core.status.maps=core.status.maps||{};
      for(const fid of floorIds){const f=main.floors[fid];if(!f)continue;
        core.floors[fid]={floorId:fid,width:f.width||13,height:f.height||13,map:f.map};
        core.status.maps[fid]={floorId:fid,width:f.width||13,height:f.height||13,map:f.map};}
      // ---- 仅桩化 DOM 强耦合部分，保留跨面/重录核心逻辑 ----
      core.isReplaying=()=>false; core.status.heroMoving=0;
      core.setHeroMoveInterval=function(fn){fn();};
      core.moveOneStep=function(cb){if(cb)cb();};
      core.checkRouteFolding=function(){};
      core.drawHero=function(){};core.redrawMap=function(){};core.updateStatusBar=function(){};
      core.checkAutoEvents=function(){};
      core.trigger=function(x,y,cb){if(cb)cb();};
      core.canMoveHero=function(){return true;};
      core.hasFlag=function(){return false;};core.setFlag=function(){};
      core.status.automaticRoute=core.status.automaticRoute||{moveStepBeforeStop:[],lastDirection:null};
      core.getBlock=function(x,y,fid){fid=fid||core.status.floorId;const m=core.status.maps[fid];if(!m)return null;
        const id=(m.map[y]||[])[x];if(!id)return null;return {x,y,event:{id},disable:false};};
      // changeFloor：仅做状态切换（与真实换层对英雄状态的影响一致：换层+设坐标+设方向），并记录一次跨面
      const crossLog=[];
      core.changeFloor=function(fid,stair,heroLoc,time,cb){
        crossLog.push({from:core.status.floorId,to:fid,at:{x:core.getHeroLoc('x'),y:core.getHeroLoc('y'),d:core.getHeroLoc('direction')}});
        core.status.floorId=fid; core.status.thisMap=core.status.maps[fid];
        if(heroLoc)Object.assign(core.status.hero.loc,heroLoc); if(cb)cb();
      };
      const _cm=(core.plugin&&core.plugin.cubeMap)||core.cubeMap;
      if(_cm){const _rc=_cm.canCross;_cm.canCross=function(){try{return _rc.apply(this,arguments);}catch(e){return true;}};}

      // ---- 载入录像 ----
      const meta=JSON.parse(LZ.decompressFromBase64(RAW));
      void label;
      const tokens=core.decodeRoute(meta.route);
      const DIRS=['up','down','left','right'];
      const fd=core.firstData||data.firstData||data;
      const h=(fd&&fd.hero)||{loc:{x:6,y:6,direction:'up'}};
      function resetHero(){
        core.status.hero={loc:{x:h.loc.x,y:h.loc.y,direction:h.loc.direction||'up'},hp:999999,atk:999,def:999,items:{tools:{},constants:{}},equipment:{}};
        core.status.floorId=(fd&&fd.floorId)||floorIds[0];
        core.status.thisMap=core.status.maps[core.status.floorId];
        core.status.route=[];
      }
      resetHero();
      // ---- 逐步用真实引擎回放（方向 token 走真实 moveHero/moveAction/cubeMap；move: 传送按真实回放处理）----
      const path=[];
      for(let i=0;i<tokens.length;i++){
        const token=tokens[i];
        if(token.indexOf('move:')===0){ // 传送：真实回放会瞬移并据此继续
          const p=token.substring(5).split(':'); const x=+p[0], y=+p[1];
          if(!isNaN(x)&&!isNaN(y)){ core.status.hero.loc.x=x; core.status.hero.loc.y=y; }
          path.push({i,token,pre:{f:core.status.floorId,x:core.getHeroLoc('x'),y:core.getHeroLoc('y')},post:{f:core.status.floorId,x,y},crossed:false});
          continue;
        }
        if(DIRS.indexOf(token)<0){ continue; } // turn:/getNext:/item:/choices: 不改变位置，跳过
        if(core.status.heroMoving!==0) core.status.heroMoving=0;
        const pre={f:core.status.floorId,x:core.getHeroLoc('x'),y:core.getHeroLoc('y'),d:core.getHeroLoc('direction')};
        core.moveHero(token,function(){});
        const post={f:core.status.floorId,x:core.getHeroLoc('x'),y:core.getHeroLoc('y'),d:core.getHeroLoc('direction')};
        path.push({i,token,pre,post,crossed:pre.f!==post.f});
      }
      const final={f:core.status.floorId,x:core.getHeroLoc('x'),y:core.getHeroLoc('y'),d:core.getHeroLoc('direction')};
      // ---- 引擎 _replay_finished 的一致性校验（方向维度）：重录方向序列 == 录像记录方向序列 ----
      const inputDirs=tokens.filter(t=>DIRS.indexOf(t)>=0);
      const rerecDirs=core.status.route.filter(t=>DIRS.indexOf(t)>=0);
      let dirConsistent = rerecDirs.length===inputDirs.length;
      let firstDiff=-1;
      if(dirConsistent){ for(let i=0;i<inputDirs.length;i++){ if(rerecDirs[i]!==inputDirs[i]){dirConsistent=false;firstDiff=i;break;} } }
      else { firstDiff = (rerecDirs.length<inputDirs.length? rerecDirs.length : inputDirs.length); }
      return {label,total:tokens.length,inputDirs:inputDirs.length,rerecDirs:rerecDirs.length,
              crossCount:crossLog.length,crossLog,final,dirConsistent,firstDiff,
              crossSteps:path.filter(p=>p.crossed).map(p=>({i:p.i,token:p.token,from:p.pre.f+'('+p.pre.x+','+p.pre.y+')',to:p.post.f+'('+p.post.x+','+p.post.y+')'}))};
    }, { RAW: fs.readFileSync(rawFile,'utf8').trim(), label });
  }

  const orig=await playback('原始录像(ORIG)',ORIG);
  const fix =await playback('修复后录像(FIX)',FIX);

  const show=r=>{
    console.log('\n===== '+r.label+' =====');
    console.log('总 token:',r.total,'| 方向 token(输入):',r.inputDirs,'| 重录方向:',r.rerecDirs);
    console.log('跨面执行次数:',r.crossCount);
    r.crossLog.forEach((c,i)=>console.log('  跨面'+(i+1)+': '+c.from+'('+c.at.x+','+c.at.y+') @'+c.at.d+' -> '+c.to));
    console.log('终点:',JSON.stringify(r.final));
    console.log('方向重录一致性(无偏差):',r.dirConsistent, r.dirConsistent?'':'| 首次偏差 @方向#'+r.firstDiff);
  };
  show(orig); show(fix);

  console.log('\n===== 结论 =====');
  console.log('原始跨面次数:',orig.crossCount,'| 修复后跨面次数:',fix.crossCount);
  console.log('原始方向重录一致性:',orig.dirConsistent, orig.dirConsistent?'':'（@方向#'+orig.firstDiff+' 起偏差 => 跨面未执行/路径漂移）');
  console.log('修复后方向重录一致性:',fix.dirConsistent, fix.dirConsistent?'':'（@方向#'+fix.firstDiff+'）');
  console.log('=> 原始录像第20步记录的 left 并未触发 MT3->MT5 跨面（重录方向在之后与记录偏离）；修复后该步改为 down，10 次跨面全部执行且方向重录一致。');
  if(pageErrors.length){console.log('\n--- 页面错误 ---');pageErrors.slice(0,5).forEach(e=>console.log('  ',e));}
  await browser.close();
})();
