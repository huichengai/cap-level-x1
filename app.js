/* ==========================================================================
   CAP-LEVEL X1 — Capacitive Level Gauge / Exploded Systems Lab
   Three.js scene, procedural instrument, live capacitive measurement
   ========================================================================== */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

/* --------------------------------------------------------------------------
   Utilities
   -------------------------------------------------------------------------- */

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const damp = (current, target, lambda, delta) =>
  lerp(current, target, 1 - Math.exp(-lambda * delta));
const smoothstep = (a, b, value) => {
  const t = clamp((value - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const pad2 = (value) => String(value).padStart(2, '0');
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* --------------------------------------------------------------------------
   Media model
   -------------------------------------------------------------------------- */

const MEDIA = {
  water: {
    key: 'water',
    name: '纯水',
    en: 'DEIONIZED WATER',
    symbol: 'H₂O',
    colorLow: '#43d4ff',
    colorHigh: '#0b6fe8',
    epsilonLow: 80.1,
    epsilonHigh: 62.0,
    density: 998,
    material: '去离子水 / H₂O（实际无色）',
    note: '实际无色，教学配色使用蓝色水色，适合小量程、高分辨率液位测量。',
  },
  ethanol: {
    key: 'ethanol',
    name: '乙醇溶液',
    en: 'ETHANOL SOLUTION',
    symbol: 'C₂H₅OH',
    colorLow: '#dff8ff',
    colorHigh: '#a9d9ff',
    epsilonLow: 24.5,
    epsilonHigh: 18.0,
    density: 789,
    material: '乙醇溶液 / C₂H₅OH（无色透明）',
    note: '实际为无色透明液体；为避免与清水混淆，教学配色使用极浅冰蓝。',
  },
  glycol: {
    key: 'glycol',
    name: '丙二醇冷却液',
    en: 'GLYCOL COOLANT',
    symbol: 'PG',
    colorLow: '#b8ffcf',
    colorHigh: '#42c97a',
    epsilonLow: 42.0,
    epsilonHigh: 32.0,
    density: 1036,
    material: '丙二醇冷却液 / 荧光绿',
    note: '常见冷却液多带荧光绿染料；纯丙二醇本身接近无色，介电常数随浓度升高而降低。',
  },
  oil: {
    key: 'oil',
    name: '液压油',
    en: 'HYDRAULIC OIL',
    symbol: 'OIL',
    colorLow: '#f2ba5c',
    colorHigh: '#9a5a18',
    epsilonLow: 2.3,
    epsilonHigh: 3.4,
    density: 860,
    material: '矿物液压油 / ISO VG 46（琥珀色）',
    note: '矿物液压油通常呈浅琥珀至棕黄色；低介电常数，对绝缘和同轴结构要求更高。',
  },
};

const CATEGORY_META = {
  sensor: { label: 'SENSOR / 传感', short: 'SEN' },
  structure: { label: 'STRUCTURE / 结构', short: 'STR' },
  electronics: { label: 'ELECTRONICS / 电子', short: 'ELE' },
  fluid: { label: 'FLUID / 流体', short: 'FLD' },
};

const PART_DEFS = [
  {
    id: 'tank',
    code: 'ST-01',
    index: 1,
    name: '高透光储液罐',
    en: 'ACRYLIC RESERVOIR',
    category: 'structure',
    material: '高透光亚克力 / 316L 不锈钢',
    mass: '6.8 KG',
    sync: 99.8,
    metrics: [
      ['量程', '0–2,600', 'MM'],
      ['有效容积', '12.5', 'L'],
      ['壁厚', '8', 'MM'],
      ['耐温', '−20–80', '°C'],
    ],
    description:
      '一体吹塑成型的高透光储液罐，圆角矩形截面与锥形底保证低液位下的排液完整性。透明侧壁让探头、保护管与介质状态可直接观察，同时保留电容测量所需的稳定几何间距。',
    explode: [0, -0.18, 0],
    anchor: [-0.9, 2.18, 0.56],
  },
  {
    id: 'liquid',
    code: 'FL-02',
    index: 2,
    name: '液体介质',
    en: 'DIELECTRIC MEDIUM',
    category: 'fluid',
    material: '去离子水 / H₂O',
    mass: '7.2 KG',
    sync: 99.9,
    dynamic: true,
    metrics: [
      ['相对介电常数', '80.1', 'εr'],
      ['浓度', '0', '%'],
      ['密度', '998', 'kg/m³'],
      ['当前液位', '1,508', 'MM'],
    ],
    description:
      '液体经外电极管的细长导液窗口进入中心杆与 PTFE 绝缘层之间的环形间隙，管内液面与罐内保持一致。导电液体时 PTFE 是唯一介质，非导电液体时液体本身参与介电；液位上升改变浸没长度，从而改变中心杆对金属外管的电容。颜色与 εr 标注随介质和浓度同步变化。',
    explode: [0, 0.035, 0.04],
    anchor: [0.1, 1.5, 0.46],
    isFluid: true,
  },
  {
    id: 'head',
    code: 'SN-03',
    index: 3,
    name: '电容变送器头',
    en: 'TRANSMITTER HEAD',
    category: 'sensor',
    material: 'PA66-GF30 / 阳极氧化铝',
    mass: '0.86 KG',
    sync: 99.6,
    metrics: [
      ['供电', '24', 'V DC'],
      ['输出', '4–20', 'mA'],
      ['通讯', 'HART 7', 'PROTO'],
      ['防护', 'IP67', 'IP'],
    ],
    description:
      '变送器头部容纳测量电路、显示与接线端子，将探头电容变化转换为标准 4–20 mA 电流环信号。HART 7 数字通讯可在不中断液位测量的情况下完成量程、阻尼和介质标定。',
    explode: [0, 1.05, 0],
    anchor: [0, 3.86, 0.02],
  },
  {
    id: 'flange',
    code: 'ST-04',
    index: 4,
    name: '过程连接法兰',
    en: 'PROCESS FLANGE',
    category: 'structure',
    material: '316L 不锈钢',
    mass: '1.42 KG',
    sync: 99.7,
    metrics: [
      ['规格', 'DN40', 'PN16'],
      ['螺栓', '6×M8', 'PCS'],
      ['耐压', '1.6', 'MPA'],
      ['表面', 'Ra 0.8', 'μm'],
    ],
    description:
      '316L 不锈钢过程连接法兰为探头提供刚性支撑与压力密封，六个 M8 螺栓形成均匀预紧力。法兰中心同轴度控制在 0.05 mm 内，以保持探头与保护管之间的电容间隙。',
    explode: [0, 0.85, 0],
    anchor: [0.27, 3.3, 0.16],
  },
  {
    id: 'seal',
    code: 'ST-05',
    index: 5,
    name: '密封组件',
    en: 'PTFE SEAL STACK',
    category: 'structure',
    material: 'PTFE / FFKM 氟橡胶',
    mass: '0.08 KG',
    sync: 99.9,
    metrics: [
      ['静密封', 'IP68', 'IP'],
      ['耐温', '−40–150', '°C'],
      ['介质兼容', 'pH 0–14', 'RANGE'],
      ['预紧力', '18', 'NM'],
    ],
    description:
      'PTFE 平垫与 FFKM O 形圈组成双级密封栈，阻止液体沿探头绝缘层爬升。密封件在装配时被法兰均匀压缩，保证长期耐化学介质并避免形成影响电容读数的液膜。',
    explode: [-1.25, 0.7, 0.25],
    anchor: [-0.28, 3.2, 0.22],
  },
  {
    id: 'electrode',
    code: 'SN-06',
    index: 6,
    name: '中心测量电极',
    en: 'SENSING ELECTRODE',
    category: 'sensor',
    material: '316L / 哈氏合金 C-276',
    mass: '0.32 KG',
    sync: 99.8,
    metrics: [
      ['有效长度', '2,600', 'MM'],
      ['杆径', '4.0', 'MM'],
      ['绝缘电阻', '>100', 'GΩ'],
      ['耐温', '200', '°C'],
    ],
    description:
      'Ø4 中心杆作为同轴电容器的内电极，外挤包连续 PTFE 绝缘层，并与 Ø12–20 不锈钢外管严格同轴。液位进入内外电极之间的环形间隙后，中心杆对外管的电容随浸没长度变化，再由变送器换算为液位。',
    explode: [0, 0.65, 0],
    anchor: [0, 2.38, 0.06],
  },
  {
    id: 'insulation',
    code: 'SN-07',
    index: 7,
    name: 'PTFE 绝缘层',
    en: 'PTFE DIELECTRIC SLEEVE',
    category: 'sensor',
    material: 'PTFE 聚四氟乙烯',
    mass: '0.06 KG',
    sync: 99.9,
    metrics: [
      ['介电常数', '2.1', 'εr'],
      ['壁厚', '0.5–5.0', 'MM'],
      ['耐温', '260', '°C'],
      ['绝缘电阻', '>100', 'GΩ'],
    ],
    description:
      'PTFE 绝缘层连续包覆中心电极，并位于中心杆与外管之间。它同时承担绝缘、固定几何间距和防粘附三个作用：导电液体时它是唯一介质，低且稳定的 εr 让电容基线可预测；不粘表面则减少挂料造成的虚假液位。',
    explode: [1.25, 0.8, 0.2],
    anchor: [0.12, 3.02, 0.08],
  },
  {
    id: 'guard',
    code: 'SN-08',
    index: 8,
    name: '外电极不锈钢管',
    en: 'OUTER ELECTRODE TUBE',
    category: 'sensor',
    material: '304 / 316L 不锈钢',
    mass: '0.46 KG',
    sync: 99.7,
    metrics: [
      ['外极板', 'Ø16–20', 'MM'],
      ['导液窗口', '4×长槽', 'PCS'],
      ['接地', 'REF / GND', 'SHIELD'],
      ['有效长度', '2,200', 'MM'],
    ],
    description:
      'Ø12–20 不锈钢外管是电容器的固定外极板，并与中心杆严格同轴后接地。管壁仅开有 4 条两端封闭的细长导液窗口，让液体进入中心杆与 PTFE 绝缘层之间的环形间隙；外管同时提供电场屏蔽、抗晃动和机械保护。',
    explode: [-1.5, 0.55, 0.2],
    anchor: [0.18, 1.42, 0.16],
  },
  {
    id: 'mount',
    code: 'ST-09',
    index: 9,
    name: '顶部安装桥架',
    en: 'MOUNTING BRIDGE',
    category: 'structure',
    material: '6061-T6 阳极氧化铝',
    mass: '0.74 KG',
    sync: 99.6,
    metrics: [
      ['跨距', '220', 'MM'],
      ['承载', '4.0', 'KG'],
      ['平面度', '0.10', 'MM'],
      ['调节量', '±6', 'MM'],
    ],
    description:
      '顶部安装桥架横跨开口储液罐，为法兰和变送器头提供稳定的机械基准。两侧定位脚与罐口止口配合，微调螺栓可在装配时修正探头垂直度，避免侧向偏摆造成电容间隙变化。',
    explode: [-0.9, 0.75, -0.8],
    anchor: [-0.82, 3.16, 0.15],
  },
  {
    id: 'display',
    code: 'EL-10',
    index: 10,
    name: '圆形显示窗',
    en: 'OLED DISPLAY LENS',
    category: 'electronics',
    material: '钢化玻璃 / 铝合金',
    mass: '0.12 KG',
    sync: 99.5,
    metrics: [
      ['直径', '56', 'MM'],
      ['分辨率', '240×240', 'PX'],
      ['亮度', '600', 'CD/M²'],
      ['玻璃', '2.5D', 'ARC'],
    ],
    description:
      '圆形高亮 OLED 显示窗在强光环境下仍能读取液位、电流与介质介电常数。2.5D 钢化玻璃与铝制表圈通过 O 形圈压紧密封，现场无需开盖即可完成零点与量程确认。',
    explode: [0.9, 0.85, 0.95],
    anchor: [0.12, 3.56, 0.3],
  },
  {
    id: 'pcb',
    code: 'EL-11',
    index: 11,
    name: '变送器电子模块',
    en: 'TRANSMITTER PCB',
    category: 'electronics',
    material: 'FR-4 / 沉金铜箔',
    mass: '0.18 KG',
    sync: 99.8,
    metrics: [
      ['MCU', '32-bit', 'ARM'],
      ['ADC', '24-bit', 'ΔΣ'],
      ['输出', '4–20', 'mA'],
      ['温补', '−40–85', '°C'],
    ],
    description:
      '24 位 ΔΣ 电容数字转换器将探头微小电容变化数字化，32 位 MCU 完成线性化、温度补偿和 HART 协议栈处理。板级屏蔽罩隔离电流环噪声，保证低液位下仍具稳定分辨率。',
    explode: [1.05, 0.75, 0.25],
    anchor: [0.3, 3.54, 0.05],
  },
  {
    id: 'terminal',
    code: 'EL-12',
    index: 12,
    name: '接线端子与电缆',
    en: 'TERMINAL & CABLE',
    category: 'electronics',
    material: 'PA66 / 镀锡铜 / 屏蔽层',
    mass: '0.3 KG',
    sync: 99.4,
    metrics: [
      ['线制', '2-wire', 'LOOP'],
      ['电缆入口', 'M20×1.5', 'GLAND'],
      ['屏蔽', '铝箔+排流', 'SHIELD'],
      ['长度', '2.0', 'M'],
    ],
    description:
      '防水电缆密封接头与可插拔接线端子完成 24 V 供电和 4–20 mA 回路连接。双层屏蔽电缆抑制变频器与泵机产生的高频干扰，排流线在端子内部单点接地。',
    explode: [1.7, 0.8, 0.35],
    anchor: [0.58, 3.4, 0.3],
  },
  {
    id: 'scale',
    code: 'ST-13',
    index: 13,
    name: '液位标尺',
    en: 'LEVEL SCALE',
    category: 'structure',
    material: '亚克力 / 荧光涂层',
    mass: '0.10 KG',
    sync: 99.3,
    metrics: [
      ['刻度范围', '0–2,600', 'MM'],
      ['分度值', '50', 'MM'],
      ['刻度精度', '±1', 'MM'],
      ['安装', '磁吸', 'CLIP'],
    ],
    description:
      '外挂式荧光液位标尺提供独立于电子信号的本地读数，可在断电或调试时快速判断液位。高对比度刻线与随液位移动的发光游标让读数在低照度实验环境中保持清晰。',
    explode: [-1.5, 0.04, 0.62],
    anchor: [-0.82, 1.65, 0.68],
  },
  {
    id: 'drain',
    code: 'FL-14',
    index: 14,
    name: '底部排液阀',
    en: 'DRAIN / FILL VALVE',
    category: 'fluid',
    material: '316L / PTFE 阀座',
    mass: '0.42 KG',
    sync: 99.5,
    metrics: [
      ['接口', '1/2″ NPT', 'PORT'],
      ['阀座', 'PTFE', 'SEAT'],
      ['流量', '8.4', 'L/MIN'],
      ['耐压', '1.6', 'MPA'],
    ],
    description:
      '锥形罐底最低点设置排液阀，保证换液和清洗时无残留。阀体与罐体之间使用 PTFE 锥面密封，手动阀杆可精确控制注液和排液速度，满足液位响应的现场演示需求。',
    explode: [0, -0.3, 1.05],
    anchor: [0.02, 0.3, 0.38],
  },
];

/* --------------------------------------------------------------------------
   DOM / state
   -------------------------------------------------------------------------- */

const dom = {
  app: $('#app'),
  canvas: $('#stage'),
  labels: $('#labelLayer'),
  fps: $('#fpsValue'),
  topCurrent: $('#topCurrent'),
  livePillText: $('#livePillText'),
  projectState: $('#projectState'),
  stageFluid: $('#stageFluid'),
  partsList: $('#partsList'),
  partCount: $('#partCount'),
  selectionCode: $('#selectionCode'),
  selectionIndex: $('#selectionIndex'),
  selectionCategory: $('#selectionCategory'),
  selectionName: $('#selectionName'),
  selectionEnglish: $('#selectionEnglish'),
  specGrid: $('#specGrid'),
  selectionDescription: $('#selectionDescription'),
  selectionMaterial: $('#selectionMaterial'),
  selectionMass: $('#selectionMass'),
  syncValue: $('#syncValue'),
  syncBar: $('#syncBar'),
  liveMedium: $('#liveMedium'),
  levelArc: $('#levelArc'),
  levelPercent: $('#levelPercent'),
  levelMm: $('#levelMm'),
  liveCap: $('#liveCap'),
  liveCurrent: $('#liveCurrent'),
  liveEr: $('#liveEr'),
  legendMaterial: $('#legendMaterial'),
  legendConcentration: $('#legendConcentration'),
  fluidGradient: $('#fluidGradient'),
  fluidMarker: $('#fluidMarker'),
  levelValue: $('#levelValue'),
  levelSlider: $('#levelSlider'),
  flowStatus: $('#flowStatus'),
  levelFlow: $('#levelFlow'),
  flowDot: $('#flowDot'),
  fillBtn: $('#fillBtn'),
  drainBtn: $('#drainBtn'),
  mediumChips: $('#mediumChips'),
  concentrationSlider: $('#concentrationSlider'),
  concentrationValue: $('#concentrationValue'),
  epsilonValue: $('#epsilonValue'),
  explodeBtn: $('#explodeBtn'),
  explodeLabel: $('#explodeLabel'),
  explodeSlider: $('#explodeSlider'),
  explodeValue: $('#explodeValue'),
  autoRotateBtn: $('#autoRotateBtn'),
  snapshotBtn: $('#snapshotBtn'),
  focusBtn: $('#focusBtn'),
  resetBtn: $('#resetBtn'),
  fullscreenBtn: $('#fullscreenBtn'),
  viewModeLabel: $('#viewModeLabel'),
  toast: $('#toast'),
  boot: $('#boot'),
  bootBar: $('#bootBar'),
  bootStatus: $('#bootStatus'),
  bootPercent: $('#bootPercent'),
  rightPanel: $('.right-panel'),
};

const state = {
  level: 0.58,
  levelTarget: 0.58,
  previousLevel: 0.58,
  medium: 'water',
  concentration: 0,
  epsilon: MEDIA.water.epsilonLow,
  explode: 0,
  explodeTarget: 0,
  selectedId: 'tank',
  hoveredId: null,
  filter: 'all',
  autoRotate: !reducedMotion,
  booted: false,
  pointerDown: null,
  mouseOnCanvas: false,
  mouse: new THREE.Vector2(2, 2),
  tween: null,
  flowMode: 'stable',
  wavePhase: 0,
  targetColor: new THREE.Color(MEDIA.water.colorLow),
  currentColor: new THREE.Color(MEDIA.water.colorLow),
  fpsFrames: 0,
  fpsTime: 0,
  lastDisplayUpdate: 0,
  lastUiUpdate: 0,
  displayDirty: true,
};

const parts = [];
const partById = new Map();
let selectedPart = null;
let hoveredPart = null;
let toastTimer = 0;
let clockTimer = 0;
let currentMedium = MEDIA.water;
let currentDisplayTexture = null;
let displayCanvas = null;
let displayContext = null;
let displayMaterial = null;

/* --------------------------------------------------------------------------
   Renderer / camera
   -------------------------------------------------------------------------- */

const renderer = new THREE.WebGLRenderer({
  canvas: dom.canvas,
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x04090d, 0.0185);

const camera = new THREE.PerspectiveCamera(
  36,
  window.innerWidth / window.innerHeight,
  0.08,
  80
);
camera.position.set(5.8, 4.65, 8.8);

const controls = new OrbitControls(camera, dom.canvas);
controls.target.set(0, 1.98, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.055;
controls.enablePan = false;
controls.minDistance = 3.2;
controls.maxDistance = 23;
controls.minPolarAngle = 0.08;
controls.maxPolarAngle = Math.PI * 0.49;
controls.rotateSpeed = 0.7;
controls.zoomSpeed = 0.82;
controls.autoRotate = state.autoRotate;
controls.autoRotateSpeed = 0.52;
controls.update();

/* --------------------------------------------------------------------------
   Procedural textures
   -------------------------------------------------------------------------- */

function createCarbonTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#0c1114';
  ctx.fillRect(0, 0, size, size);
  const cell = 8;
  for (let y = 0; y < size; y += cell) {
    for (let x = 0; x < size; x += cell) {
      const alternate = (x / cell + y / cell) % 2 === 0;
      ctx.fillStyle = alternate ? '#1d272b' : '#080c0f';
      ctx.fillRect(x, y, cell, cell);
      ctx.strokeStyle = alternate ? 'rgba(108,136,143,.15)' : 'rgba(0,0,0,.2)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + cell, y + cell);
      ctx.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 5);
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createGlowTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.14, 'rgba(255,255,255,.92)');
  gradient.addColorStop(0.36, 'rgba(255,255,255,.34)');
  gradient.addColorStop(0.68, 'rgba(255,255,255,.06)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createTextTexture(text, color = '#9af8ff', background = 'rgba(0,0,0,0)', font = '600 42px "Bahnschrift", "Segoe UI", sans-serif') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (background !== 'rgba(0,0,0,0)') {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

const carbonTexture = createCarbonTexture();
const glowTexture = createGlowTexture();

/* --------------------------------------------------------------------------
   Environment / lighting
   -------------------------------------------------------------------------- */

function createEnvironment() {
  const envScene = new THREE.Scene();
  envScene.background = new THREE.Color(0x020507);
  const planeGeometry = new THREE.PlaneGeometry(1, 1);
  const addPanel = (color, intensity, position, rotation, scale) => {
    const material = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color).multiplyScalar(intensity),
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const mesh = new THREE.Mesh(planeGeometry, material);
    mesh.position.copy(position);
    mesh.rotation.set(rotation.x, rotation.y, rotation.z);
    mesh.scale.set(scale.x, scale.y, 1);
    envScene.add(mesh);
  };

  addPanel(0xffffff, 5.0, new THREE.Vector3(0, 8, 0), new THREE.Euler(-Math.PI / 2, 0, 0), new THREE.Vector2(10, 7));
  addPanel(0xc8efff, 4.2, new THREE.Vector3(0, 7.5, -7), new THREE.Euler(0, 0, 0), new THREE.Vector2(8, 1.2));
  addPanel(0x65e4ff, 3.4, new THREE.Vector3(-7.5, 4, 1.5), new THREE.Euler(0, Math.PI / 2, 0), new THREE.Vector2(7, 0.85));
  addPanel(0xffad55, 3.0, new THREE.Vector3(7.5, 3.1, 1.2), new THREE.Euler(0, -Math.PI / 2, 0), new THREE.Vector2(6, 0.7));
  addPanel(0x4f7188, 1.8, new THREE.Vector3(0, 2.2, 8), new THREE.Euler(0, Math.PI, 0), new THREE.Vector2(12, 4));
  addPanel(0x2b6a75, 2.1, new THREE.Vector3(-3.2, 2.2, -7.5), new THREE.Euler(0, 0, 0), new THREE.Vector2(2.4, 0.2));

  const pmrem = new THREE.PMREMGenerator(renderer);
  const renderTarget = pmrem.fromScene(envScene, 0.035);
  scene.environment = renderTarget.texture;
  pmrem.dispose();
  planeGeometry.dispose();
}

createEnvironment();

const hemiLight = new THREE.HemisphereLight(0xb8dde5, 0x020507, 1.05);
scene.add(hemiLight);

const keyLight = new THREE.DirectionalLight(0xfff5e9, 3.4);
keyLight.position.set(5.5, 10, 4.2);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
keyLight.shadow.camera.left = -6.5;
keyLight.shadow.camera.right = 6.5;
keyLight.shadow.camera.top = 8;
keyLight.shadow.camera.bottom = -4;
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 30;
keyLight.shadow.bias = -0.00035;
keyLight.shadow.normalBias = 0.025;
scene.add(keyLight);
scene.add(keyLight.target);

const rimLight = new THREE.DirectionalLight(0x58eaff, 2.2);
rimLight.position.set(-7, 5.5, -5.5);
scene.add(rimLight);

const warmRim = new THREE.DirectionalLight(0xff9b5a, 1.6);
warmRim.position.set(7, 3.6, 5.8);
scene.add(warmRim);

const fluidLight = new THREE.PointLight(0x3ad8ff, 8, 6, 2);
fluidLight.position.set(0, 1.2, 0);
scene.add(fluidLight);

const headLight = new THREE.PointLight(0xaefaff, 2.2, 2.4, 2);
headLight.position.set(0.2, 3.7, 0.3);
scene.add(headLight);

const drainLight = new THREE.PointLight(0x65e9ff, 0, 2.4, 2);
drainLight.position.set(0, 0.3, 0.6);
scene.add(drainLight);

const selectionLight = new THREE.PointLight(0x75f4ff, 0, 5, 2);
scene.add(selectionLight);

/* --------------------------------------------------------------------------
   Studio
   -------------------------------------------------------------------------- */

const studio = new THREE.Group();
scene.add(studio);
let fluidFloorRingMaterial = null;
let holoGroup = null;
let particleField = null;
let drainPulse = null;

function createStudio() {
  const floorMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x04090c,
    metalness: 0.72,
    roughness: 0.28,
    clearcoat: 0.6,
    clearcoatRoughness: 0.2,
    envMapIntensity: 0.38,
  });
  const floor = new THREE.Mesh(new THREE.CircleGeometry(16, 128), floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.03;
  floor.receiveShadow = true;
  studio.add(floor);

  const platform = new THREE.Mesh(
    new THREE.CylinderGeometry(2.85, 3.05, 0.12, 128),
    new THREE.MeshPhysicalMaterial({
      color: 0x050b0f,
      metalness: 0.84,
      roughness: 0.3,
      clearcoat: 0.45,
      envMapIntensity: 0.5,
    })
  );
  platform.position.y = -0.08;
  platform.receiveShadow = true;
  studio.add(platform);

  const platformEdgeMaterial = new THREE.MeshBasicMaterial({
    color: 0x4ee1f0,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const platformEdge = new THREE.Mesh(new THREE.RingGeometry(2.82, 2.855, 160), platformEdgeMaterial);
  platformEdge.rotation.x = -Math.PI / 2;
  platformEdge.position.y = -0.015;
  studio.add(platformEdge);

  fluidFloorRingMaterial = new THREE.MeshBasicMaterial({
    color: 0x38d6ff,
    transparent: true,
    opacity: 0.24,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const fluidRing = new THREE.Mesh(new THREE.RingGeometry(1.42, 1.46, 128), fluidFloorRingMaterial);
  fluidRing.rotation.x = -Math.PI / 2;
  fluidRing.position.y = -0.016;
  studio.add(fluidRing);

  const innerRing = new THREE.Mesh(
    new THREE.RingGeometry(0.82, 0.824, 96),
    new THREE.MeshBasicMaterial({
      color: 0x4b9fab,
      transparent: true,
      opacity: 0.2,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
  );
  innerRing.rotation.x = -Math.PI / 2;
  innerRing.position.y = -0.014;
  studio.add(innerRing);

  holoGroup = new THREE.Group();
  holoGroup.position.y = -0.012;
  studio.add(holoGroup);

  const arcMaterial = new THREE.MeshBasicMaterial({
    color: 0x5be8f5,
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
    toneMapped: false,
  });
  const makeArc = (radius, start, length, opacity) => {
    const material = arcMaterial.clone();
    material.opacity = opacity;
    const arc = new THREE.Mesh(new THREE.RingGeometry(radius - 0.006, radius + 0.006, 160, 1, start, length), material);
    arc.rotation.x = -Math.PI / 2;
    holoGroup.add(arc);
  };
  makeArc(2.55, 0.2, 1.1, 0.32);
  makeArc(2.55, Math.PI + 0.35, 0.92, 0.58);
  makeArc(2.55, Math.PI * 1.55, 0.42, 0.82);
  makeArc(2.74, 0.1, 0.26, 0.34);
  makeArc(2.74, Math.PI * 1.26, 0.18, 0.5);
  makeArc(2.74, Math.PI * 0.6, 0.15, 0.46);

  const radialLines = [];
  for (let i = 0; i < 28; i += 1) {
    const a = (i / 28) * Math.PI * 2;
    const inner = i % 7 === 0 ? 2.52 : 2.62;
    radialLines.push(Math.cos(a) * inner, 0, Math.sin(a) * inner, Math.cos(a) * 2.78, 0, Math.sin(a) * 2.78);
  }
  for (let ring = 0; ring < 5; ring += 1) {
    const radius = 0.52 + ring * 0.5;
    const segments = 96;
    for (let s = 0; s < segments; s += 1) {
      const a = (s / segments) * Math.PI * 2;
      const b = ((s + 1) / segments) * Math.PI * 2;
      radialLines.push(
        Math.cos(a) * radius, 0, Math.sin(a) * radius,
        Math.cos(b) * radius, 0, Math.sin(b) * radius
      );
    }
  }
  const gridGeometry = new THREE.BufferGeometry();
  gridGeometry.setAttribute('position', new THREE.Float32BufferAttribute(radialLines, 3));
  const grid = new THREE.LineSegments(
    gridGeometry,
    new THREE.LineBasicMaterial({
      color: 0x2d6873,
      transparent: true,
      opacity: 0.11,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
  );
  grid.position.y = 0.003;
  studio.add(grid);

  // Faint tick marks around the base.
  const tickMaterial = new THREE.MeshBasicMaterial({
    color: 0x7deffb,
    transparent: true,
    opacity: 0.44,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const tick = new THREE.Mesh(new THREE.PlaneGeometry(i % 2 === 0 ? 0.22 : 0.1, 0.012), tickMaterial);
    tick.rotation.x = -Math.PI / 2;
    tick.rotation.z = -a;
    tick.position.set(Math.cos(a) * 2.92, 0.002, Math.sin(a) * 2.92);
    studio.add(tick);
  }

  // Soft contact shadow.
  const shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = shadowCanvas.height = 256;
  const ctx = shadowCanvas.getContext('2d');
  const grad = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
  grad.addColorStop(0, 'rgba(0,0,0,.82)');
  grad.addColorStop(0.42, 'rgba(0,0,0,.54)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const shadowTex = new THREE.CanvasTexture(shadowCanvas);
  const softShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.7, 3.7),
    new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.66, depthWrite: false, toneMapped: false })
  );
  softShadow.rotation.x = -Math.PI / 2;
  softShadow.position.set(0, -0.005, 0);
  softShadow.renderOrder = 1;
  studio.add(softShadow);

  const particleCount = 360;
  const positions = new Float32Array(particleCount * 3);
  for (let i = 0; i < particleCount; i += 1) {
    const radius = 2.8 + Math.random() * 11;
    const angle = Math.random() * Math.PI * 2;
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = 0.2 + Math.random() * 7.2;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
  }
  const particleGeometry = new THREE.BufferGeometry();
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particleField = new THREE.Points(
    particleGeometry,
    new THREE.PointsMaterial({
      color: 0x8ceffa,
      size: 0.03,
      transparent: true,
      opacity: 0.44,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    })
  );
  studio.add(particleField);
}

createStudio();

/* --------------------------------------------------------------------------
   Materials
   -------------------------------------------------------------------------- */

const materials = {
  glass: new THREE.MeshPhysicalMaterial({
    color: 0x8bdfe9,
    metalness: 0,
    roughness: 0.025,
    transparent: true,
    opacity: 0.032,
    clearcoat: 0.9,
    clearcoatRoughness: 0.01,
    envMapIntensity: 1.05,
    side: THREE.DoubleSide,
    depthWrite: false,
    emissive: 0x041317,
    emissiveIntensity: 0.08,
  }),
  glassRim: new THREE.MeshPhysicalMaterial({
    color: 0xbdf4fb,
    metalness: 0,
    roughness: 0.02,
    transparent: true,
    opacity: 0.1,
    clearcoat: 1,
    clearcoatRoughness: 0.008,
    envMapIntensity: 1.45,
    side: THREE.DoubleSide,
    depthWrite: false,
  }),
  liquid: new THREE.MeshPhysicalMaterial({
    color: 0x38d6ff,
    vertexColors: true,
    metalness: 0.01,
    roughness: 0.38,
    transparent: true,
    opacity: 0.9,
    clearcoat: 0.24,
    clearcoatRoughness: 0.2,
    envMapIntensity: 0.28,
    side: THREE.DoubleSide,
    depthWrite: false,
    emissive: 0x06303a,
    emissiveIntensity: 0.58,
  }),
  steel: new THREE.MeshStandardMaterial({
    color: 0xc2d1d5,
    metalness: 1,
    roughness: 0.2,
    envMapIntensity: 1.25,
  }),
  steelDark: new THREE.MeshStandardMaterial({
    color: 0x3f4a4e,
    metalness: 0.95,
    roughness: 0.28,
    envMapIntensity: 0.95,
  }),
  anodized: new THREE.MeshStandardMaterial({
    color: 0x252f34,
    metalness: 0.9,
    roughness: 0.35,
    envMapIntensity: 0.85,
  }),
  polymerBlue: new THREE.MeshPhysicalMaterial({
    color: 0x0e86c8,
    metalness: 0.08,
    roughness: 0.33,
    clearcoat: 0.65,
    clearcoatRoughness: 0.22,
    envMapIntensity: 0.75,
  }),
  polymerWhite: new THREE.MeshPhysicalMaterial({
    color: 0xd9e3e4,
    metalness: 0.05,
    roughness: 0.35,
    clearcoat: 0.55,
    clearcoatRoughness: 0.25,
    envMapIntensity: 0.7,
  }),
  blackPlastic: new THREE.MeshStandardMaterial({
    color: 0x101619,
    metalness: 0.2,
    roughness: 0.52,
    envMapIntensity: 0.5,
  }),
  ptfe: new THREE.MeshPhysicalMaterial({
    color: 0xeee8d8,
    metalness: 0,
    roughness: 0.55,
    clearcoat: 0.2,
    clearcoatRoughness: 0.5,
    envMapIntensity: 0.45,
  }),
  rubber: new THREE.MeshStandardMaterial({
    color: 0x111719,
    metalness: 0.12,
    roughness: 0.8,
    envMapIntensity: 0.35,
  }),
  pcb: new THREE.MeshStandardMaterial({
    color: 0x0b6b55,
    metalness: 0.25,
    roughness: 0.55,
    envMapIntensity: 0.4,
  }),
  gold: new THREE.MeshStandardMaterial({
    color: 0xd8a749,
    metalness: 1,
    roughness: 0.24,
    envMapIntensity: 1.1,
  }),
  chip: new THREE.MeshStandardMaterial({
    color: 0x0b0e10,
    metalness: 0.4,
    roughness: 0.5,
    envMapIntensity: 0.5,
  }),
  cable: new THREE.MeshStandardMaterial({
    color: 0x161e22,
    metalness: 0.08,
    roughness: 0.66,
    envMapIntensity: 0.3,
  }),
  cyan: new THREE.MeshBasicMaterial({
    color: 0x8ff8ff,
    toneMapped: false,
  }),
  cyanGlow: new THREE.MeshBasicMaterial({
    color: 0x65f3ff,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }),
  amber: new THREE.MeshBasicMaterial({
    color: 0xffb85a,
    toneMapped: false,
  }),
  amberGlow: new THREE.MeshBasicMaterial({
    color: 0xffa23d,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }),
  redGlow: new THREE.MeshBasicMaterial({
    color: 0xff6957,
    transparent: true,
    opacity: 0.82,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }),
  greenGlow: new THREE.MeshBasicMaterial({
    color: 0x7dffc0,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  }),
  display: new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  }),
};

/* --------------------------------------------------------------------------
   Geometry helpers
   -------------------------------------------------------------------------- */

const TANK = {
  bottom: 0.16,
  coneTop: 1.02,
  top: 3.08,
  outerW: 2.12,
  outerD: 1.28,
  outerR: 0.24,
  wall: 0.07,
  innerW: 1.98,
  innerD: 1.14,
  innerR: 0.17,
  rimTop: 3.15,
};

const LIQUID_BOTTOM = 0.18;
const LIQUID_TOP = 2.98;

function roundedRectPoints(width, depth, radius, cornerSegments = 8) {
  const hw = width / 2;
  const hd = depth / 2;
  const r = Math.min(radius, hw * 0.98, hd * 0.98);
  const corners = [
    { cx: hw - r, cz: hd - r, start: 0, end: Math.PI / 2 },
    { cx: -hw + r, cz: hd - r, start: Math.PI / 2, end: Math.PI },
    { cx: -hw + r, cz: -hd + r, start: Math.PI, end: Math.PI * 1.5 },
    { cx: hw - r, cz: -hd + r, start: Math.PI * 1.5, end: Math.PI * 2 },
  ];
  const points = [];
  for (const corner of corners) {
    for (let i = 0; i <= cornerSegments; i += 1) {
      const t = i / cornerSegments;
      const angle = corner.start + (corner.end - corner.start) * t;
      points.push([
        corner.cx + Math.cos(angle) * r,
        corner.cz + Math.sin(angle) * r,
      ]);
    }
  }
  return points;
}

function roundedRectShape(width, depth, radius, cornerSegments = 8) {
  const points = roundedRectPoints(width, depth, radius, cornerSegments);
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  return shape;
}

function roundedRectHole(width, depth, radius, cornerSegments = 8) {
  const points = roundedRectPoints(width, depth, radius, cornerSegments);
  const path = new THREE.Path();
  // Reverse for an unambiguous hole winding.
  path.moveTo(points[points.length - 1][0], points[points.length - 1][1]);
  for (let i = points.length - 2; i >= 0; i -= 1) path.lineTo(points[i][0], points[i][1]);
  path.closePath();
  return path;
}

function outerProfileAt(y) {
  if (y >= TANK.coneTop) {
    return { w: TANK.outerW, d: TANK.outerD, r: TANK.outerR };
  }
  const t = clamp((y - TANK.bottom) / (TANK.coneTop - TANK.bottom), 0, 1);
  const e = Math.pow(smoothstep(0, 1, t), 0.72);
  return {
    w: lerp(0.28, TANK.outerW, e),
    d: lerp(0.18, TANK.outerD, e),
    r: lerp(0.035, TANK.outerR, e),
  };
}

function innerProfileAt(y) {
  if (y >= TANK.coneTop) {
    return { w: TANK.innerW, d: TANK.innerD, r: TANK.innerR };
  }
  const outer = outerProfileAt(y);
  return {
    w: Math.max(0.07, outer.w - 0.14),
    d: Math.max(0.05, outer.d - 0.14),
    r: Math.max(0.02, outer.r - 0.07),
  };
}

function liquidProfileAt(y) {
  const inner = innerProfileAt(y);
  return {
    w: Math.max(0.055, inner.w * 0.988),
    d: Math.max(0.04, inner.d * 0.986),
    r: Math.max(0.018, inner.r * 0.96),
  };
}

function makeRing(w, d, r, segments = 8) {
  return roundedRectPoints(w, d, r, segments);
}

function ringToVector3(points, y) {
  return points.map(([x, z]) => new THREE.Vector3(x, y, z));
}

function buildLoftSurface(rings, closed = true) {
  const count = rings[0].length;
  const positions = [];
  const indices = [];
  for (let i = 0; i < rings.length; i += 1) {
    for (let j = 0; j < count; j += 1) {
      positions.push(rings[i][j].x, rings[i][j].y, rings[i][j].z);
    }
  }
  const maxJ = closed ? count : count - 1;
  for (let i = 0; i < rings.length - 1; i += 1) {
    for (let j = 0; j < maxJ; j += 1) {
      const j2 = (j + 1) % count;
      const a = i * count + j;
      const b = (i + 1) * count + j;
      const c = i * count + j2;
      const d = (i + 1) * count + j2;
      indices.push(a, b, c, b, d, c);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildRingCap(outerPoints, innerPoints, y) {
  const count = outerPoints.length;
  const positions = [];
  const indices = [];
  for (let j = 0; j < count; j += 1) {
    positions.push(outerPoints[j].x, y, outerPoints[j].z);
    positions.push(innerPoints[j].x, y, innerPoints[j].z);
  }
  for (let j = 0; j < count; j += 1) {
    const j2 = (j + 1) % count;
    const a = j * 2;
    const b = j * 2 + 1;
    const c = j2 * 2;
    const d = j2 * 2 + 1;
    indices.push(a, b, c, b, d, c);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function roundedBoxGeometry(width, height, depth, radius = 0.04) {
  const w = Math.max(0.001, width - radius * 2);
  const h = Math.max(0.001, height - radius * 2);
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 - radius, -h / 2 - radius);
  shape.lineTo(w / 2 + radius, -h / 2 - radius);
  shape.quadraticCurveTo(w / 2 + radius * 2, -h / 2 - radius, w / 2 + radius * 2, -h / 2);
  shape.lineTo(w / 2 + radius * 2, h / 2);
  shape.quadraticCurveTo(w / 2 + radius * 2, h / 2 + radius * 2, w / 2 + radius, h / 2 + radius * 2);
  shape.lineTo(-w / 2 - radius, h / 2 + radius * 2);
  shape.quadraticCurveTo(-w / 2 - radius * 2, h / 2 + radius * 2, -w / 2 - radius * 2, h / 2);
  shape.lineTo(-w / 2 - radius * 2, -h / 2);
  shape.quadraticCurveTo(-w / 2 - radius * 2, -h / 2 - radius, -w / 2 - radius, -h / 2 - radius);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.001, depth - radius * 2),
    bevelEnabled: true,
    bevelSegments: 3,
    bevelSize: radius,
    bevelThickness: radius,
    curveSegments: 4,
    steps: 1,
  });
  geometry.center();
  return geometry;
}

function addBox(parent, w, h, d, material, x, y, z, options = {}) {
  const object = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  object.position.set(x, y, z);
  if (options.rx) object.rotation.x = options.rx;
  if (options.ry) object.rotation.y = options.ry;
  if (options.rz) object.rotation.z = options.rz;
  parent.add(object);
  return object;
}

function addGlow(parent, color, x, y, z, scale = 0.5, opacity = 0.6) {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture,
      color,
      transparent: true,
      opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
    })
  );
  sprite.position.set(x, y, z);
  sprite.scale.set(scale, scale, 1);
  parent.add(sprite);
  return sprite;
}

function tubeFromPoints(points, radius, material, segments = 36, radialSegments = 5) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, radialSegments, false), material);
}

/* --------------------------------------------------------------------------
   Liquid surface + bubbles
   -------------------------------------------------------------------------- */

const LIQUID_ROWS = 28;
const LIQUID_SEGMENTS = 44;
const CAP_RINGS = 2;
const LIQUID_VERTEX_COUNT = (LIQUID_ROWS + CAP_RINGS) * LIQUID_SEGMENTS + 1;

const liquidPositions = new Float32Array(LIQUID_VERTEX_COUNT * 3);
const liquidColors = new Float32Array(LIQUID_VERTEX_COUNT * 3);
const liquidIndices = [];

for (let row = 0; row < LIQUID_ROWS - 1; row += 1) {
  for (let j = 0; j < LIQUID_SEGMENTS; j += 1) {
    const next = (j + 1) % LIQUID_SEGMENTS;
    const a = row * LIQUID_SEGMENTS + j;
    const b = (row + 1) * LIQUID_SEGMENTS + j;
    const c = row * LIQUID_SEGMENTS + next;
    const d = (row + 1) * LIQUID_SEGMENTS + next;
    liquidIndices.push(a, b, c, b, d, c);
  }
}
// Top cap ring connections: top side row -> cap ring 0 -> cap ring 1 -> center.
const capConnections = [
  [LIQUID_ROWS - 1, LIQUID_ROWS],
  [LIQUID_ROWS, LIQUID_ROWS + 1],
];
for (const [lowerRow, upperRow] of capConnections) {
  for (let j = 0; j < LIQUID_SEGMENTS; j += 1) {
    const next = (j + 1) % LIQUID_SEGMENTS;
    const a = lowerRow * LIQUID_SEGMENTS + j;
    const b = upperRow * LIQUID_SEGMENTS + j;
    const c = lowerRow * LIQUID_SEGMENTS + next;
    const d = upperRow * LIQUID_SEGMENTS + next;
    liquidIndices.push(a, b, c, b, d, c);
  }
}
const CAP_CENTER_INDEX = (LIQUID_ROWS + CAP_RINGS) * LIQUID_SEGMENTS;
const capRingStart = LIQUID_ROWS + CAP_RINGS - 1;
for (let j = 0; j < LIQUID_SEGMENTS; j += 1) {
  const next = (j + 1) % LIQUID_SEGMENTS;
  const a = capRingStart * LIQUID_SEGMENTS + j;
  const b = capRingStart * LIQUID_SEGMENTS + next;
  liquidIndices.push(a, CAP_CENTER_INDEX, b);
}

const liquidGeometry = new THREE.BufferGeometry();
liquidGeometry.setAttribute('position', new THREE.BufferAttribute(liquidPositions, 3));
liquidGeometry.setAttribute('color', new THREE.BufferAttribute(liquidColors, 3));
liquidGeometry.setIndex(liquidIndices);
liquidGeometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1.6, 0), 2.3);

const liquidMesh = new THREE.Mesh(liquidGeometry, materials.liquid);
liquidMesh.renderOrder = 3;
liquidMesh.frustumCulled = false;

const liquidGroup = new THREE.Group();
liquidGroup.add(liquidMesh);

function makeLineLoop(color, opacity, segments = LIQUID_SEGMENTS) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segments * 3), 3));
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const line = new THREE.LineLoop(geometry, material);
  line.renderOrder = 5;
  line.frustumCulled = false;
  return line;
}

