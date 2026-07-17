import re

with open('D:/立方体 - 副本/mota-js/cube-map-viewer.html', 'r', encoding='utf-8') as f:
    content = f.read()

m1 = re.search(r'var floorsData = JSON\.parse\(decodeURIComponent\("[^"]*"\)\)', content)
m2 = re.search(r'var BLOCK_COLORS = JSON\.parse\(decodeURIComponent\("[^"]*"\)\)', content)
if not m1 or not m2:
    print('ERROR: could not extract data')
    exit(1)

floors_line = m1.group(0)
colors_line = m2.group(0)

tpl = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>正方体地图 - 3D 地图查看器</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: 100%; height: 100%; overflow: hidden; background: #0a0a12; font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; color: #e0e0e0; }
  #app { display: flex; width: 100%; height: 100%; }
  #panel-left { width: 380px; min-width: 380px; display: flex; flex-direction: column; background: #111118; border-right: 1px solid #2a2a3a; }
  #panel-header { padding: 14px 20px 10px; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #1e1e2a; }
  #panel-header h2 { font-size: 12px; font-weight: 600; color: #555; letter-spacing: 2px; }
  #face-info { padding: 12px 20px 4px; display: flex; align-items: center; gap: 10px; }
  #face-name { font-size: 22px; font-weight: 700; color: #f0f0f0; transition: color 0.2s; }
  #face-id { font-size: 11px; color: #444; background: #14141e; padding: 1px 8px; border-radius: 3px; font-family: monospace; }
  #thumbnail-container { flex: 1; display: flex; align-items: center; justify-content: center; padding: 14px; position: relative; min-height: 0; }
  #thumbnail-canvas { border: 1px solid #222230; border-radius: 4px; image-rendering: pixelated; max-width: 100%; max-height: 100%; }
  #face-selector { padding: 8px 14px 10px; border-top: 1px solid #1a1a24; display: flex; gap: 4px; flex-wrap: wrap; background: #0c0c14; }
  .face-btn { flex: 1; min-width: 40px; padding: 4px 2px; font-size: 10px; background: #161620; color: #666; border: 1px solid #242430; border-radius: 3px; cursor: pointer; text-align: center; transition: all 0.15s; font-family: inherit; }
  .face-btn:hover { background: #242430; color: #bbb; }
  .face-btn.active { background: #142840; color: #7aacff; border-color: #1a3a5a; box-shadow: 0 0 6px rgba(68,136,255,0.12); }
  #face-legend { padding: 6px 14px 8px; border-top: 1px solid #1a1a24; display: flex; flex-wrap: wrap; gap: 3px; background: #0c0c14; }
  .legend-item { display: flex; align-items: center; gap: 3px; font-size: 10px; color: #666; padding: 1px 5px; background: #12121a; border-radius: 2px; }
  .legend-swatch { width: 8px; height: 8px; border-radius: 1px; border: 1px solid #222230; flex-shrink: 0; }
  #panel-right { flex: 1; position: relative; overflow: hidden; background: #0a0a14; }
  #three-container { width: 100%; height: 100%; }
  #controls-hint { position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%); background: rgba(8,8,14,0.85); border: 1px solid #222230; border-radius: 6px; padding: 5px 12px; font-size: 10px; color: #444; display: flex; gap: 12px; backdrop-filter: blur(8px); user-select: none; pointer-events: none; white-space: nowrap; }
  #controls-hint span { display: flex; align-items: center; gap: 3px; }
  kbd { background: #101018; border: 1px solid #222230; border-radius: 2px; padding: 0 4px; font-size: 9px; color: #777; }
  #loading { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #0a0a12; z-index: 9999; transition: opacity 0.5s; }
  #loading.hidden { opacity: 0; pointer-events: none; }
  #loading .spinner { width: 32px; height: 32px; border: 3px solid #181824; border-top-color: #4488ff; border-radius: 50%; animation: spin 0.8s linear infinite; }
  #loading p { margin-top: 12px; color: #444; font-size: 12px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 720px) {
    #app { flex-direction: column; }
    #panel-left { width: 100%; min-width: unset; height: 40vh; border-right: none; border-bottom: 1px solid #242430; }
    #panel-right { height: 60vh; }
  }
</style>
</head>
<body>
<div id="loading"><div class="spinner"></div><p>加载 3D 场景...</p></div>
<div id="app">
  <div id="panel-left">
    <div id="panel-header"><h2>当前面</h2></div>
    <div id="face-info">
      <span id="face-name">正面</span>
      <span id="face-id">MT0</span>
    </div>
    <div id="thumbnail-container">
      <canvas id="thumbnail-canvas" width="338" height="338"></canvas>
    </div>
    <div id="face-selector">
      <button data-face="MT0" class="face-btn active" onclick="window.selectFace('MT0')">正面</button>
      <button data-face="MT1" class="face-btn" onclick="window.selectFace('MT1')">后面</button>
      <button data-face="MT2" class="face-btn" onclick="window.selectFace('MT2')">左面</button>
      <button data-face="MT3" class="face-btn" onclick="window.selectFace('MT3')">右面</button>
      <button data-face="MT4" class="face-btn" onclick="window.selectFace('MT4')">顶面</button>
      <button data-face="MT5" class="face-btn" onclick="window.selectFace('MT5')">底面</button>
    </div>
    <div id="face-legend">
      <div class="legend-item"><span class="legend-swatch" style="background:#3a3a4a"></span>墙</div>
      <div class="legend-item"><span class="legend-swatch" style="background:#553333"></span>敌</div>
      <div class="legend-item"><span class="legend-swatch" style="background:#446644"></span>NPC</div>
      <div class="legend-item"><span class="legend-swatch" style="background:#ccaa44"></span>钥</div>
      <div class="legend-item"><span class="legend-swatch" style="background:#dd8844"></span>门</div>
      <div class="legend-item"><span class="legend-swatch" style="background:#4488cc"></span>道具</div>
    </div>
  </div>
  <div id="panel-right">
    <div id="three-container"></div>
    <div id="controls-hint">
      <span>🖱 <kbd>左键拖</kbd> 旋转</span>
      <span><kbd>滚轮</kbd> 缩放</span>
      <span><kbd>右键拖</kbd> 平移</span>
    </div>
  </div>
</div>
<script type="importmap">
{
  "imports": {
    "three": "/lib/three/three.module.min.js",
    "three/addons/": "/lib/three/"
  }
}
</script>
<script type="module">
import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";

// ============================================================
// 1. 地图数据
// ============================================================
''' + floors_line + ';\n' + colors_line + ''';

var FACE_NAMES = {MT0:"正面",MT1:"后面",MT2:"左面",MT3:"右面",MT4:"顶面",MT5:"底面"};
var FACE_COLORS = {MT0:"#4488ff",MT1:"#ff6644",MT2:"#44cc88",MT3:"#cc44cc",MT4:"#ffcc44",MT5:"#44ccff"};
var currentFace = "MT0";

// ============================================================
// 2. 缩略图渲染
// ============================================================
function renderMapToCanvas(map, colors, canvas, w, h) {
  var ctx = canvas.getContext("2d");
  var cw = canvas.width, ch = canvas.height;
  var cellSize = cw / Math.max(w, h);
  ctx.clearRect(0, 0, cw, ch);
  for (var y = 0; y < h; y++) {
    for (var x = 0; x < w; x++) {
      var id = map[y][x];
      ctx.fillStyle = colors[id] || (id === 0 ? "#14141e" : "#3a3a4a");
      ctx.fillRect(x * cellSize | 0, y * cellSize | 0, cellSize, cellSize);
    }
  }
  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 0.5;
  for (var x = 0; x <= w; x++) { ctx.beginPath(); ctx.moveTo(x * cellSize | 0, 0); ctx.lineTo(x * cellSize | 0, h * cellSize | 0); ctx.stroke(); }
  for (var y = 0; y <= h; y++) { ctx.beginPath(); ctx.moveTo(0, y * cellSize | 0); ctx.lineTo(w * cellSize | 0, y * cellSize | 0); ctx.stroke(); }
}

function renderThumbnail(floorId) {
  var thumbCanvas = document.getElementById("thumbnail-canvas");
  var floor = floorsData[floorId];
  if (!floor) return;
  var map = floor.map;
  var h = map.length, w = map[0].length;
  renderMapToCanvas(map, BLOCK_COLORS, thumbCanvas, w, h);
  document.getElementById("face-name").textContent = FACE_NAMES[floorId] || floor.title || floorId;
  document.getElementById("face-id").textContent = floorId;
  document.getElementById("face-name").style.color = FACE_COLORS[floorId] || "#f0f0f0";
}

// ============================================================
// 3. Three.js 3D 场景
// ============================================================
var container = document.getElementById("three-container");
var scene = new THREE.Scene();
var aspect = container.clientWidth / container.clientHeight || 1;
var camera = new THREE.PerspectiveCamera(38, aspect, 0.1, 100);
camera.position.set(3.6, 2.6, 4.6);

var renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x0a0a14, 1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
container.appendChild(renderer.domElement);

var controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 2.2;
controls.maxDistance = 14;
controls.target.set(0, 0, 0);
controls.update();

scene.add(new THREE.AmbientLight(0x223355, 0.5));
var dl = new THREE.DirectionalLight(0xffeedd, 1.6);
dl.position.set(5, 10, 7); dl.castShadow = true; scene.add(dl);
scene.add(new THREE.DirectionalLight(0x4488ff, 0.3).position.set(-3, 1, -5));
scene.add(new THREE.DirectionalLight(0x88ccff, 0.2).position.set(-2, -3, 4));

var ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 2.0, 48), new THREE.MeshBasicMaterial({color:0x224488,transparent:true,opacity:0.1,side:THREE.DoubleSide,depthWrite:false}));
ring.rotation.x = -Math.PI / 2; ring.position.y = -1.05; scene.add(ring);

// ============================================================
// 4. 立方体
// ============================================================
var cubeSize = 2;
var faceGroup = new THREE.Group();
scene.add(faceGroup);
var faceMeshes = {};

var faceConfigs = [
  {id:"MT0", pos:[0,0,1], rot:[0,0,0]},
  {id:"MT1", pos:[0,0,-1], rot:[0,Math.PI,0]},
  {id:"MT2", pos:[-1,0,0], rot:[0,-Math.PI/2,0]},
  {id:"MT3", pos:[1,0,0], rot:[0,Math.PI/2,0]},
  {id:"MT4", pos:[0,1,0], rot:[-Math.PI/2,0,0]},
  {id:"MT5", pos:[0,-1,0], rot:[Math.PI/2,0,0]}
];

function buildFaceTexture(floorId) {
  var c = document.createElement("canvas");
  c.width = 512; c.height = 512;
  var ctx = c.getContext("2d");
  var floor = floorsData[floorId];
  if (floor && floor.map) {
    var map = floor.map;
    var h = map.length, w = map[0].length;
    var cellSize = 512 / Math.max(w, h);
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        var id = map[y][x];
        ctx.fillStyle = BLOCK_COLORS[id] || (id === 0 ? "#14141e" : "#3a3a4a");
        ctx.fillRect(x * cellSize | 0, y * cellSize | 0, Math.ceil(cellSize), Math.ceil(cellSize));
      }
    }
    ctx.strokeStyle = "rgba(255,255,255,0.05)";
    ctx.lineWidth = 1;
    for (var x = 0; x <= w; x++) { ctx.beginPath(); ctx.moveTo(x * cellSize | 0, 0); ctx.lineTo(x * cellSize | 0, 512); ctx.stroke(); }
    for (var y = 0; y <= h; y++) { ctx.beginPath(); ctx.moveTo(0, y * cellSize | 0); ctx.lineTo(512, y * cellSize | 0); ctx.stroke(); }
  }
  var grad = ctx.createLinearGradient(0, 420, 0, 512);
  grad.addColorStop(0, "rgba(0,0,0,0)");
  grad.addColorStop(0.3, "rgba(0,0,0,0.5)");
  grad.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 420, 512, 92);
  ctx.fillStyle = "#d0d8e8";
  ctx.font = 'bold 34px "PingFang SC","Microsoft YaHei",sans-serif';
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 6;
  ctx.fillText(FACE_NAMES[floorId] || floorId, 256, 464);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.font = '14px "Courier New",monospace';
  ctx.fillText(floorId, 256, 491);
  var tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}