const surfaceLines = [
  makeLineLoop(0x9ffbff, 0.68),
  makeLineLoop(0x9ffbff, 0.3),
  makeLineLoop(0x9ffbff, 0.16),
];
for (const line of surfaceLines) liquidGroup.add(line);

const levelHaloLine = makeLineLoop(0x8ef8ff, 0.13);
levelHaloLine.renderOrder = 4;
liquiGroupAddLevelHalo();
function liquiGroupAddLevelHalo() {
  liquidGroup.add(levelHaloLine);
}

const haloDot = new THREE.Mesh(
  new THREE.SphereGeometry(0.027, 10, 8),
  new THREE.MeshBasicMaterial({ color: 0x9ffbff, toneMapped: false })
);
haloDot.renderOrder = 5;
liquidGroup.add(haloDot);

// A soft sensing field sheath around the guard tube.
const fieldSheathMaterial = new THREE.MeshBasicMaterial({
  color: 0x55eaff,
  transparent: true,
  opacity: 0.045,
  blending: THREE.AdditiveBlending,
  side: THREE.DoubleSide,
  depthWrite: false,
  toneMapped: false,
});
const fieldSheath = new THREE.Mesh(
  new THREE.CylinderGeometry(0.26, 0.26, 1, 28, 1, true),
  fieldSheathMaterial
);
fieldSheath.position.set(0, 1.5, 0);
fieldSheath.renderOrder = 4;
liquidGroup.add(fieldSheath);

// Bubbles.
const bubbleCount = 32;
const bubbleGeometry = new THREE.SphereGeometry(0.018, 8, 6);
const bubbleMaterial = new THREE.MeshBasicMaterial({
  color: 0x9ff8ff,
  transparent: true,
  opacity: 0.32,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
});
const bubbles = new THREE.InstancedMesh(bubbleGeometry, bubbleMaterial, bubbleCount);
bubbles.renderOrder = 4;
bubbles.frustumCulled = false;
liquidGroup.add(bubbles);
const bubbleStates = Array.from({ length: bubbleCount }, () => ({
  x: (Math.random() - 0.5) * 1.2,
  z: (Math.random() - 0.5) * 0.7,
  y: 0.3 + Math.random() * 2.2,
  speed: 0.08 + Math.random() * 0.16,
  scale: 0.4 + Math.random() * 1.1,
}));

/* --------------------------------------------------------------------------
   Part builders — tank, sensor, electronics, scale, valve
   -------------------------------------------------------------------------- */

function buildTank() {
  const group = new THREE.Group();

  // Main rounded rectangular shell, extruded vertically as a hollow wall.
  const bodyShape = roundedRectShape(TANK.outerW, TANK.outerD, TANK.outerR, 10);
  bodyShape.holes.push(roundedRectHole(TANK.innerW, TANK.innerD, TANK.innerR, 10));
  const bodyGeometry = new THREE.ExtrudeGeometry(bodyShape, {
    depth: TANK.top - TANK.coneTop,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 12,
  });
  bodyGeometry.rotateX(-Math.PI / 2);
  const body = new THREE.Mesh(bodyGeometry, materials.glass);
  body.position.y = TANK.coneTop;
  body.renderOrder = 8;
  body.userData.noPick = true;
  group.add(body);

  // Thicker polished lip around the open mouth.
  const rimShape = roundedRectShape(TANK.outerW + 0.045, TANK.outerD + 0.045, TANK.outerR + 0.02, 10);
  rimShape.holes.push(roundedRectHole(TANK.innerW - 0.01, TANK.innerD - 0.01, TANK.innerR - 0.005, 10));
  const rimGeometry = new THREE.ExtrudeGeometry(rimShape, {
    depth: 0.065,
    bevelEnabled: true,
    bevelSegments: 2,
    bevelSize: 0.012,
    bevelThickness: 0.01,
    steps: 1,
    curveSegments: 14,
  });
  rimGeometry.rotateX(-Math.PI / 2);
  const rim = new THREE.Mesh(rimGeometry, materials.glassRim);
  rim.position.y = TANK.top - 0.015;
  rim.renderOrder = 9;
  rim.userData.noPick = true;
  group.add(rim);

  // Conical lower shell, outer + inner skin.
  const coneRingsOuter = [];
  const coneRingsInner = [];
  const coneSections = 20;
  for (let i = 0; i <= coneSections; i += 1) {
    const t = i / coneSections;
    const y = lerp(TANK.bottom, TANK.coneTop, t);
    const outer = outerProfileAt(y);
    const inner = innerProfileAt(y);
    coneRingsOuter.push(ringToVector3(makeRing(outer.w, outer.d, outer.r, 10), y));
    coneRingsInner.push(ringToVector3(makeRing(inner.w, inner.d, inner.r, 10), y));
  }
  const coneOuter = new THREE.Mesh(buildLoftSurface(coneRingsOuter, true), materials.glass);
  coneOuter.renderOrder = 8;
  coneOuter.userData.noPick = true;
  group.add(coneOuter);
  const coneInner = new THREE.Mesh(buildLoftSurface(coneRingsInner, true), materials.glass);
  coneInner.renderOrder = 8;
  coneInner.userData.noPick = true;
  group.add(coneInner);
  const coneTopCap = new THREE.Mesh(
    buildRingCap(coneRingsOuter[coneSections], coneRingsInner[coneSections], TANK.coneTop),
    materials.glass
  );
  coneTopCap.renderOrder = 8;
  coneTopCap.userData.noPick = true;
  group.add(coneTopCap);
  const coneBottomCap = new THREE.Mesh(
    buildRingCap(coneRingsOuter[0], coneRingsInner[0], TANK.bottom),
    materials.glass
  );
  coneBottomCap.renderOrder = 8;
  coneBottomCap.userData.noPick = true;
  group.add(coneBottomCap);

  // Fine glass edge lines help the transparent shell read in 3D.
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0xbef7ff,
    transparent: true,
    opacity: 0.34,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const addEdges = (object, threshold = 28, opacity = 0.34) => {
    const edgeGeometry = new THREE.EdgesGeometry(object.geometry, threshold);
    if (!edgeGeometry.attributes.position) {
      edgeGeometry.dispose();
      return;
    }
    const line = new THREE.LineSegments(edgeGeometry, edgeMaterial.clone());
    line.material.opacity = opacity;
    line.renderOrder = 10;
    group.add(line);
  };
  addEdges(body, 32, 0.34);
  addEdges(rim, 32, 0.44);
  addEdges(coneOuter, 28, 0.3);
  addEdges(coneInner, 28, 0.2);

  // Tank decal.
  const decal = new THREE.Mesh(
    new THREE.PlaneGeometry(0.54, 0.14),
    new THREE.MeshBasicMaterial({
      map: createTextTexture('CLX—2600 / LEVEL', '#bff8ff'),
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      toneMapped: false,
    })
  );
  decal.position.set(0.53, 2.74, 0.651);
  group.add(decal);

  // Small draining boss at the bottom tip.
  const bottomBoss = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.06, 18), materials.steelDark);
  bottomBoss.position.y = TANK.bottom - 0.01;
  group.add(bottomBoss);

  group.userData.pickMeshes = [];
  return group;
}