var planeGeo = new THREE.PlaneGeometry(cubeSize, cubeSize);
for (var i = 0; i < faceConfigs.length; i++) {
  var cfg = faceConfigs[i];
  var tex = buildFaceTexture(cfg.id);
  var mat = new THREE.MeshStandardMaterial({map:tex, color:0xffffff, roughness:0.35, metalness:0.05, side:THREE.DoubleSide});
  var mesh = new THREE.Mesh(planeGeo, mat);
  mesh.position.set(cfg.pos[0], cfg.pos[1], cfg.pos[2]);
  mesh.rotation.set(cfg.rot[0], cfg.rot[1], cfg.rot[2]);
  mesh.castShadow = true; mesh.receiveShadow = true;
  mesh.userData.floorId = cfg.id;
  mesh.userData.isSelected = cfg.id === currentFace;
  faceGroup.add(mesh);
  faceMeshes[cfg.id] = mesh;
}

faceGroup.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(cubeSize, cubeSize, cubeSize)), new THREE.LineBasicMaterial({color:0x4488cc, transparent:true, opacity:0.25})));
var hlBox = new THREE.Mesh(new THREE.BoxGeometry(cubeSize*1.04, cubeSize*1.04, cubeSize*1.04), new THREE.MeshBasicMaterial({color:0x4488ff, transparent:true, opacity:0.1, side:THREE.BackSide}));
faceGroup.add(hlBox);