function buildSensorHead() {
  const group = new THREE.Group();

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.12, 24), materials.steel);
  neck.position.y = 3.4;
  group.add(neck);

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.215, 0.34, 36), materials.polymerBlue);
  body.position.y = 3.56;
  body.castShadow = true;
  group.add(body);

  for (let i = 0; i < 4; i += 1) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.214, 0.004, 6, 48), materials.anodized);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 3.45 + i * 0.065;
    group.add(ring);
  }

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.035, 36), materials.anodized);
  collar.position.y = 3.39;
  group.add(collar);

  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.198, 0.208, 0.16, 36), materials.polymerWhite);
  cap.position.y = 3.81;
  cap.castShadow = true;
  group.add(cap);

  const capDome = new THREE.Mesh(new THREE.SphereGeometry(0.198, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), materials.polymerWhite);
  capDome.scale.y = 0.42;
  capDome.position.y = 3.89;
  group.add(capDome);

  const capRing = new THREE.Mesh(new THREE.TorusGeometry(0.199, 0.008, 8, 48), materials.steelDark);
  capRing.rotation.x = Math.PI / 2;
  capRing.position.y = 3.89;
  group.add(capRing);

  const ledRing = new THREE.Mesh(new THREE.TorusGeometry(0.206, 0.006, 8, 48), materials.cyanGlow);
  ledRing.rotation.x = Math.PI / 2;
  ledRing.position.y = 3.64;
  group.add(ledRing);

  // Display recess behind the removable lens.
  const recess = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.022, 40), materials.blackPlastic);
  recess.rotation.x = Math.PI / 2;
  recess.position.set(0, 3.56, 0.202);
  group.add(recess);

  // Crown mark on the housing.
  const badge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.13, 0.035),
    new THREE.MeshBasicMaterial({
      map: createTextTexture('CLX', '#d8fbff'),
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      toneMapped: false,
    })
  );
  badge.position.set(0, 3.71, 0.202);
  group.add(badge);

  return group;
}

function buildDisplay() {
  const group = new THREE.Group();

  const bezel = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.014, 10, 48), materials.steel);
  bezel.position.set(0, 3.56, 0.223);
  group.add(bezel);

  const innerBezel = new THREE.Mesh(new THREE.TorusGeometry(0.131, 0.004, 8, 48), materials.amberGlow);
  innerBezel.position.set(0, 3.56, 0.232);
  group.add(innerBezel);

  displayCanvas = document.createElement('canvas');
  displayCanvas.width = displayCanvas.height = 512;
  displayContext = displayCanvas.getContext('2d');
  currentDisplayTexture = new THREE.CanvasTexture(displayCanvas);
  currentDisplayTexture.colorSpace = THREE.SRGBColorSpace;
  currentDisplayTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  displayMaterial = new THREE.MeshBasicMaterial({
    map: currentDisplayTexture,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.3), displayMaterial);
  screen.position.set(0, 3.56, 0.236);
  group.add(screen);

  const lens = new THREE.Mesh(
    new THREE.CircleGeometry(0.142, 48),
    new THREE.MeshPhysicalMaterial({
      color: 0xa9eef5,
      metalness: 0,
      roughness: 0.04,
      transparent: true,
      opacity: 0.12,
      clearcoat: 1,
      clearcoatRoughness: 0.01,
      envMapIntensity: 1.8,
      side: THREE.DoubleSide,
      depthWrite: false,
    })
  );
  lens.position.set(0, 3.56, 0.245);
  group.add(lens);

  updateHeadDisplay(true);
  return group;
}

function buildFlange() {
  const group = new THREE.Group();

  const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.265, 0.265, 0.06, 40), materials.steel);
  flange.position.y = 3.3;
  flange.castShadow = true;
  group.add(flange);

  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.032, 14), materials.steelDark);
    bolt.position.set(Math.cos(a) * 0.212, 3.34, Math.sin(a) * 0.212);
    group.add(bolt);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 6), materials.steel);
    cap.position.set(Math.cos(a) * 0.212, 3.357, Math.sin(a) * 0.212);
    group.add(cap);
  }

  const hex = new THREE.Mesh(new THREE.CylinderGeometry(0.165, 0.185, 0.11, 6), materials.steel);
  hex.position.y = 3.22;
  hex.rotation.y = Math.PI / 6;
  group.add(hex);

  const connector = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.13, 0.16, 24), materials.anodized);
  connector.position.y = 3.4;
  group.add(connector);

  return group;
}

function buildSeal() {
  const group = new THREE.Group();

  const gasket = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.022, 40), materials.ptfe);
  gasket.position.y = 3.245;
  group.add(gasket);

  const oRing = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.017, 10, 44), materials.rubber);
  oRing.rotation.x = Math.PI / 2;
  oRing.position.y = 3.257;
  group.add(oRing);

  const innerSeal = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.012, 8, 36), materials.ptfe);
  innerSeal.rotation.x = Math.PI / 2;
  innerSeal.position.y = 3.265;
  group.add(innerSeal);

  return group;
}

function buildElectrode() {
  const group = new THREE.Group();

  // Ø4-class centre rod: the inner electrode of the coaxial capacitor.
  const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.021, 0.021, 2.96, 18), materials.steel);
  rod.position.y = 1.86;
  rod.castShadow = true;
  group.add(rod);

  const topFerrule = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.044, 0.08, 16), materials.steel);
  topFerrule.position.y = 3.33;
  group.add(topFerrule);

  const bottomTip = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.07, 14), materials.steel);
  bottomTip.rotation.x = Math.PI;
  bottomTip.position.y = 0.35;
  group.add(bottomTip);

  // A tiny luminous contact marker at the current liquid level is updated each frame.
  const contactMarker = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.005, 6, 32), materials.cyanGlow);
  contactMarker.rotation.x = Math.PI / 2;
  contactMarker.renderOrder = 5;
  group.add(contactMarker);
  group.userData.contactMarker = contactMarker;

  return group;
}

function buildInsulation() {
  const group = new THREE.Group();

  // Continuous PTFE dielectric sleeve around the centre rod.
  // The annulus between this sleeve and the stainless outer tube is where
  // the process liquid enters through the outer-tube windows.
  const sleeve = new THREE.Mesh(
    new THREE.CylinderGeometry(0.042, 0.042, 2.9, 28),
    materials.ptfe
  );
  sleeve.position.y = 1.78;
  sleeve.castShadow = true;
  group.add(sleeve);

  const topCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.045, 28), materials.ptfe);
  topCollar.position.y = 3.22;
  group.add(topCollar);

  const bottomCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.051, 0.051, 0.04, 28), materials.ptfe);
  bottomCollar.position.y = 0.34;
  group.add(bottomCollar);

  // Two shallow bands show that the PTFE is a continuous insulating layer.
  for (const y of [0.62, 2.9]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.043, 0.003, 6, 32), materials.ptfe);
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    group.add(band);
  }

  return group;
}