// 星空
var sp = new Float32Array(1200*3);
for (var i = 0; i < 1200*3; i++) sp[i] = (Math.random() - 0.5) * 80;
var sg = new THREE.BufferGeometry();
sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
scene.add(new THREE.Points(sg, new THREE.PointsMaterial({color:0x4466aa, size:0.03, transparent:true, opacity:0.4})));

// ============================================================
// 5. 交互
// ============================================================
var raycaster = new THREE.Raycaster();
var pointer = new THREE.Vector2();

function getFace(event) {
  var rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  var meshes = Object.values(faceMeshes);
  var is = raycaster.intersectObjects(meshes);
  for (var j = 0; j < is.length; j++) {
    if (is[j].object.userData && is[j].object.userData.floorId) return is[j].object.userData.floorId;
  }
  return null;
}

renderer.domElement.addEventListener("pointermove", function(e) {
  var fid = getFace(e);
  var keys = Object.keys(faceMeshes);
  for (var fi = 0; fi < keys.length; fi++) {
    var k = keys[fi];
    if (k !== currentFace) {
      faceMeshes[k].material.emissive = new THREE.Color(0x000000);
      faceMeshes[k].material.emissiveIntensity = 0;
    }
  }
  if (fid && fid !== currentFace) {
    faceMeshes[fid].material.emissive = new THREE.Color(0x4488ff);
    faceMeshes[fid].material.emissiveIntensity = 0.1;
    renderer.domElement.style.cursor = "pointer";
  } else {
    renderer.domElement.style.cursor = "default";
  }
});