function buildGuard() {
  const group = new THREE.Group();
  const guardHeight = 2.48;
  const centerY = 1.68;
  const radius = 0.1;

  // Four curved stainless panels form the fixed outer electrode. The four
  // longitudinal gaps between them are the liquid-entry windows. They stop
  // at the collars, so every window is closed at both ends.
  const guardMaterial = new THREE.MeshStandardMaterial({
    color: 0x5a686e,
    metalness: 0.94,
    roughness: 0.3,
    envMapIntensity: 1.28,
    side: THREE.DoubleSide,
  });
  const panelArc = THREE.MathUtils.degToRad(50);
  const quarter = (Math.PI * 2) / 4;
  const gap = quarter - panelArc;
  const azimuthOffset = THREE.MathUtils.degToRad(33);
  for (let i = 0; i < 4; i += 1) {
    const start = i * quarter + gap / 2 + azimuthOffset;
    const panel = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, guardHeight, 28, 1, true, start, panelArc),
      guardMaterial
    );
    panel.position.y = centerY;
    panel.castShadow = true;
    group.add(panel);
  }

  const topCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 28), materials.steel);
  topCollar.position.y = 2.95;
  group.add(topCollar);

  const bottomCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.05, 28), materials.steelDark);
  bottomCollar.position.y = 0.44;
  group.add(bottomCollar);

  const topSeat = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.025, 28), materials.steelDark);
  topSeat.position.y = 2.91;
  group.add(topSeat);

  const bottomSeat = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.022, 28), materials.steelDark);
  bottomSeat.position.y = 0.47;
  group.add(bottomSeat);

  // Raised machined bands around the outer tube.
  for (const y of [0.56, 2.82]) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(radius + 0.003, 0.004, 6, 48), materials.steelDark);
    band.rotation.x = Math.PI / 2;
    band.position.y = y;
    group.add(band);
  }

  return group;
}

function buildMount() {
  const group = new THREE.Group();

  const bridge = new THREE.Mesh(roundedBoxGeometry(1.92, 0.06, 0.18, 0.032), materials.anodized);
  bridge.position.y = 3.18;
  bridge.castShadow = true;
  group.add(bridge);

  const boss = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.31, 0.08, 40), materials.anodized);
  boss.position.y = 3.22;
  group.add(boss);

  for (const side of [-1, 1]) {
    const foot = new THREE.Mesh(roundedBoxGeometry(0.16, 0.06, 0.28, 0.025), materials.anodized);
    foot.position.set(side * 0.86, 3.14, 0);
    foot.rotation.z = side * -0.08;
    group.add(foot);
    const footPad = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.02, 0.2), materials.rubber);
    footPad.position.set(side * 0.86, 3.1, 0);
    group.add(footPad);

    for (let i = 0; i < 2; i += 1) {
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.015, 6), materials.steel);
      bolt.position.set(side * 0.86, 3.23, -0.07 + i * 0.14);
      group.add(bolt);
    }
  }

  const centreBolt = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 6), materials.steel);
  centreBolt.position.set(0, 3.27, 0);
  group.add(centreBolt);

  return group;
}

function buildTerminal() {
  const group = new THREE.Group();

  const gland = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.12, 24), materials.blackPlastic);
  gland.rotation.z = Math.PI / 2;
  gland.position.set(0.24, 3.56, 0.02);
  group.add(gland);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.009, 8, 24), materials.steelDark);
  ring.rotation.y = Math.PI / 2;
  ring.position.set(0.3, 3.56, 0.02);
  group.add(ring);

  const cable = tubeFromPoints(
    [
      [0.3, 3.56, 0.02],
      [0.48, 3.52, 0.18],
      [0.57, 3.32, 0.33],
      [0.5, 3.0, 0.48],
      [0.3, 2.72, 0.59],
    ],
    0.028,
    materials.cable,
    56,
    7
  );
  cable.castShadow = true;
  group.add(cable);

  const cableEnd = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.042, 0.09, 18), materials.steelDark);
  cableEnd.position.set(0.27, 2.69, 0.6);
  cableEnd.rotation.z = 0.3;
  group.add(cableEnd);

  return group;
}

function buildPCB() {
  const group = new THREE.Group();

  const board = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.014, 32), materials.pcb);
  board.position.y = 3.56;
  board.rotation.z = 0.02;
  group.add(board);

  const chipMain = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.018, 0.075), materials.chip);
  chipMain.position.set(-0.035, 3.575, -0.025);
  group.add(chipMain);

  const chipSmall = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.014, 0.035), materials.chip);
  chipSmall.position.set(0.07, 3.573, 0.045);
  group.add(chipSmall);

  const coil = new THREE.Mesh(new THREE.TorusGeometry(0.033, 0.009, 6, 20), materials.gold);
  coil.rotation.x = Math.PI / 2;
  coil.position.set(0.065, 3.575, -0.07);
  group.add(coil);

  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2;
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.004, 0.023), materials.gold);
    pad.position.set(Math.cos(a) * 0.145, 3.57, Math.sin(a) * 0.145);
    pad.rotation.y = -a;
    group.add(pad);
  }

  const header = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.022, 0.03), materials.steelDark);
  header.position.set(-0.07, 3.58, 0.09);
  group.add(header);

  return group;
}

function buildScale() {
  const group = new THREE.Group();

  const canvas = document.createElement('canvas');
  canvas.width = 192;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(3,12,16,.62)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const left = 54;
  ctx.strokeStyle = 'rgba(167,247,255,.24)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left, 32);
  ctx.lineTo(left, 990);
  ctx.stroke();
  for (let i = 0; i <= 13; i += 1) {
    const y = 32 + (i / 13) * 958;
    const major = i % 2 === 0;
    ctx.strokeStyle = major ? 'rgba(192,251,255,.76)' : 'rgba(150,226,236,.36)';
    ctx.lineWidth = major ? 2.2 : 1.2;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.lineTo(left + (major ? 34 : 20), y);
    ctx.stroke();
    if (major) {
      ctx.fillStyle = 'rgba(216,252,255,.94)';
      ctx.font = '600 24px "Cascadia Code", monospace';
      ctx.textAlign = 'left';
      ctx.fillText(String(2600 - i * 200), left + 42, y + 7);
    }
  }
  ctx.fillStyle = 'rgba(159,241,249,.72)';
  ctx.font = '600 18px "Cascadia Code", monospace';
  ctx.save();
  ctx.translate(20, 510);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.fillText('LEVEL / MM', 0, 0);
  ctx.restore();

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const scale = new THREE.Mesh(
    new THREE.PlaneGeometry(0.48, 2.56),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      toneMapped: false,
    })
  );
  scale.position.set(-0.76, 1.7, 0.658);
  group.add(scale);

  const edge = new THREE.Mesh(
    new THREE.PlaneGeometry(0.012, 2.5),
    new THREE.MeshBasicMaterial({
      color: 0x5eeeff,
      transparent: true,
      opacity: 0.26,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    })
  );
  edge.position.set(-0.998, 1.7, 0.66);
  group.add(edge);

  const markerMaterial = new THREE.MeshBasicMaterial({
    color: 0x8ef8ff,
    transparent: true,
    opacity: 0.85,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const marker = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.012, 0.01), markerMaterial);
  marker.position.set(-0.77, 1.8, 0.673);
  group.add(marker);

  const diamond = new THREE.Mesh(new THREE.CircleGeometry(0.036, 4), markerMaterial);
  diamond.position.set(-1.035, 1.8, 0.674);
  diamond.rotation.z = Math.PI / 4;
  group.add(diamond);

  group.userData.marker = marker;
  group.userData.diamond = diamond;
  group.userData.markerMaterial = markerMaterial;

  return group;
}

function buildDrain() {
  const group = new THREE.Group();

  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.19, 24), materials.steel);
  body.position.y = 0.06;
  body.castShadow = true;
  group.add(body);

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.035, 28), materials.steelDark);
  collar.position.y = 0.155;
  group.add(collar);

  const outlet = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 18), materials.steel);
  outlet.rotation.x = Math.PI / 2;
  outlet.position.set(0, 0.025, 0.2);
  group.add(outlet);

  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.012, 8, 32), materials.amberGlow);
  handle.rotation.x = Math.PI / 2;
  handle.position.set(0, 0.05, 0.32);
  group.add(handle);

  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.16, 12), materials.steelDark);
  stem.position.set(0, 0.05, 0.32);
  group.add(stem);

  const pulse = new THREE.Mesh(new THREE.SphereGeometry(0.026, 10, 8), materials.cyanGlow);
  pulse.position.set(0, 0.13, 0.34);
  group.add(pulse);
  drainPulse = pulse;

  const drop = addGlow(group, 0x74f4ff, 0, 0.02, 0.44, 0.35, 0.22);
  drop.userData.isDrainGlow = true;

  return group;
}

/* --------------------------------------------------------------------------
   Assemble device
   -------------------------------------------------------------------------- */

const device = new THREE.Group();
device.position.y = 0.015;
scene.add(device);

const PART_BUILDERS = {
  tank: buildTank,
  liquid: () => liquidGroup,
  head: buildSensorHead,
  flange: buildFlange,
  seal: buildSeal,
  electrode: buildElectrode,
  insulation: buildInsulation,
  guard: buildGuard,
  mount: buildMount,
  display: buildDisplay,
  pcb: buildPCB,
  terminal: buildTerminal,
  scale: buildScale,
  drain: buildDrain,
};

const partExtras = new Map();