renderer.domElement.addEventListener("click", function(e) {
  var fid = getFace(e);
  if (fid) window.selectFace(fid);
});

// ============================================================
// 6. selectFace
// ============================================================
window.selectFace = function(floorId) {
  if (currentFace === floorId) return;
  if (currentFace && faceMeshes[currentFace]) {
    faceMeshes[currentFace].userData.isSelected = false;
    faceMeshes[currentFace].material.emissive = new THREE.Color(0x000000);
    faceMeshes[currentFace].material.emissiveIntensity = 0;
  }
  currentFace = floorId;
  faceMeshes[floorId].userData.isSelected = true;
  faceMeshes[floorId].material.emissive = new THREE.Color(0x4488ff);
  faceMeshes[floorId].material.emissiveIntensity = 0.18;
  renderThumbnail(floorId);
  document.querySelectorAll(".face-btn").forEach(function(b) { b.classList.toggle("active", b.dataset.face === floorId); });
};

window.renderThumbnail = renderThumbnail;

// ============================================================
// 7. 窗口自适应
// ============================================================
function onResize() {
  var w = container.clientWidth;
  var h = container.clientHeight;
  if (w === 0 || h === 0) return;
  camera.aspect = w / h; camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
window.addEventListener("resize", onResize);

// ============================================================
// 8. 动画循环
// ============================================================
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  ring.rotation.z += 0.001;
  renderer.render(scene, camera);
}

// ============================================================
// 9. 初始化
// ============================================================
document.getElementById("loading").classList.add("hidden");
renderThumbnail("MT0");
if (faceMeshes["MT0"]) {
  faceMeshes["MT0"].material.emissive = new THREE.Color(0x4488ff);
  faceMeshes["MT0"].material.emissiveIntensity = 0.18;
}
window.addEventListener("keydown", function(e) {
  if (e.key >= "1" && e.key <= "6") {
    var ids = ["MT0","MT1","MT2","MT3","MT4","MT5"];
    window.selectFace(ids[parseInt(e.key) - 1]);
  }
});
animate();
</script>
</body>
</html>'''

with open('D:/立方体 - 副本/mota-js/cube-map-viewer.html', 'w', encoding='utf-8') as f:
    f.write(tpl)

print('OK: ' + str(len(tpl)) + ' chars')