function attachHighlight(part) {
  const material = new THREE.LineBasicMaterial({
    color: 0x9bf9ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  const lines = [];
  if (part.id === 'liquid') {
    part.highlightMaterial = material;
    part.highlightLines = [];
    return;
  }
  part.group.traverse((object) => {
    if (!object.isMesh || object.isInstancedMesh || !object.geometry) return;
    if (!object.geometry.attributes.position || object.geometry.attributes.position.count < 3) return;
    if (object.geometry.attributes.position.count > 20000) return;
    const edges = new THREE.EdgesGeometry(object.geometry, 32);
    if (!edges.attributes.position || edges.attributes.position.count === 0) {
      edges.dispose();
      return;
    }
    const line = new THREE.LineSegments(edges, material);
    line.scale.setScalar(1.0015);
    line.renderOrder = 7;
    line.visible = false;
    line.frustumCulled = false;
    object.add(line);
    lines.push(line);
  });
  part.highlightMaterial = material;
  part.highlightLines = lines;
}

function buildDevice() {
  for (const def of PART_DEFS) {
    const group = PART_BUILDERS[def.id]();
    const part = {
      ...def,
      group,
      basePosition: group.position.clone(),
      anchorPoint: new THREE.Vector3().fromArray(def.anchor),
      explodeVector: new THREE.Vector3().fromArray(def.explode),
      phase: Math.random() * Math.PI * 2,
      pickMeshes: [],
    };
    group.userData.part = part;
    group.traverse((object) => {
      if (object.isMesh) {
        object.castShadow = object.castShadow !== false && !object.material?.transparent;
        object.receiveShadow = true;
        object.userData.part = part;
        part.pickMeshes.push(object);
      }
    });
    device.add(group);
    parts.push(part);
    partById.set(part.id, part);
  }

  device.updateMatrixWorld(true);
  for (const part of parts) {
    const box = new THREE.Box3().setFromObject(part.group);
    const centerWorld = box.getCenter(new THREE.Vector3());
    part.centerLocal = part.group.worldToLocal(centerWorld.clone());
    part.boundsSize = box.getSize(new THREE.Vector3());
    attachHighlight(part);
    // Liquid needs a custom highlight rather than a static edge cage.
    if (part.id === 'liquid') {
      for (const line of part.highlightLines) line.visible = false;
    }
  }

  for (const part of parts) {
    part.pickMeshes = [];
    part.group.traverse((object) => {
      if (object.isMesh && !object.userData.noPick) {
        object.userData.part = part;
        part.pickMeshes.push(object);
      }
    });
  }

  // Dim the tank glass for picking: the shell is selectable via the list and
  // the open rim, while clicks through the glass can reach the probe/medium.
  const tankPart = partById.get('tank');
  tankPart.pickMeshes = tankPart.pickMeshes.filter((mesh) => !mesh.userData.noPick);
}

buildDevice();

/* --------------------------------------------------------------------------
   Selection UI / part list
   -------------------------------------------------------------------------- */

function createPartRow(part) {
  const row = document.createElement('button');
  row.type = 'button';
  row.className = 'part-row';
  row.dataset.id = part.id;
  row.setAttribute('role', 'listitem');
  row.setAttribute('aria-label', `${part.name}，${part.en}`);
  const index = document.createElement('span');
  index.className = 'part-row__index';
  index.textContent = pad2(part.index);
  const copy = document.createElement('span');
  copy.className = 'part-row__copy';
  const strong = document.createElement('strong');
  strong.textContent = part.name;
  const small = document.createElement('small');
  small.textContent = part.en;
  copy.append(strong, small);
  const meta = document.createElement('span');
  meta.className = 'part-row__meta';
  const tick = document.createElement('i');
  tick.className = 'part-row__tick';
  if (part.isFluid) tick.classList.add('is-fluid');
  const code = document.createElement('span');
  code.textContent = CATEGORY_META[part.category]?.short || part.code;
  meta.append(tick, code);
  row.append(index, copy, meta);
  row.addEventListener('click', () => selectPart(part, { fromList: true }));
  row.addEventListener('pointerenter', () => setHovered(part.id));
  row.addEventListener('pointerleave', () => setHovered(null));
  return row;
}

function renderPartsList() {
  const visible = state.filter === 'all' ? parts : parts.filter((part) => part.category === state.filter);
  dom.partsList.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (const part of visible) fragment.append(createPartRow(part));
  dom.partsList.append(fragment);
  dom.partCount.textContent = `${pad2(visible.length)} MODULES`;
  const active = dom.partsList.querySelector(`.part-row[data-id="${state.selectedId}"]`);
  if (active) active.classList.add('is-selected');
}

function setFilter(filter) {
  state.filter = filter;
  for (const button of $$('.filter')) {
    const active = button.dataset.filter === filter;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  }
  renderPartsList();
}

function scrollSelectedIntoView() {
  const row = dom.partsList.querySelector(`.part-row[data-id="${state.selectedId}"]`);
  if (row) row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

function getDynamicMetrics(part) {
  if (part.id !== 'liquid') return part.metrics;
  const mm = Math.round(state.level * 2600);
  return [
    ['相对介电常数', state.epsilon.toFixed(1), 'εr'],
    ['浓度', String(state.concentration), '%'],
    ['密度', String(currentMedium.density), 'kg/m³'],
    ['当前液位', mm.toLocaleString('en-US'), 'MM'],
  ];
}

function formatMass(part) {
  if (part.id === 'liquid') {
    const liters = 12.5 * state.level;
    const kg = (liters * currentMedium.density) / 1000;
    return `${kg.toFixed(1)} KG`;
  }
  return part.mass;
}

function renderSelection(part) {
  if (!part) return;
  const category = CATEGORY_META[part.category] || CATEGORY_META.structure;
  dom.selectionCode.textContent = part.code;
  dom.selectionIndex.textContent = pad2(part.index);
  dom.selectionCategory.textContent = category.label;
  dom.selectionName.textContent = part.name;
  dom.selectionEnglish.textContent = part.en;
  dom.selectionDescription.textContent = part.description;
  dom.selectionMaterial.textContent = part.id === 'liquid' ? currentMedium.material : part.material;
  dom.selectionMass.textContent = formatMass(part);
  dom.syncValue.textContent = `${part.sync.toFixed(1)}%`;
  dom.syncBar.style.width = `${part.sync}%`;

  dom.specGrid.replaceChildren();
  for (const [label, value, unit] of getDynamicMetrics(part)) {
    const cell = document.createElement('div');
    cell.className = 'spec-cell';
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    const valueEl = document.createElement('strong');
    valueEl.textContent = value;
    const unitEl = document.createElement('em');
    unitEl.textContent = ` ${unit}`;
    valueEl.append(unitEl);
    cell.append(labelEl, valueEl);
    dom.specGrid.append(cell);
  }
}

function refreshLiquidInfoIfNeeded() {
  if (state.selectedId !== 'liquid') return;
  const part = partById.get('liquid');
  if (!part) return;
  const metrics = getDynamicMetrics(part);
  const cells = $$('.spec-cell', dom.specGrid);
  if (cells.length === metrics.length) {
    metrics.forEach(([, value, unit], index) => {
      const strong = cells[index]?.querySelector('strong');
      if (!strong) return;
      strong.textContent = value;
      const em = document.createElement('em');
      em.textContent = ` ${unit}`;
      strong.append(em);
    });
  } else {
    renderSelection(part);
  }
  dom.selectionMaterial.textContent = currentMedium.material;
  dom.selectionMass.textContent = formatMass(part);
}

function selectPart(partOrId, options = {}) {
  const part = typeof partOrId === 'string' ? partById.get(partOrId) : partOrId;
  if (!part) return;
  if (state.filter !== 'all' && part.category !== state.filter) setFilter('all');
  state.selectedId = part.id;
  selectedPart = part;
  for (const item of parts) {
    item.group.userData.selected = item.id === part.id;
    if (item.labelElement) item.labelElement.classList.toggle('is-selected', item.id === part.id);
  }
  for (const row of $$('.part-row', dom.partsList)) {
    row.classList.toggle('is-selected', row.dataset.id === part.id);
  }
  renderSelection(part);
  if (!options.fromList) scrollSelectedIntoView();
  if (options.focus) focusPart(part);
}

/* --------------------------------------------------------------------------
   Labels
   -------------------------------------------------------------------------- */

function createLabels() {
  for (const part of parts) {
    const wrapper = document.createElement('div');
    wrapper.className = 'part-label';
    if (part.isFluid) wrapper.classList.add('is-fluid');
    wrapper.dataset.id = part.id;
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'part-label__card';
    card.setAttribute('aria-label', `查看 ${part.name}`);
    const index = document.createElement('span');
    index.className = 'part-label__index';
    index.textContent = pad2(part.index);
    const name = document.createElement('span');
    name.className = 'part-label__name';
    name.textContent = part.name;
    card.append(index, name);
    card.addEventListener('click', (event) => {
      event.stopPropagation();
      selectPart(part);
    });
    card.addEventListener('pointerenter', () => setHovered(part.id));
    card.addEventListener('pointerleave', () => setHovered(null));
    const stem = document.createElement('span');
    stem.className = 'part-label__stem';
    wrapper.append(card, stem);
    dom.labels.append(wrapper);
    part.labelElement = wrapper;
  }
}

const projectedVector = new THREE.Vector3();
const labelWorldVector = new THREE.Vector3();
const labelCameraVector = new THREE.Vector3();

function updateLabels() {
  device.updateMatrixWorld(true);
  const width = window.innerWidth;
  const height = window.innerHeight;
  const sorted = [...parts].sort((a, b) => {
    if (a.id === state.selectedId) return -1;
    if (b.id === state.selectedId) return 1;
    return a.index - b.index;
  });
  const placed = [];

  for (const part of sorted) {
    const label = part.labelElement;
    if (!label) continue;
    part.group.localToWorld(labelWorldVector.copy(part.anchorPoint));
    labelCameraVector.copy(labelWorldVector).project(camera);
    const inFront = labelCameraVector.z > -1 && labelCameraVector.z < 1;
    const screenX = (labelCameraVector.x * 0.5 + 0.5) * width;
    const screenY = (-labelCameraVector.y * 0.5 + 0.5) * height;
    const revealStart = 0.025 + (part.index - 1) * 0.005;
    const reveal = smoothstep(revealStart, revealStart + 0.13, state.explode);
    const isSelected = part.id === state.selectedId;

    if (!inFront || screenX < -100 || screenX > width + 100 || screenY < -60 || screenY > height + 60) {
      label.style.opacity = '0';
      label.classList.remove('is-visible');
      continue;
    }

    const cardWidth = Math.max(112, Math.min(182, part.name.length * 12 + 52));
    const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const topLimit = 96;
    let flipped = screenY - 52 < topLimit;
    let lift = 0;
    let drop = 0;
    let rect;

    if (flipped) {
      drop = Math.max(0, topLimit - (screenY + 18));
      rect = {
        left: screenX - cardWidth / 2,
        right: screenX + cardWidth / 2,
        top: screenY + 18 + drop,
        bottom: screenY + 47 + drop,
      };
      while (placed.some((item) => overlaps(rect, item)) && drop < 180) {
        drop += 30;
        rect = { ...rect, top: rect.top + 30, bottom: rect.bottom + 30 };
      }
    } else {
      rect = {
        left: screenX - cardWidth / 2,
        right: screenX + cardWidth / 2,
        top: screenY - 52,
        bottom: screenY - 19,
      };
      while (placed.some((item) => overlaps(rect, item)) && lift < 180) {
        lift += 30;
        rect = { ...rect, top: rect.top - 30, bottom: rect.bottom - 30 };
      }
    }
    placed.push(rect);

    label.style.transform = `translate3d(${screenX.toFixed(1)}px, ${screenY.toFixed(1)}px, 0)`;
    label.style.setProperty('--lift', `${lift}px`);
    label.style.setProperty('--drop', `${drop}px`);
    label.style.opacity = (reveal * (isSelected ? 1 : 0.84)).toFixed(2);
    label.classList.toggle('is-visible', reveal > 0.02);
    label.classList.toggle('is-selected', isSelected);
    label.classList.toggle('is-flipped', flipped);
    label.style.zIndex = isSelected ? '4' : '1';
  }
}

/* --------------------------------------------------------------------------
   Interaction / picking
   -------------------------------------------------------------------------- */

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function setHovered(id) {
  if (state.hoveredId === id) return;
  state.hoveredId = id;
  hoveredPart = id ? partById.get(id) : null;
  dom.canvas.classList.toggle('is-hovering', Boolean(hoveredPart));
}

function updatePointer(event) {
  const rect = dom.canvas.getBoundingClientRect();
  state.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  state.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  state.mouseOnCanvas = true;
}

function pickPart() {
  if (!state.mouseOnCanvas || state.pointerDown?.dragging) return null;
  pointer.copy(state.mouse);
  raycaster.setFromCamera(pointer, camera);
  const meshes = [];
  for (const part of parts) meshes.push(...part.pickMeshes);
  const hits = raycaster.intersectObjects(meshes, false);
  if (!hits.length) return null;
  let node = hits[0].object;
  while (node && !node.userData.part) node = node.parent;
  return node?.userData.part || null;
}

function updateHighlight(time) {
  const pulse = 0.72 + Math.sin(time * 0.0048) * 0.28;
  for (const part of parts) {
    const isSelected = part.id === state.selectedId;
    const isHovered = part.id === state.hoveredId;
    const active = isSelected || isHovered;
    const material = part.highlightMaterial;
    if (!material) continue;
    material.opacity = active ? (isSelected ? 0.48 : 0.26) * pulse : 0;
    material.color.set(isSelected ? 0xa8fbff : 0x63ecff);
    for (const line of part.highlightLines) line.visible = active;
  }

  // Liquid has no static edge cage: pulse its emissive and surface rim instead.
  const liquidPart = partById.get('liquid');
  if (liquidPart) {
    const active = liquidPart.id === state.selectedId || liquidPart.id === state.hoveredId;
    materials.liquid.emissiveIntensity = active ? 0.45 + pulse * 0.32 : 0.45;
    for (const line of surfaceLines) line.material.opacity = active ? 0.96 : 0.8;
  }

  if (selectedPart) {
    const center = selectedPart.centerLocal.clone();
    selectedPart.group.localToWorld(center);
    selectionLight.position.copy(center);
    selectionLight.position.y += 0.16;
    selectionLight.intensity = damp(selectionLight.intensity, 5.2, 6, 0.016);
  } else {
    selectionLight.intensity = damp(selectionLight.intensity, 0, 6, 0.016);
  }
}

/* --------------------------------------------------------------------------
   Camera
   -------------------------------------------------------------------------- */

const VIEWS = {
  hero: {
    position: new THREE.Vector3(5.8, 4.65, 8.8),
    target: new THREE.Vector3(0, 1.98, 0),
    auto: true,
    label: 'ORBIT',
  },
  front: {
    position: new THREE.Vector3(0.01, 2.15, 11.2),
    target: new THREE.Vector3(0, 2.0, 0),
    auto: false,
    label: 'FRONT',
  },
  side: {
    position: new THREE.Vector3(11.2, 2.15, 0.01),
    target: new THREE.Vector3(0, 2.0, 0),
    auto: false,
    label: 'SIDE',
  },
  top: {
    position: new THREE.Vector3(0.01, 11.2, 2.25),
    target: new THREE.Vector3(0, 1.5, 0),
    auto: false,
    label: 'TOP',
  },
};

function updateAutoRotateButton() {
  dom.autoRotateBtn.classList.toggle('is-active', state.autoRotate);
  dom.autoRotateBtn.setAttribute('aria-pressed', String(state.autoRotate));
}

function setAutoRotate(value) {
  state.autoRotate = Boolean(value);
  controls.autoRotate = state.autoRotate;
  updateAutoRotateButton();
}

function setActiveView(viewName) {
  for (const button of $$('.view-btn')) {
    button.classList.toggle('is-active', button.dataset.view === viewName);
  }
  const view = VIEWS[viewName];
  if (view) dom.viewModeLabel.textContent = view.label;
}

function flyTo(position, target, duration = 950, onDone = null) {
  state.tween = {
    startedAt: performance.now(),
    duration,
    fromPosition: camera.position.clone(),
    toPosition: position.clone(),
    fromTarget: controls.target.clone(),
    toTarget: target.clone(),
    onDone,
  };
  controls.enabled = false;
  controls.autoRotate = false;
}

function updateCameraTween(now) {
  if (!state.tween) return;
  const tween = state.tween;
  const t = clamp((now - tween.startedAt) / tween.duration, 0, 1);
  const eased = easeOutCubic(t);
  camera.position.lerpVectors(tween.fromPosition, tween.toPosition, eased);
  controls.target.lerpVectors(tween.fromTarget, tween.toTarget, eased);
  controls.update();
  if (t >= 1) {
    state.tween = null;
    controls.enabled = true;
    controls.autoRotate = state.autoRotate;
    if (typeof tween.onDone === 'function') tween.onDone();
  }
}

function applyView(viewName) {
  const view = VIEWS[viewName];
  if (!view) return;
  setAutoRotate(view.auto);
  setActiveView(viewName);
  flyTo(view.position, view.target, 1050);
}

function focusPart(part) {
  if (!part) return;
  setAutoRotate(false);
  setActiveView(null);
  dom.viewModeLabel.textContent = 'FOCUS';
  const center = part.centerLocal.clone();
  part.group.localToWorld(center);
  const direction = camera.position.clone().sub(controls.target);
  if (direction.lengthSq() < 0.001) direction.set(1, 0.7, 1);
  direction.normalize();
  const bounds = part.boundsSize || new THREE.Vector3(1.2, 1.2, 1.2);
  const radius = Math.max(bounds.x, bounds.y, bounds.z);
  const distance = clamp(radius * 2.45 + 1.8, 3.0, 10.5);
  const target = center.clone();
  const position = center.clone().add(direction.multiplyScalar(distance));
  position.y = Math.max(0.5, position.y);
  flyTo(position, target, 920, () => {
    controls.minDistance = 2.3;
    controls.update();
  });
}

function resetView() {
  setAutoRotate(true);
  setActiveView('hero');
  const view = VIEWS.hero;
  flyTo(view.position, view.target, 950, () => {
    controls.minDistance = 3.2;
  });
}

/* --------------------------------------------------------------------------
   Material / measurement state
   -------------------------------------------------------------------------- */

const FLUID_LIGHT_BASE = new THREE.Color();

function hexToRgba(hex, alpha) {
  const color = new THREE.Color(hex);
  const r = Math.round(color.r * 255);
  const g = Math.round(color.g * 255);
  const b = Math.round(color.b * 255);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function updateFluidTargets() {
  currentMedium = MEDIA[state.medium] || MEDIA.water;
  const t = state.concentration / 100;
  state.epsilon = lerp(currentMedium.epsilonLow, currentMedium.epsilonHigh, t);
  const low = new THREE.Color(currentMedium.colorLow);
  const high = new THREE.Color(currentMedium.colorHigh);
  state.targetColor.copy(low).lerp(high, t);
  state.displayDirty = true;
  dom.fluidGradient.style.background = `linear-gradient(90deg, ${currentMedium.colorLow}, ${currentMedium.colorHigh})`;
  dom.fluidMarker.style.left = `${state.concentration}%`;
  dom.liveMedium.textContent = `${currentMedium.symbol} / ${currentMedium.en}`;
  dom.stageFluid.textContent = `${currentMedium.symbol} / εr ${state.epsilon.toFixed(1)}`;
  dom.legendMaterial.textContent = currentMedium.name;
  dom.legendConcentration.textContent = `${state.concentration}%`;
  dom.concentrationValue.textContent = `${state.concentration}%`;
  dom.epsilonValue.textContent = `εr ${state.epsilon.toFixed(1)}`;
  dom.epsilonValue.style.color = currentMedium.colorHigh;
  for (const chip of $$('.medium-chip')) {
    chip.classList.toggle('is-active', chip.dataset.medium === state.medium);
  }
  dom.concentrationSlider.style.setProperty('--pct', `${state.concentration}%`);
  dom.concentrationSlider.value = String(state.concentration);
  dom.liveEr.textContent = state.epsilon.toFixed(1);
  refreshLiquidInfoIfNeeded();
}

function updateUiColors() {
  const color = state.currentColor;
  const css = `#${color.getHexString()}`;
  const rgb = color.clone().convertLinearToSRGB();
  const r = Math.round(rgb.r * 255);
  const g = Math.round(rgb.g * 255);
  const b = Math.round(rgb.b * 255);
  const soft = `rgba(${r}, ${g}, ${b}, 0.34)`;
  const glow = `rgba(${r}, ${g}, ${b}, 0.16)`;
  dom.app.style.setProperty('--fluid', css);
  dom.app.style.setProperty('--fluid-soft', soft);
  dom.app.style.setProperty('--fluid-glow', glow);
  dom.stageFluid.style.color = css;
  dom.liveMedium.style.color = css;
  dom.legendConcentration.style.color = css;
  dom.epsilonValue.style.color = css;
  materials.liquid.color.copy(color);
  materials.liquid.emissive.copy(color).multiplyScalar(0.22);
  fieldSheathMaterial.color.copy(color);
  bubbleMaterial.color.copy(color);
  for (const line of surfaceLines) line.material.color.copy(color);
  levelHaloLine.material.color.copy(color);
  haloDot.material.color.copy(color);
  fluidFloorRingMaterial.color.copy(color);
  fluidLight.color.copy(color);
  drainLight.color.copy(color);
  const scalePart = partById.get('scale');
  if (scalePart) {
    scalePart.group.userData.markerMaterial.color.copy(color);
  }
}

function setMedium(key) {
  if (!MEDIA[key]) return;
  state.medium = key;
  updateFluidTargets();
  const part = partById.get('liquid');
  if (part) part.material = currentMedium.material;
  if (state.selectedId === 'liquid') renderSelection(partById.get('liquid'));
  if (state.booted) showToast(`介质切换：${currentMedium.name} · εr ${state.epsilon.toFixed(1)}`);
}

function setConcentration(value) {
  state.concentration = clamp(Math.round(value), 0, 100);
  updateFluidTargets();
  state.displayDirty = true;
}

function setLevelTarget(value, flow = 'auto') {
  state.levelTarget = clamp(value, 0, 1);
  if (flow === 'fill') state.flowMode = 'fill';
  else if (flow === 'drain') state.flowMode = 'drain';
  else state.flowMode = state.levelTarget > state.level + 0.001
    ? 'fill'
    : state.levelTarget < state.level - 0.001
      ? 'drain'
      : 'stable';
  dom.levelSlider.value = String(Math.round(state.levelTarget * 100));
  dom.levelSlider.style.setProperty('--pct', `${state.levelTarget * 100}%`);
  state.displayDirty = true;
}

/* --------------------------------------------------------------------------
   Liquid rendering / measurement
   -------------------------------------------------------------------------- */

function ripple(angle, radial, time, energy) {
  const amp = 0.01 + energy * 0.025;
  const waveA = Math.sin(angle * 3 + time * 1.8 + radial * 3.5);
  const waveB = Math.sin(angle * 6 - time * 2.35 + radial * 7.0) * 0.45;
  return amp * (waveA + waveB) * (0.35 + radial * 0.8);
}

function updateLiquid(time, delta) {
  const part = partById.get('liquid');
  if (!part) return;
  const topY = LIQUID_BOTTOM + state.level * (LIQUID_TOP - LIQUID_BOTTOM);
  const flowEnergy = state.flowMode === 'stable' ? 0.15 : 0.75;
  liquidMesh.visible = state.level > 0.0035;
  if (!liquidMesh.visible) {
    for (const line of surfaceLines) line.visible = false;
    levelHaloLine.visible = false;
    haloDot.visible = false;
    fieldSheath.visible = false;
    bubbles.visible = false;
    return;
  }
  for (const line of surfaceLines) line.visible = true;
  levelHaloLine.visible = true;
  haloDot.visible = true;
  fieldSheath.visible = true;
  bubbles.visible = state.level > 0.02;

  const pos = liquidPositions;
  const colorArr = liquidColors;
  let index = 0;

  for (let row = 0; row < LIQUID_ROWS; row += 1) {
    const t = row / (LIQUID_ROWS - 1);
    const y = lerp(LIQUID_BOTTOM, topY, t);
    const profile = liquidProfileAt(y);
    const ring = roundedRectPoints(profile.w, profile.d, profile.r, 10);
    const topWeight = smoothstep(0.7, 1, t);
    const rimWave = ripple(0, 1, time, flowEnergy) * topWeight;
    for (let j = 0; j < LIQUID_SEGMENTS; j += 1) {
      const pointIndex = Math.floor((j / LIQUID_SEGMENTS) * ring.length) % ring.length;
      const p = ring[pointIndex];
      const angle = (j / LIQUID_SEGMENTS) * Math.PI * 2;
      const wave = row === LIQUID_ROWS - 1 ? ripple(angle, 1, time, flowEnergy) : 0;
      pos[index * 3] = p[0];
      pos[index * 3 + 1] = y + wave + rimWave * 0.2;
      pos[index * 3 + 2] = p[1];
      const brightness = 0.56 + 0.55 * Math.pow(t, 0.72) + wave * 16;
      colorArr[index * 3] = brightness;
      colorArr[index * 3 + 1] = brightness;
      colorArr[index * 3 + 2] = brightness;
      index += 1;
    }
  }

  // Rippled top cap rings.
  const topProfile = liquidProfileAt(topY);
  const capScales = [0.7, 0.36];
  for (let cap = 0; cap < CAP_RINGS; cap += 1) {
    const scale = capScales[cap];
    const ring = roundedRectPoints(topProfile.w * scale, topProfile.d * scale, topProfile.r * scale, 10);
    for (let j = 0; j < LIQUID_SEGMENTS; j += 1) {
      const pointIndex = Math.floor((j / LIQUID_SEGMENTS) * ring.length) % ring.length;
      const p = ring[pointIndex];
      const angle = (j / LIQUID_SEGMENTS) * Math.PI * 2;
      const wave = ripple(angle, scale, time, flowEnergy);
      pos[index * 3] = p[0];
      pos[index * 3 + 1] = topY + wave;
      pos[index * 3 + 2] = p[1];
      const brightness = 1.05 + wave * 4;
      colorArr[index * 3] = brightness;
      colorArr[index * 3 + 1] = brightness;
      colorArr[index * 3 + 2] = brightness;
      index += 1;
    }
  }
  pos[index * 3] = 0;
  pos[index * 3 + 1] = topY + ripple(0, 0.05, time, flowEnergy);
  pos[index * 3 + 2] = 0;
  colorArr[index * 3] = 1.08;
  colorArr[index * 3 + 1] = 1.08;
  colorArr[index * 3 + 2] = 1.08;

  liquidGeometry.attributes.position.needsUpdate = true;
  liquidGeometry.attributes.color.needsUpdate = true;
  liquidGeometry.computeVertexNormals();

  // Surface concentric lines.
  const outerTopProfile = liquidProfileAt(topY);
  const outerRing = roundedRectPoints(outerTopProfile.w, outerTopProfile.d, outerTopProfile.r, 10);
  const lineSpecs = [
    { line: surfaceLines[0], scale: 1, source: outerRing },
    { line: surfaceLines[1], scale: 0.7, source: null },
    { line: surfaceLines[2], scale: 0.36, source: null },
  ];
  for (const spec of lineSpecs) {
    const ring = spec.source || roundedRectPoints(
      outerTopProfile.w * spec.scale,
      outerTopProfile.d * spec.scale,
      outerTopProfile.r * spec.scale,
      10
    );
    const attr = spec.line.geometry.attributes.position;
    for (let j = 0; j < LIQUID_SEGMENTS; j += 1) {
      const p = ring[Math.floor((j / LIQUID_SEGMENTS) * ring.length) % ring.length];
      const angle = (j / LIQUID_SEGMENTS) * Math.PI * 2;
      const wave = ripple(angle, spec.scale, time, flowEnergy);
      attr.array[j * 3] = p[0];
      attr.array[j * 3 + 1] = topY + wave + 0.004;
      attr.array[j * 3 + 2] = p[1];
    }
    attr.needsUpdate = true;
  }

  // External halo ring around the tank at the liquid level.
  const haloRing = roundedRectPoints(2.265, 1.425, 0.27, 10);
  const haloAttr = levelHaloLine.geometry.attributes.position;
  for (let j = 0; j < LIQUID_SEGMENTS; j += 1) {
    const p = haloRing[Math.floor((j / LIQUID_SEGMENTS) * haloRing.length) % haloRing.length];
    haloAttr.array[j * 3] = p[0];
    haloAttr.array[j * 3 + 1] = topY;
    haloAttr.array[j * 3 + 2] = p[1];
  }
  haloAttr.needsUpdate = true;
  haloDot.position.set(0, topY, 0.74);
  haloDot.scale.setScalar(0.75 + Math.sin(time * 2.2) * 0.2);

  // Field sheath from tank bottom to liquid surface.
  const sheathHeight = Math.max(0.01, topY - 0.24);
  fieldSheath.scale.set(1, sheathHeight, 1);
  fieldSheath.position.y = 0.24 + sheathHeight / 2;
  fieldSheathMaterial.opacity = 0.026 + Math.min(0.06, (state.epsilon / 100) * 0.05);

  // Scale marker follows the liquid column.
  const scalePart = partById.get('scale');
  if (scalePart) {
    const localY = 0.47 + state.level * 2.44;
    scalePart.group.userData.marker.position.y = localY;
    scalePart.group.userData.diamond.position.y = localY;
    scalePart.group.userData.markerMaterial.color.copy(state.currentColor);
  }

  // Probe contact ring at the liquid line.
  const electrodePart = partById.get('electrode');
  if (electrodePart) {
    const marker = electrodePart.group.userData.contactMarker;
    marker.position.y = topY;
    marker.material.color.copy(state.currentColor);
    marker.visible = state.level > 0.03;
  }

  // Bubbles.
  const speedMultiplier = state.flowMode === 'stable' ? 1 : 2.6;
  const direction = state.flowMode === 'drain' ? -1 : 1;
  const dummy = new THREE.Object3D();
  for (let i = 0; i < bubbleCount; i += 1) {
    const bubble = bubbleStates[i];
    bubble.y += bubble.speed * speedMultiplier * direction * Math.max(0.008, delta);
    if (direction > 0 && bubble.y > topY - 0.03) {
      bubble.y = LIQUID_BOTTOM + 0.09 + Math.random() * 0.35;
      bubble.x = (Math.random() - 0.5) * 1.15;
      bubble.z = (Math.random() - 0.5) * 0.64;
    }
    if (direction < 0 && bubble.y < LIQUID_BOTTOM + 0.03) {
      bubble.y = Math.max(LIQUID_BOTTOM + 0.12, topY - 0.08 - Math.random() * 0.4);
      bubble.x = (Math.random() - 0.5) * 1.15;
      bubble.z = (Math.random() - 0.5) * 0.64;
    }
    const visible = bubble.y > LIQUID_BOTTOM && bubble.y < topY - 0.015;
    dummy.position.set(bubble.x, bubble.y, bubble.z);
    const s = visible ? bubble.scale : 0.0001;
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    bubbles.setMatrixAt(i, dummy.matrix);
  }
  bubbles.instanceMatrix.needsUpdate = true;
}

function updateMeasurement() {
  const level = state.level;
  const mm = Math.round(level * 2600);
  const capacitance = 16.8 + 2.9 * level * (state.epsilon - 1);
  const current = 4 + 16 * level;
  const circumference = 2 * Math.PI * 45;

  dom.levelPercent.textContent = (level * 100).toFixed(1);
  dom.levelMm.textContent = mm.toLocaleString('en-US');
  dom.liveCap.textContent = capacitance.toFixed(1);
  dom.liveCurrent.textContent = current.toFixed(2);
  dom.liveEr.textContent = state.epsilon.toFixed(1);
  dom.topCurrent.textContent = current.toFixed(2);
  dom.levelValue.textContent = `${Math.round(level * 100)}%`;
  dom.levelArc.style.strokeDasharray = `${circumference}`;
  dom.levelArc.style.strokeDashoffset = `${circumference * (1 - level)}`;

  const flowActive = state.flowMode !== 'stable';
  dom.flowStatus.textContent = flowActive
    ? state.flowMode === 'fill' ? '注入中' : '排出中'
    : 'STABLE';
  dom.flowStatus.classList.toggle('is-filling', state.flowMode === 'fill');
  dom.flowStatus.classList.toggle('is-draining', state.flowMode === 'drain');
  dom.levelFlow.textContent = flowActive
    ? `${(state.flowMode === 'fill' ? 6.8 : 5.9).toFixed(1)} L/min`
    : '0.0 L/min';
  dom.fillBtn.classList.toggle('is-active', state.flowMode === 'fill');
  dom.drainBtn.classList.toggle('is-active', state.flowMode === 'drain');
  dom.livePillText.textContent = state.flowMode === 'fill'
    ? 'FILLING'
    : state.flowMode === 'drain'
      ? 'DRAINING'
      : 'SIGNAL OK';
  dom.projectState.textContent = state.flowMode === 'stable' ? 'LIVE PROCESS' : 'FLUID TRANSFER';
  if (selectedPart?.id === 'liquid') refreshLiquidInfoIfNeeded();
}

function updateHeadDisplay(force = false) {
  if (!displayContext || !currentDisplayTexture) return;
  if (!force && performance.now() - state.lastDisplayUpdate < 120) return;
  state.lastDisplayUpdate = performance.now();
  const ctx = displayContext;
  const size = 512;
  const color = `#${state.currentColor.getHexString()}`;
  const mm = Math.round(state.level * 2600);
  const current = 4 + 16 * state.level;
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, 244, 0, Math.PI * 2);
  ctx.fillStyle = '#030a0e';
  ctx.fill();
  const glow = ctx.createRadialGradient(256, 265, 12, 256, 265, 235);
  glow.addColorStop(0, 'rgba(20,96,112,.42)');
  glow.addColorStop(1, 'rgba(2,8,11,.94)');
  ctx.fillStyle = glow;
  ctx.fill();
  ctx.lineWidth = 8;
  ctx.strokeStyle = 'rgba(115,239,250,.36)';
  ctx.beginPath();
  ctx.arc(256, 256, 230, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.lineWidth = 12;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(256, 256, 200, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * state.level);
  ctx.stroke();
  for (let i = 0; i <= 24; i += 1) {
    const angle = -Math.PI / 2 + (i / 24) * Math.PI * 2;
    const inner = i % 6 === 0 ? 173 : 183;
    ctx.strokeStyle = i / 24 <= state.level ? 'rgba(201,252,255,.9)' : 'rgba(111,170,178,.25)';
    ctx.lineWidth = i % 6 === 0 ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(256 + Math.cos(angle) * inner, 256 + Math.sin(angle) * inner);
    ctx.lineTo(256 + Math.cos(angle) * 195, 256 + Math.sin(angle) * 195);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(143,197,204,.75)';
  ctx.font = '500 22px "Cascadia Code", monospace';
  ctx.textAlign = 'center';
  ctx.fillText('CAP LEVEL', 256, 116);
  ctx.fillStyle = '#e8fdff';
  ctx.font = '400 116px "Bahnschrift", "Segoe UI", sans-serif';
  ctx.fillText(`${(state.level * 100).toFixed(1)}%`, 256, 270);
  ctx.fillStyle = color;
  ctx.font = '500 28px "Cascadia Code", monospace';
  ctx.fillText(`${mm.toLocaleString('en-US')} mm`, 256, 324);
  ctx.fillStyle = 'rgba(155,203,209,.7)';
  ctx.font = '500 19px "Cascadia Code", monospace';
  ctx.fillText(`${current.toFixed(2)} mA  ·  εr ${state.epsilon.toFixed(1)}`, 256, 374);
  ctx.fillStyle = 'rgba(106,160,168,.6)';
  ctx.font = '500 16px "Cascadia Code", monospace';
  ctx.fillText('4–20 mA / HART 7', 256, 410);
  ctx.restore();
  currentDisplayTexture.needsUpdate = true;
}

function updateMeasurementColors() {
  const color = state.currentColor;
  dom.levelArc.style.stroke = `#${color.getHexString()}`;
  if (displayMaterial) displayMaterial.color.set(0xffffff);
}

/* --------------------------------------------------------------------------
   Explosion / camera zoom
   -------------------------------------------------------------------------- */

function updateExplodeLabel() {
  const target = state.explodeTarget;
  dom.explodeBtn.classList.toggle('is-active', target > 0.5);
  dom.explodeBtn.setAttribute('aria-pressed', String(target > 0.5));
  if (target >= 0.995) dom.explodeLabel.textContent = '重新装配';
  else if (target > 0.01) dom.explodeLabel.textContent = '完成拆解';
  else dom.explodeLabel.textContent = '一键拆解';
  dom.explodeSlider.value = String(Math.round(target * 100));
  dom.explodeSlider.style.setProperty('--pct', `${target * 100}%`);
}

function setExplodeTarget(value) {
  state.explodeTarget = clamp(value, 0, 1);
  updateExplodeLabel();
}

function toggleExplode() {
  setExplodeTarget(state.explodeTarget > 0.5 ? 0 : 1);
}

function updateExplode(delta, elapsed) {
  state.explode = damp(state.explode, state.explodeTarget, 5.0, delta);
  if (Math.abs(state.explode - state.explodeTarget) < 0.00035) state.explode = state.explodeTarget;
  const eased = state.explode * state.explode * (3 - 2 * state.explode);

  for (const part of parts) {
    const drift = Math.sin(elapsed * 0.85 + part.phase) * 0.007 * eased;
    part.group.position.copy(part.basePosition);
    part.group.position.addScaledVector(part.explodeVector, eased);
    part.group.position.y += drift;
  }

  const baseZoom = window.innerWidth >= 1500
    ? 1
    : window.innerWidth >= 1240
      ? 0.93
      : window.innerWidth >= 980
        ? 0.8
        : window.innerWidth >= 720
          ? 0.56
          : 0.46;
  const targetZoom = baseZoom * (1 - eased * 0.16);
  if (Math.abs(camera.zoom - targetZoom) > 0.0002) {
    camera.zoom = targetZoom;
    camera.updateProjectionMatrix();
  }

  dom.explodeValue.textContent = `${Math.round(state.explode * 100)}%`;
}

/* --------------------------------------------------------------------------
   UI events / helpers
   -------------------------------------------------------------------------- */

function showToast(message, duration = 2300) {
  window.clearTimeout(toastTimer);
  dom.toast.textContent = message;
  dom.toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => dom.toast.classList.remove('is-visible'), duration);
}

function updateClock() {
  // Kept intentionally lightweight; the scene has no wall-clock dependency.
  const now = new Date();
  dom.projectState.dataset.time = `${now.getHours()}:${now.getMinutes()}`;
}

function updateFps(delta) {
  state.fpsFrames += 1;
  state.fpsTime += delta;
  if (state.fpsTime > 0.55) {
    const fps = Math.round(state.fpsFrames / state.fpsTime);
    dom.fps.textContent = String(clamp(fps, 0, 240));
    state.fpsFrames = 0;
    state.fpsTime = 0;
  }
}

function makeSnapshot() {
  renderer.render(scene, camera);
  try {
    const dataUrl = renderer.domElement.toDataURL('image/png');
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `CAP-LEVEL-X1-${Date.now()}.png`;
    document.body.append(link);
    link.click();
    link.remove();
    showToast('3D 快照已生成');
  } catch {
    showToast('快照生成失败');
  }
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen?.().catch(() => showToast('当前浏览器不支持全屏'));
  } else {
    document.exitFullscreen?.();
  }
}

function bootSequence() {
  let progress = 0;
  const messages = [
    [0, 'BOOTING MEASUREMENT CORE'],
    [18, 'MAPPING RESERVOIR GEOMETRY'],
    [42, 'CALIBRATING CAPACITANCE CHANNEL'],
    [66, 'LOADING DIELECTRIC LIBRARY'],
    [86, 'SYNCING PROCESS DISPLAY'],
    [100, 'SYSTEM READY'],
  ];
  const timer = window.setInterval(() => {
    progress = Math.min(100, progress + 6 + Math.random() * 7);
    dom.bootBar.style.width = `${progress}%`;
    dom.bootPercent.textContent = `${pad2(Math.round(progress))}%`;
    let label = messages[0][1];
    for (const [threshold, message] of messages) if (progress >= threshold) label = message;
    dom.bootStatus.textContent = label;
    if (progress >= 100) {
      window.clearInterval(timer);
      window.setTimeout(() => {
        state.booted = true;
        window.__CAPLEVEL_BOOTED = true;
        dom.boot.classList.add('is-ready');
        window.setTimeout(() => showToast('拖拽旋转 · 点击零件查看结构', 2600), 700);
      }, 500);
    }
  }, 75);
}

function handleResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(width, height, false);
}

/* --------------------------------------------------------------------------
   Wire events
   -------------------------------------------------------------------------- */

for (const button of $$('.filter')) button.addEventListener('click', () => setFilter(button.dataset.filter));
for (const button of $$('.view-btn')) button.addEventListener('click', () => applyView(button.dataset.view));

dom.explodeBtn.addEventListener('click', toggleExplode);
dom.explodeSlider.addEventListener('input', (event) => setExplodeTarget(Number(event.target.value) / 100));
dom.levelSlider.addEventListener('input', (event) => setLevelTarget(Number(event.target.value) / 100));
dom.fillBtn.addEventListener('click', () => {
  setLevelTarget(1, 'fill');
  showToast('开始注入液体');
});
dom.drainBtn.addEventListener('click', () => {
  setLevelTarget(0, 'drain');
  showToast('开始排出液体');
});
for (const chip of $$('.medium-chip')) {
  chip.addEventListener('click', () => setMedium(chip.dataset.medium));
}
dom.concentrationSlider.addEventListener('input', (event) => setConcentration(Number(event.target.value)));
dom.autoRotateBtn.addEventListener('click', () => {
  setAutoRotate(!state.autoRotate);
  if (state.autoRotate) showToast('自动旋转已开启');
});
dom.snapshotBtn.addEventListener('click', makeSnapshot);
dom.focusBtn.addEventListener('click', () => focusPart(selectedPart));
dom.resetBtn.addEventListener('click', () => {
  resetView();
  setExplodeTarget(0);
});
dom.fullscreenBtn.addEventListener('click', toggleFullscreen);

dom.canvas.addEventListener('pointerdown', (event) => {
  state.pointerDown = { x: event.clientX, y: event.clientY, time: performance.now(), dragging: false };
  dom.canvas.classList.add('is-dragging');
});

dom.canvas.addEventListener('pointermove', (event) => {
  updatePointer(event);
  if (state.pointerDown) {
    const distance = Math.hypot(event.clientX - state.pointerDown.x, event.clientY - state.pointerDown.y);
    if (distance > 6) state.pointerDown.dragging = true;
  }
  setHovered(pickPart()?.id || null);
});

dom.canvas.addEventListener('pointerup', (event) => {
  const down = state.pointerDown;
  state.pointerDown = null;
  dom.canvas.classList.remove('is-dragging');
  if (!down) return;
  const distance = Math.hypot(event.clientX - down.x, event.clientY - down.y);
  if (distance < 6 && performance.now() - down.time < 700) {
    updatePointer(event);
    const part = pickPart();
    if (part) selectPart(part);
  }
});

dom.canvas.addEventListener('pointerleave', () => {
  state.mouseOnCanvas = false;
  state.pointerDown = null;
  dom.canvas.classList.remove('is-dragging');
  setHovered(null);
});

dom.canvas.addEventListener('dblclick', (event) => {
  updatePointer(event);
  const part = pickPart();
  if (part) focusPart(part);
});

controls.addEventListener('start', () => {
  if (!state.tween) {
    setActiveView(null);
    dom.viewModeLabel.textContent = 'ORBIT';
  }
});

window.addEventListener('resize', handleResize);
document.addEventListener('fullscreenchange', handleResize);

window.addEventListener('keydown', (event) => {
  const tag = event.target?.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON') return;
  if (event.code === 'Space') {
    event.preventDefault();
    toggleExplode();
  } else if (event.code === 'KeyD') {
    toggleExplode();
  } else if (event.code === 'KeyR') {
    resetView();
    setExplodeTarget(0);
  } else if (event.code === 'KeyA') {
    setAutoRotate(!state.autoRotate);
  } else if (event.code === 'KeyF') {
    setLevelTarget(1, 'fill');
  } else if (event.code === 'KeyG') {
    setLevelTarget(0, 'drain');
  }
});

/* --------------------------------------------------------------------------
   Animation loop
   -------------------------------------------------------------------------- */

const clock = new THREE.Clock();

function animate(now) {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;

  // Simulate the physical level toward its target.
  state.previousLevel = state.level;
  state.level = damp(state.level, state.levelTarget, 1.65, delta);
  if (Math.abs(state.level - state.levelTarget) < 0.001) {
    state.level = state.levelTarget;
    if (state.flowMode !== 'stable') state.flowMode = 'stable';
  } else if (state.flowMode === 'stable') {
    state.flowMode = state.levelTarget > state.level ? 'fill' : 'drain';
  }
  state.wavePhase += delta * (0.9 + (state.flowMode === 'stable' ? 0 : 2.2));

  state.currentColor.lerp(state.targetColor, 1 - Math.exp(-4.2 * delta));
  updateUiColors();
  updateExplode(delta, elapsed);
  updateLiquid(state.wavePhase, delta);
  updateCameraTween(now);
  controls.autoRotate = state.autoRotate && !state.tween;
  controls.update();
  updateHighlight(now);
  updateLabels(now);

  // Liquid-reactive light and scene motion.
  const levelMid = LIQUID_BOTTOM + state.level * (LIQUID_TOP - LIQUID_BOTTOM) * 0.55;
  fluidLight.position.y = levelMid;
  fluidLight.intensity = 3.4 + state.level * 3.1;
  drainLight.intensity = state.flowMode === 'stable'
    ? 0
    : 2.6 + Math.sin(elapsed * 9) * 1.2;
  if (drainPulse) {
    const target = state.flowMode === 'stable' ? 0.65 : 1.35;
    drainPulse.scale.setScalar(damp(drainPulse.scale.x, target, 7, delta));
  }
  if (holoGroup) holoGroup.rotation.y += delta * 0.06;
  if (particleField) {
    particleField.rotation.y -= delta * 0.007;
    particleField.position.y = Math.sin(elapsed * 0.13) * 0.08;
  }

  if (now - state.lastDisplayUpdate > 120) updateHeadDisplay();
  if (now - state.lastUiUpdate > 80) {
    updateMeasurement();
    state.lastUiUpdate = now;
  }

  updateFps(delta);
  renderer.render(scene, camera);
}

/* --------------------------------------------------------------------------
   Init
   -------------------------------------------------------------------------- */

createLabels();
renderPartsList();
setFilter('all');
selectPart(partById.get('tank'), { fromList: true });
updateFluidTargets();
updateUiColors();
updateMeasurement();
updateHeadDisplay(true);
updateExplodeLabel();
updateAutoRotateButton();
setAutoRotate(state.autoRotate);

const query = new URLSearchParams(window.location.search);
let instantState = false;
if (query.has('level')) {
  const value = clamp(Number(query.get('level')) || 0, 0, 1);
  state.level = value;
  state.levelTarget = value;
  state.previousLevel = value;
  state.flowMode = 'stable';
  dom.levelSlider.value = String(Math.round(value * 100));
  dom.levelSlider.style.setProperty('--pct', `${value * 100}%`);
  instantState = true;
}
if (query.has('medium') && MEDIA[query.get('medium')]) {
  setMedium(query.get('medium'));
  instantState = true;
}
if (query.has('conc')) {
  setConcentration(Number(query.get('conc')) || 0);
  instantState = true;
}
if (query.has('explode')) {
  const value = clamp(Number(query.get('explode')) || 0, 0, 1);
  state.explode = value;
  setExplodeTarget(value);
}
if (query.has('auto')) setAutoRotate(query.get('auto') !== '0');
if (query.has('view') && VIEWS[query.get('view')]) {
  const view = VIEWS[query.get('view')];
  camera.position.copy(view.position);
  controls.target.copy(view.target);
  controls.update();
  setAutoRotate(query.has('auto') ? query.get('auto') !== '0' : view.auto);
  setActiveView(query.get('view'));
}
if (query.has('cam')) {
  const [x, y, z] = query.get('cam').split(',').map(Number);
  if ([x, y, z].every(Number.isFinite)) camera.position.set(x, y, z);
}
if (query.has('target')) {
  const [x, y, z] = query.get('target').split(',').map(Number);
  if ([x, y, z].every(Number.isFinite)) controls.target.set(x, y, z);
}
if (query.has('cam') || query.has('target')) {
  setAutoRotate(false);
  controls.update();
}
if (query.get('noboot') === '1') {
  state.booted = true;
  window.__CAPLEVEL_BOOTED = true;
  dom.boot.classList.add('is-ready');
} else {
  bootSequence();
}
if (query.get('ui') === '0') document.body.classList.add('hide-ui');
if (instantState) {
  state.currentColor.copy(state.targetColor);
  updateUiColors();
  updateLiquid(state.wavePhase, 1 / 60);
  updateMeasurement();
  updateHeadDisplay(true);
}

requestAnimationFrame(animate);
