const CELL = 1;              
const MIN_RADIUS = 0.5 + 1 * CELL; 
const DIG_RADIUS = 8;         
const STEP = 1;               
const TAPER_LEN = 50;         
const FOLLOW = 0.45;          
const SPEED_FULL = 30;        
const MAX_SPEED = 20;          
const MAX_DEPTH = 650;
const MAX_RAISE = 60;         
const BLEED_DELAY_SHALLOW = 600; 
const BLEED_DELAY_DEEP = 40;     
const FAT_DELAY = 1500;       
const UPPER_DELAY = 500;      

const GUSH_DEPTH = 260;        
const CLOT_START_MIN = 3500;  
const CLOT_START_MAX = 22000;  
const CLOT_DURATION = 7000;   

// Blood colours [r, g, b] lowk in future: make lighter
const BLOOD = [190, 14, 8];        
const BLOOD_DEEP = [120, 6, 8];     
const BLOOD_CLOTTED = [109, 40, 23];  
const BLOOD_HI = [190, 14, 8];

// Wipe tools 
const WIPE_RADIUS = 32;      
const WIPE_STRENGTH = 255;   
const REBLEED_WAIT = 2500;   
     

// Heal tool
const HEAL_RADIUS = 28;     
const HEAL_RATE = 14;        
const HEAL_CLEAN = 120;      
const SCAR_MIN_DEPTH = 15;   
const SCAR_GAIN = 0.01;     
const SCAR_FADE = 0.1;       
const SCAR_HEIGHT = 35;      
const SCAR_LIGHTEN = 0.45;   
const SCAR_PINK = [6, -14, -8]; 
let scarColour = [255, 222, 215]; 

const JAG_STRENGTH = 0.55;  

// Blood amount
let bloodScale = 0.5;          

// Zoom
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;
let zoom = 1;
let offsetX = 0, offsetY = 0;
let isPinching = false;
let pinchStart = null;
let lastTapTime = 0;
let zoomLabelEl;


const layers = [
  { depth: 0,   colour: [250, 218, 190] }, // 0 epidermis
  { depth: 40,  colour: [240, 230, 200] }, // 1 upper dermis
  { depth: 110, colour: [214, 92, 104]  }, // 2 lower dermis
  { depth: 190, colour: [255, 232, 150] }, // 3 fat
  { depth: 330, colour: [246, 236, 236] }, // 4 fascia
  { depth: 350, colour: [176, 38, 52]   }, // 5 muscle
  { depth: 500, colour: [104, 20, 38]   }  // 6 deep tissue
];

const UPPER_DERMIS = layers[1].depth;    
const BLEED_MIN = layers[2].depth;        
const FAT_MIN = layers[3].depth + 10;     

// state
let cols, rows, wcols, wrows;
let depthMap, raiseMap, scarMap, wrinkleMap, jagMap;
let tissueCanvas, tctx, imgData;
let fatLayer, bloodLayer;

let strokes = new Map();

let sources = [];
let drips = [];
let fats = [];
let dirty = null;

let canvasEl;
let mouseCutAllowed = false; 
let dragging = false;       
let tool = 'cut';           
let uiPanel, panelToggle;
let pressureScale = 0.1;    

// SETUP

function setup() {
  pixelDensity(1);
  const cnv = createCanvas(windowWidth, windowHeight);
  canvasEl = cnv.elt;


  // pinch-zoom
  canvasEl.style.position = 'fixed';
  canvasEl.style.left = '0px';
  canvasEl.style.top = '0px';
  canvasEl.style.transformOrigin = '0 0';
  canvasEl.style.touchAction = 'none';

  init();
  makeUIPanel();
  makeSkinSwatches();
  makeToolButtons();
  makePressureSlider();
  makeBloodSlider();
  makeZoomControls();
}

function init() {
  noSmooth();

  cols = ceil(width / CELL);
  rows = ceil(height / CELL);
  wcols = ceil(cols / 2);
  wrows = ceil(rows / 2);

  depthMap = new Float32Array(cols * rows);
  raiseMap = new Float32Array(cols * rows);
  scarMap = new Float32Array(cols * rows);

  wrinkleMap = new Float32Array(wcols * wrows);
  jagMap = new Float32Array(wcols * wrows);
  for (let y = 0; y < wrows; y++) {
    for (let x = 0; x < wcols; x++) {
      wrinkleMap[x + y * wcols] = noise(x * 0.15, y * 0.15);
      jagMap[x + y * wcols] = noise(x * 0.6 + 500, y * 0.6 + 500);
    }
  }

  tissueCanvas = document.createElement('canvas');
  tissueCanvas.width = cols;
  tissueCanvas.height = rows;
  tctx = tissueCanvas.getContext('2d');
  imgData = tctx.createImageData(cols, rows);

  fatLayer = createGraphics(width, height);
  fatLayer.pixelDensity(1);
  fatLayer.noStroke();

  bloodLayer = createGraphics(width, height);
  bloodLayer.pixelDensity(1);
  bloodLayer.noStroke();

  sources = [];
  drips = [];
  fats = [];
  dirty = null;
  strokes = new Map();

  shadeRegion(0, 0, cols - 1, rows - 1);
}


// controllers


function makeUIPanel() {
  uiPanel = createDiv('');
  uiPanel.style('position', 'fixed');
  uiPanel.style('left', '0px');
  uiPanel.style('top', '0px');
  uiPanel.style('width', '490px');
  uiPanel.style('height', '224px');
  uiPanel.style('background', 'rgba(255,255,255,0.55)');
  uiPanel.style('border-radius', '0 0 12px 0');
  uiPanel.style('transition', 'transform 0.25s ease, height 0.25s ease');
  uiPanel.style('z-index', '10');

  panelToggle = createButton('\u25C0');
  panelToggle.parent(uiPanel);
  panelToggle.style('position', 'absolute');
  panelToggle.style('left', '100%');
  panelToggle.style('top', '0px');
  panelToggle.style('width', '24px');
  panelToggle.style('height', '48px');
  panelToggle.style('border', 'none');
  panelToggle.style('border-radius', '0 10px 10px 0');
  panelToggle.style('background', 'rgba(34,34,34,0.85)');
  panelToggle.style('color', '#fff');
  panelToggle.style('font-size', '12px');
  panelToggle.style('cursor', 'pointer');
  panelToggle.style('padding', '0');

  let open = true;
  panelToggle.mousePressed(() => {
    open = !open;
    uiPanel.style('transform', open ? 'translateX(0)' : 'translateX(-100%)');
    panelToggle.html(open ? '\u25C0' : '\u25B6');
  });
}

// skin tonesss


const SKIN_TONES = [
  [250, 218, 190], 
  [232, 190, 150], 
  [198, 146, 100], 
  [141, 92, 60],   
  [84, 52, 36]     
];

function updateScarColour() {
  const s = layers[0].colour;
  scarColour = s.map((v, k) =>
    Math.max(0, Math.min(255, v + (255 - v) * SCAR_LIGHTEN + SCAR_PINK[k]))
  );
}

function makeSkinSwatches() {
  const buttons = [];

  const label = createSpan('Skin tone');
  label.position(16, 12);
  label.parent(uiPanel);
  label.style('font-family', 'sans-serif');
  label.style('font-size', '12px');
  label.style('background', 'rgba(255,255,255,0.85)');
  label.style('padding', '2px 6px');
  label.style('border-radius', '4px');

  function select(n) {
    layers[0].colour = SKIN_TONES[n];
    updateScarColour();
    shadeRegion(0, 0, cols - 1, rows - 1);
    buttons.forEach((b, j) => {
      b.style('border', j === n ? '3px solid #222' : '3px solid #fff');
    });
  }

  SKIN_TONES.forEach((c, n) => {
    const b = createButton('');
    b.position(16 + n * 36, 36);
    b.parent(uiPanel);
    b.size(30, 30);
    b.style('background', `rgb(${c[0]}, ${c[1]}, ${c[2]})`);
    b.style('border-radius', '50%');
    b.style('cursor', 'pointer');
    b.mousePressed(() => select(n));
    buttons.push(b);
  });

  select(0);
}


// colour


function lerpArr(a, b, t) {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];
}

function bloodColourFor(depth, ageMs) {
  const depthT = constrain(map(depth, BLEED_MIN, MAX_DEPTH, 0, 1), 0, 1);
  const base = lerpArr(BLOOD, BLOOD_DEEP, depthT);
  const clotStart = constrain(
    map(depth, UPPER_DERMIS, MAX_DEPTH, CLOT_START_MIN, CLOT_START_MAX),
    CLOT_START_MIN, CLOT_START_MAX
  );
  const clotT = ageMs > clotStart ? constrain((ageMs - clotStart) / CLOT_DURATION, 0, 1) : 0;
  return { colour: lerpArr(base, BLOOD_CLOTTED, clotT), clotT };
}

// DRAW


function draw() {
  updateStrokes();

  if (dirty) {
    shadeRegion(dirty.x0 - 1, dirty.y0 - 1, dirty.x1 + 1, dirty.y1 + 1);
    dirty = null;
  }

  drawingContext.imageSmoothingEnabled = false;
  drawingContext.drawImage(tissueCanvas, 0, 0, cols * CELL, rows * CELL);

  updateFat();
  image(fatLayer, 0, 0);

  updateBlood();

  if (dragging) {
    if (tool === 'wipe') wipeBlood();
    else if (tool === 'heal') healWound();
  }

  image(bloodLayer, 0, 0);
  drawToolCursor();
}


// multiple fingers


function beginStroke(id, x, y) {
  strokes.set(id, {
    sx: x, sy: y, psx: x, psy: y,
    strokeLen: 0, travel: 0,
    release: 0, active: true,
    lastMX: x, lastMY: y,
    lbx: 0, lby: 0, lbOn: false
  });
}

function collectPointers() {
  const pts = [];
  if (isPinching) return pts; // two fingers down = zooming, not cutting
  if (touches.length > 0) {
    for (const t of touches) pts.push({ id: 't' + t.id, x: t.x, y: t.y });
  } else if (mouseCutAllowed && mouseIsPressed) {
    pts.push({ id: 'mouse', x: mouseX, y: mouseY });
  }
  return pts;
}

function updateStrokes() {
  const current = tool === 'cut' ? collectPointers() : [];
  const seen = new Set();

  for (const p of current) {
    seen.add(p.id);
    if (!strokes.has(p.id)) beginStroke(p.id, p.x, p.y);
    const s = strokes.get(p.id);
    s.active = true;
    s.lastMX = p.x;
    s.lastMY = p.y;
  }

  for (const [id, s] of strokes) {
    if (!seen.has(id)) s.active = false;
  }

  for (const [id, s] of strokes) {
    s.psx = s.sx;
    s.psy = s.sy;

    if (s.active) {
      s.release = 1;
      s.sx += (s.lastMX - s.sx) * FOLLOW;
      s.sy += (s.lastMY - s.sy) * FOLLOW;
      dig(s);
    } else if (s.release > 0.05) {
      s.release *= 0.7;
      s.sx += (s.lastMX - s.sx) * FOLLOW;
      s.sy += (s.lastMY - s.sy) * FOLLOW;
      dig(s);
    } else {
      strokes.delete(id);
    }
  }
}



function sstep(t) {
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return t * t * (3 - 2 * t);
}

function dig(s) {
  const dx = s.sx - s.psx;
  const dy = s.sy - s.psy;
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return;

  const speed = len * 16.67 / max(deltaTime, 1);
  const speedFactor = constrain(speed / SPEED_FULL, 0.15, MAX_SPEED);
  const n = max(1, ceil(len / STEP));

  for (let st = 1; st <= n; st++) {
    const t = st / n;
    const cx = s.psx + dx * t;
    const cy = s.psy + dy * t;
    s.strokeLen += len / n;

    const press = sstep(s.strokeLen / TAPER_LEN) * s.release;

    const gx = constrain(floor(cx / CELL), 0, cols - 1);
    const gy = constrain(floor(cy / CELL), 0, rows - 1);
    const cell = gx + gy * cols;

    const depthWidth = sstep(depthMap[cell] / 300);
    const rad = MIN_RADIUS + (DIG_RADIUS - MIN_RADIUS) * depthWidth * press;

    const strength =
      18 * speedFactor * pressureScale * (1 - 0.6 * depthWidth) * (0.35 + 0.65 * press);

    stamp(cx, cy, rad, strength);

    bleedLine(s, cx, cy, depthMap[cell]);

    s.travel += len / n;
    if (s.travel >= 7) {
      s.travel = 0;
      sources.push({
        x: cx, y: cy,
        cell: cell,
        t0: millis(),
        r: 0,
        drips: 0,
        fatty: random() < 0.3,
        fatDone: false,
        gushed: false,
        clot: 0
      });
      if (sources.length > 2500) sources.shift();
    }
  }
}

function stamp(cx, cy, rad, strength) {
  const raiseR = rad * 2.4 + 1;
  const inner = rad * 0.6;
  const bunch = rad / DIG_RADIUS;

  const x0 = max(0, floor((cx - raiseR) / CELL));
  const x1 = min(cols - 1, ceil((cx + raiseR) / CELL));
  const y0 = max(0, floor((cy - raiseR) / CELL));
  const y1 = min(rows - 1, ceil((cy + raiseR) / CELL));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const ddx = x * CELL + CELL / 2 - cx;
      const ddy = y * CELL + CELL / 2 - cy;
      const d = Math.sqrt(ddx * ddx + ddy * ddy);
      if (d >= raiseR) continue;
      const i = x + y * cols;

      const jag = jagMap[(x >> 1) + (y >> 1) * wcols];
      const dJag = d * (1 + (jag - 0.5) * JAG_STRENGTH);

      if (dJag < rad) {
        let f = Math.min(1, (1 - dJag / rad) * 2.2);
        f = f * f * (3 - 2 * f);
        depthMap[i] = Math.min(depthMap[i] + strength * f, MAX_DEPTH);
        raiseMap[i] -= raiseMap[i] * 0.35 * f;
        scarMap[i] -= scarMap[i] * 0.6 * f;
      }

      const t = (dJag - inner) / (raiseR - inner);
      if (t > 0 && t < 1) {
        const bump = Math.sin(Math.PI * Math.pow(t, 0.6));
        raiseMap[i] = Math.min(raiseMap[i] + strength * 0.13 * bunch * bump, MAX_RAISE);
      }
    }
  }

  if (!dirty) dirty = { x0, y0, x1, y1 };
  else {
    dirty.x0 = min(dirty.x0, x0);
    dirty.y0 = min(dirty.y0, y0);
    dirty.x1 = max(dirty.x1, x1);
    dirty.y1 = max(dirty.y1, y1);
  }
}

// tissue texture n shading

function layerIndex(d) {
  for (let k = layers.length - 1; k >= 0; k--) {
    if (d >= layers[k].depth) return k;
  }
  return 0;
}

function clampX(x) { return x < 0 ? 0 : x >= cols ? cols - 1 : x; }
function clampY(y) { return y < 0 ? 0 : y >= rows ? rows - 1 : y; }

function raiseAt(x, y) {
  x = clampX(x);
  y = clampY(y);
  const j = x + y * cols;
  return raiseMap[j] * (0.75 + 0.5 * wrinkleMap[(x >> 1) + (y >> 1) * wcols]) +
         scarMap[j] * SCAR_HEIGHT;
}

function depthAt(x, y) {
  return depthMap[clampX(x) + clampY(y) * cols];
}

const scarTmp = [0, 0, 0];

function shadeRegion(x0, y0, x1, y1) {
  x0 = max(0, x0); y0 = max(0, y0);
  x1 = min(cols - 1, x1); y1 = min(rows - 1, y1);

  const px = imgData.data;

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = x + y * cols;
      const d = depthMap[i];
      const k = layerIndex(d);
      let c = layers[k].colour;

      const scar = scarMap[i];
      if (scar > 0.01 && k === 0) {
        const st = Math.min(1, scar * 1.5);
        scarTmp[0] = c[0] + (scarColour[0] - c[0]) * st;
        scarTmp[1] = c[1] + (scarColour[1] - c[1]) * st;
        scarTmp[2] = c[2] + (scarColour[2] - c[2]) * st;
        c = scarTmp;
      }

      const rx = raiseAt(x + 1, y) - raiseAt(x - 1, y);
      const ry = raiseAt(x, y + 1) - raiseAt(x, y - 1);
      const dx = depthAt(x + 1, y) - depthAt(x - 1, y);
      const dy = depthAt(x, y + 1) - depthAt(x, y - 1);

      let shade = (rx + ry) * 1.6 - (dx + dy) * 0.24; 
      
      const jShade = (jagMap[(x >> 1) + (y >> 1) * wcols] - 0.5) * 14;
      shade += jShade * sstep(d / 60);

      shade = Math.max(-55, Math.min(55, shade));

      if (k === 0) shade -= d * 0.9;

      const o = i * 4;
      px[o]     = Math.max(0, Math.min(255, c[0] + shade));
      px[o + 1] = Math.max(0, Math.min(255, c[1] + shade));
      px[o + 2] = Math.max(0, Math.min(255, c[2] + shade));
      px[o + 3] = 255;
    }
  }

  tctx.putImageData(imgData, 0, 0, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}

// blooddd (upper dermis)

function bleedLine(s, x, y, d) {
  if (d < UPPER_DERMIS || bloodScale <= 0.001) {
    s.lbOn = false;
    return;
  }

  const w = map(d, UPPER_DERMIS, MAX_DEPTH, 1, 4.5, true) * bloodScale;
  const { colour: col } = bloodColourFor(d, 0);

  bloodLayer.stroke(col[0], col[1], col[2]);
  bloodLayer.strokeWeight(w);
  if (s.lbOn && Math.hypot(x - s.lbx, y - s.lby) < 4) {
    bloodLayer.line(s.lbx, s.lby, x, y);
  } else {
    bloodLayer.point(x, y);
  }
  bloodLayer.noStroke();

  s.lbx = x;
  s.lby = y;
  s.lbOn = true;
}

// fat
function updateFat() {
  const now = millis();

  for (const s of sources) {
    if (!s.fatty || s.fatDone) continue;
    if (now - s.t0 < FAT_DELAY) continue;
    if (depthMap[s.cell] < FAT_MIN) continue;

    s.fatDone = true;
    const count = floor(random(1, 3));
    for (let k = 0; k < count && fats.length < 200; k++) {
      fats.push({
        x: s.x + random(-5, 5),
        y: s.y + random(-5, 5),
        r: 0,
        maxR: random(1.6, 3.6)
      });
    }
  }

  for (let i = fats.length - 1; i >= 0; i--) {
    const f = fats[i];
    f.r = min(f.maxR, f.r + 0.04);

    if (f.r > 0.6) {
      fatLayer.stroke(222, 160, 10);
      fatLayer.strokeWeight(1);
      fatLayer.fill(255, 208, 52);
      fatLayer.circle(f.x, f.y, f.r * 2);

      fatLayer.noStroke();
      fatLayer.fill(255, 246, 190, 200);
      fatLayer.circle(f.x - f.r * 0.3, f.y - f.r * 0.3, f.r * 0.6);
    }

    if (f.r >= f.maxR) fats.splice(i, 1);
  }
}

// blood blood bloodddd (lower dermis onwards)
function bead(x, y, r, col) {
  if (r < 1) return;
  bloodLayer.fill(col[0], col[1], col[2]);
  bloodLayer.circle(x, y, r * 2);
  bloodLayer.fill(BLOOD_HI[0], BLOOD_HI[1], BLOOD_HI[2], 110);
  bloodLayer.circle(x - r * 0.3, y - r * 0.3, r * 0.5);
}

function blob(x, y, w, col) {
  bloodLayer.fill(col[0], col[1], col[2]);
  bloodLayer.circle(x, y, w);
  bloodLayer.fill(BLOOD_HI[0], BLOOD_HI[1], BLOOD_HI[2], 90);
  bloodLayer.circle(x - w * 0.2, y - w * 0.1, w * 0.3);
}

function updateBlood() {
  const now = millis();

  for (const s of sources) {
    const d = depthMap[s.cell];
    if (d < UPPER_DERMIS) continue;

    const delay = d >= BLEED_MIN
      ? map(d, BLEED_MIN, MAX_DEPTH, BLEED_DELAY_SHALLOW, BLEED_DELAY_DEEP, true)
      : UPPER_DELAY;
    const age = now - s.t0;
    if (age < delay) continue;
    
    if (!s.gushed && d >= GUSH_DEPTH) {
      s.gushed = true;
      const burst = floor(random(2, 5) * bloodScale);
      for (let k = 0; k < burst && drips.length < 160; k++) {
        drips.push({
          x: s.x + random(-4, 4), y: s.y + random(-4, 4),
          v: random(0.5, 1.5),
          mass: random(50, 140) * (0.4 + d / 260) * bloodScale,
          stall: 0, seed: random(1000), depth: d
        });
      }
      s.drips = min(s.drips + burst, 6);
    }

    const { colour: col, clotT } = bloodColourFor(d, age);
    s.clot = clotT;

    const maxR = map(d, UPPER_DERMIS, MAX_DEPTH, 1.3, 6.5, true) * bloodScale;

    if (clotT < 1) {
      if (s.r < maxR) {
        s.r = min(maxR, s.r + (maxR - s.r) * 0.01 + 0.004);
        if (frameCount % 3 === 0) bead(s.x, s.y, s.r, col);
      } else if (s.drips < 4 && drips.length < 160 &&
                 random() < 0.0015 * (1 + 2.5 * constrain(map(d, BLEED_MIN, MAX_DEPTH, 0, 1, true), 0, 1)) * bloodScale) {
        s.drips++;
        s.r = maxR * 0.5;
        const sizeVar = random(0.4, 1.9); // different-sized drips
        drips.push({
          x: s.x, y: s.y, v: 0,
          mass: random(30, 90) * (0.3 + d / 300) * sizeVar * bloodScale,
          stall: 0, seed: random(1000), depth: d
        });
      }
    } else if (frameCount % 5 === 0) {
      // no more bleeding yay
      bead(s.x, s.y, s.r, col);
    }
  }

  updateDrips();
}

function updateDrips() {
  for (let i = drips.length - 1; i >= 0; i--) {
    const p = drips[i];
    const w = 1.2 + sqrt(p.mass) * 0.42;
    const { colour: col } = bloodColourFor(p.depth || BLEED_MIN, 0);

    if (p.stall > 0) {
      p.stall--;
      p.v *= 0.5;
    } else {
      p.v += 0.03 + w * 0.006;
      if (random() < 0.008) {
        p.stall = floor(random(20, 80));
        blob(p.x, p.y, w * 1.25, col);
      }
    }

    p.v *= 0.93;
    p.y += p.v;
    p.x += (noise(p.seed, p.y * 0.02) - 0.5) * 0.35;
    p.mass -= p.v * 0.25;

    if (p.stall === 0) blob(p.x, p.y, w, col);

    if (p.mass <= 0 || p.y > height) {
      blob(p.x, min(p.y, height), w * 1.3, col);
      drips.splice(i, 1);
    }
  }
}

// pressure

function makePressureSlider() {
  const row = createDiv('');
  row.parent(uiPanel);
  row.style('position', 'absolute');
  row.style('left', '0px');
  row.style('top', '110px');
  row.style('width', '250px');
  row.style('height', '34px');
  row.style('transition', 'transform 0.25s ease');

  const label = createSpan('Pressure');
  label.parent(row);
  label.position(16, 5);
  label.style('font-family', 'sans-serif');
  label.style('font-size', '12px');
  label.style('background', 'rgba(255,255,255,0.85)');
  label.style('padding', '2px 6px');
  label.style('border-radius', '4px');

  const slider = createSlider(0.2, 1, 0.5, 0.05);
  slider.parent(row);
  slider.position(86, 7);
  slider.style('width', '150px');
  slider.input(() => { pressureScale = slider.value(); });

  const toggle = createButton('\u25C0');
  toggle.parent(row);
  toggle.style('position', 'absolute');
  toggle.style('left', '100%');
  toggle.style('top', '0px');
  toggle.style('width', '20px');
  toggle.style('height', '34px');
  toggle.style('border', 'none');
  toggle.style('border-radius', '0 8px 8px 0');
  toggle.style('background', 'rgba(209, 204, 204, 0.85)');
  toggle.style('color', '#ffffff');
  toggle.style('font-size', '11px');
  toggle.style('cursor', 'pointer');
  toggle.style('padding', '0');

  let open = true;
  toggle.mousePressed(() => {
    open = !open;
    row.style('transform', open ? 'translateX(0)' : 'translateX(-100%)');
    toggle.html(open ? '\u25C0' : '\u25B6');
  });
}

// blood slider jesus this thing is killing me BUT its gonna be worth it

function makeBloodSlider() {
  const row = createDiv('');
  row.parent(uiPanel);
  row.style('position', 'absolute');
  row.style('left', '0px');
  row.style('top', '146px');
  row.style('width', '250px');
  row.style('height', '34px');

  const label = createSpan('Blood');
  label.parent(row);
  label.position(16, 5);
  label.style('font-family', 'sans-serif');
  label.style('font-size', '12px');
  label.style('background', 'rgba(255,255,255,0.85)');
  label.style('padding', '2px 6px');
  label.style('border-radius', '4px');

  const slider = createSlider(0, 2, 1, 0.05);
  slider.parent(row);
  slider.position(86, 7);
  slider.style('width', '150px');
  slider.input(() => { bloodScale = slider.value(); });
}

// Zoooom

function makeZoomControls() {
  const row = createDiv('');
  row.parent(uiPanel);
  row.style('position', 'absolute');
  row.style('left', '0px');
  row.style('top', '182px');
  row.style('width', '460px');
  row.style('height', '34px');

  const label = createSpan('Zoom');
  label.parent(row);
  label.position(16, 5);
  label.style('font-family', 'sans-serif');
  label.style('font-size', '12px');
  label.style('background', 'rgba(255,255,255,0.85)');
  label.style('padding', '2px 6px');
  label.style('border-radius', '4px');

  const minusBtn = createButton('\u2212');
  minusBtn.parent(row);
  minusBtn.position(70, 2);
  minusBtn.size(30, 30);
  minusBtn.style('border', '2px solid #222');
  minusBtn.style('border-radius', '6px');
  minusBtn.style('font-family', 'sans-serif');
  minusBtn.style('font-size', '16px');
  minusBtn.style('cursor', 'pointer');
  minusBtn.style('background', '#fff');
  minusBtn.mousePressed(() => zoomStep(-ZOOM_STEP));

  zoomLabelEl = createSpan('100%');
  zoomLabelEl.parent(row);
  zoomLabelEl.position(108, 9);
  zoomLabelEl.style('font-family', 'sans-serif');
  zoomLabelEl.style('font-size', '12px');
  zoomLabelEl.style('width', '40px');
  zoomLabelEl.style('display', 'inline-block');
  zoomLabelEl.style('text-align', 'center');

  const plusBtn = createButton('+');
  plusBtn.parent(row);
  plusBtn.position(156, 2);
  plusBtn.size(30, 30);
  plusBtn.style('border', '2px solid #222');
  plusBtn.style('border-radius', '6px');
  plusBtn.style('font-family', 'sans-serif');
  plusBtn.style('font-size', '16px');
  plusBtn.style('cursor', 'pointer');
  plusBtn.style('background', '#fff');
  plusBtn.mousePressed(() => zoomStep(ZOOM_STEP));

  const resetBtn = createButton('Reset');
  resetBtn.parent(row);
  resetBtn.position(198, 2);
  resetBtn.size(64, 30);
  resetBtn.style('border', '2px solid #222');
  resetBtn.style('border-radius', '6px');
  resetBtn.style('font-family', 'sans-serif');
  resetBtn.style('font-size', '12px');
  resetBtn.style('cursor', 'pointer');
  resetBtn.style('background', '#fff');
  resetBtn.mousePressed(resetView);

}

function updateZoomLabel() {
  if (zoomLabelEl) zoomLabelEl.html(Math.round(zoom * 100) + '%');
}

function applyTransform() {
  canvasEl.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`;
  updateZoomLabel();
}

function clampView() {
  const cw = width * zoom;
  const ch = height * zoom;

  if (zoom >= 1) {
    offsetX = constrain(offsetX, width - cw, 0);
    offsetY = constrain(offsetY, height - ch, 0);
  } else {
    offsetX = (width - cw) / 2;
    offsetY = (height - ch) / 2;
  }
}

function zoomAtClientPoint(newZoom, clientX, clientY) {
  newZoom = constrain(newZoom, MIN_ZOOM, MAX_ZOOM);
  const localX = (clientX - offsetX) / zoom;
  const localY = (clientY - offsetY) / zoom;
  offsetX = clientX - localX * newZoom;
  offsetY = clientY - localY * newZoom;
  zoom = newZoom;
  clampView();
  applyTransform();
}

function zoomStep(delta) {
  zoomAtClientPoint(zoom + delta, width / 2, height / 2);
}

function resetView() {
  zoom = 1;
  offsetX = 0;
  offsetY = 0;
  applyTransform();
}

function mouseWheel(event) {
  if (!event || event.target !== canvasEl) return;
  const delta = -event.delta * 0.0015 * zoom;
  zoomAtClientPoint(zoom + delta, event.clientX, event.clientY);
  return false;
}

// pinch-to-zoom
function beginPinch(event) {
  isPinching = true;
  dragging = false;
  strokes.clear();

  const t0 = event.touches[0], t1 = event.touches[1];
  const dist0 = Math.max(1, Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY));
  const midX = (t0.clientX + t1.clientX) / 2;
  const midY = (t0.clientY + t1.clientY) / 2;

  pinchStart = {
    dist0,
    zoom0: zoom,
    localX: (midX - offsetX) / zoom,
    localY: (midY - offsetY) / zoom
  };
}

function updatePinch(event) {
  if (!pinchStart || event.touches.length < 2) return;

  const t0 = event.touches[0], t1 = event.touches[1];
  const dist1 = Math.hypot(t1.clientX - t0.clientX, t1.clientY - t0.clientY);
  const midX = (t0.clientX + t1.clientX) / 2;
  const midY = (t0.clientY + t1.clientY) / 2;

  const newZoom = constrain(pinchStart.zoom0 * (dist1 / pinchStart.dist0), MIN_ZOOM, MAX_ZOOM);
  offsetX = midX - pinchStart.localX * newZoom;
  offsetY = midY - pinchStart.localY * newZoom;
  zoom = newZoom;
  clampView();
  applyTransform();
}

// tools

function makeToolButtons() {
  const names = ['cut', 'wipe', 'heal'];
  const buttons = [];

  function setTool(name) {
    tool = name;
    mouseCutAllowed = false;
    dragging = false;
    strokes.clear();
    buttons.forEach((b, j) => {
      const on = names[j] === name;
      b.style('background', on ? '#222' : '#fff');
      b.style('color', on ? '#fff' : '#222');
    });
  }

  names.forEach((name, n) => {
    const b = createButton(name.charAt(0).toUpperCase() + name.slice(1));
    b.position(230 + n * 62, 36);
    b.parent(uiPanel);
    b.size(56, 30);
    b.style('border', '2px solid #222');
    b.style('border-radius', '6px');
    b.style('font-family', 'sans-serif');
    b.style('font-size', '13px');
    b.style('cursor', 'pointer');
    b.mousePressed(() => setTool(name));
    buttons.push(b);
  });

  setTool('cut');

  const wipeAllBtn = createButton('Wipe All');
  wipeAllBtn.position(16, 72);
  wipeAllBtn.parent(uiPanel);
  wipeAllBtn.size(110, 28);
  wipeAllBtn.style('border', '2px solid #222');
  wipeAllBtn.style('border-radius', '6px');
  wipeAllBtn.style('font-family', 'sans-serif');
  wipeAllBtn.style('font-size', '12px');
  wipeAllBtn.style('cursor', 'pointer');
  wipeAllBtn.style('background', '#fff');
  wipeAllBtn.mousePressed(wipeAllBlood);

  const healAllBtn = createButton('Heal All');
  healAllBtn.position(134, 72);
  healAllBtn.parent(uiPanel);
  healAllBtn.size(110, 28);
  healAllBtn.style('border', '2px solid #222');
  healAllBtn.style('border-radius', '6px');
  healAllBtn.style('font-family', 'sans-serif');
  healAllBtn.style('font-size', '12px');
  healAllBtn.style('cursor', 'pointer');
  healAllBtn.style('background', '#fff');
  healAllBtn.mousePressed(healAllWounds);
}

function wipeAllBlood() {
  bloodLayer.clear();
  fatLayer.clear();
  fats = [];
  drips = [];
  const now = millis();
  for (const s of sources) {
    s.r = 0;
    s.drips = 0;
    s.gushed = false;
    s.clot = 0;
    s.t0 = now + REBLEED_WAIT;
  }
}

function healAllWounds() {
  for (let i = 0; i < depthMap.length; i++) {
    const dep = depthMap[i];
    if (dep > 0.5) {
      const scarPart = Math.max(0, dep - SCAR_MIN_DEPTH);
      scarMap[i] = Math.min(1, scarMap[i] + scarPart * SCAR_GAIN);
      depthMap[i] = 0;
    }
    raiseMap[i] = 0;
  }
  sources = [];
  drips = [];
  fats = [];
  strokes.clear();
  bloodLayer.clear();
  fatLayer.clear();
  shadeRegion(0, 0, cols - 1, rows - 1);
}

function wipeBlood() {
  const dx = mouseX - pmouseX;
  const dy = mouseY - pmouseY;
  const n = max(1, ceil(Math.hypot(dx, dy) / (WIPE_RADIUS / 2)));
  const r2 = WIPE_RADIUS * WIPE_RADIUS;

  bloodLayer.erase(WIPE_STRENGTH, WIPE_STRENGTH);
  fatLayer.erase(WIPE_STRENGTH, WIPE_STRENGTH);
  for (let s = 1; s <= n; s++) {
    const x = pmouseX + dx * s / n;
    const y = pmouseY + dy * s / n;

    bloodLayer.circle(x, y, WIPE_RADIUS * 2);
    fatLayer.circle(x, y, WIPE_RADIUS * 2);

    fats = fats.filter(f => (f.x - x) * (f.x - x) + (f.y - y) * (f.y - y) > r2);
    drips = drips.filter(p => (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y) > r2);

    for (const src of sources) {
      if ((src.x - x) * (src.x - x) + (src.y - y) * (src.y - y) < r2) {
        src.r = 0;
        src.drips = 0;
        src.gushed = false;
        src.clot = 0;
        src.t0 = millis() + REBLEED_WAIT;
      }
    }
  }
  bloodLayer.noErase();
  fatLayer.noErase();
}



function healWound() {
  const dx = mouseX - pmouseX;
  const dy = mouseY - pmouseY;
  const n = max(1, ceil(Math.hypot(dx, dy) / (HEAL_RADIUS / 2)));
  const r2 = HEAL_RADIUS * HEAL_RADIUS;

  bloodLayer.erase(HEAL_CLEAN, HEAL_CLEAN);
  fatLayer.erase(HEAL_CLEAN, HEAL_CLEAN);
  for (let s = 1; s <= n; s++) {
    const x = pmouseX + dx * s / n;
    const y = pmouseY + dy * s / n;

    healStamp(x, y);

    bloodLayer.circle(x, y, HEAL_RADIUS * 2);
    fatLayer.circle(x, y, HEAL_RADIUS * 2);

    drips = drips.filter(p => (p.x - x) * (p.x - x) + (p.y - y) * (p.y - y) > r2);
    fats = fats.filter(f => (f.x - x) * (f.x - x) + (f.y - y) * (f.y - y) > r2);

    sources = sources.filter(src =>
      (src.x - x) * (src.x - x) + (src.y - y) * (src.y - y) > r2 ||
      depthMap[src.cell] >= UPPER_DERMIS
    );
  }
  bloodLayer.noErase();
  fatLayer.noErase();
}

function healStamp(cx, cy) {
  const r = HEAL_RADIUS;
  const x0 = max(0, floor((cx - r) / CELL));
  const x1 = min(cols - 1, ceil((cx + r) / CELL));
  const y0 = max(0, floor((cy - r) / CELL));
  const y1 = min(rows - 1, ceil((cy + r) / CELL));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const ddx = x * CELL + CELL / 2 - cx;
      const ddy = y * CELL + CELL / 2 - cy;
      const d = Math.sqrt(ddx * ddx + ddy * ddy);
      if (d >= r) continue;

      let f = Math.min(1, (1 - d / r) * 2);
      f = f * f * (3 - 2 * f);

      const i = x + y * cols;
      const dep = depthMap[i];

      if (dep > 0.5) {
        const reduce = Math.min(dep, HEAL_RATE * f);
        const scarPart = Math.max(0, Math.min(reduce, dep - SCAR_MIN_DEPTH));
        depthMap[i] = dep - reduce;
        scarMap[i] = Math.min(1, scarMap[i] + scarPart * SCAR_GAIN);
      } else {
        depthMap[i] = 0;
        scarMap[i] = Math.max(0, scarMap[i] - SCAR_FADE * f);
      }

      raiseMap[i] -= raiseMap[i] * 0.2 * f;
    }
  }

  if (!dirty) dirty = { x0, y0, x1, y1 };
  else {
    dirty.x0 = min(dirty.x0, x0);
    dirty.y0 = min(dirty.y0, y0);
    dirty.x1 = max(dirty.x1, x1);
    dirty.y1 = max(dirty.y1, y1);
  }
}

function drawToolCursor() {
  if (tool === 'cut') return;
  noFill();
  stroke(255, 255, 255, 220);
  strokeWeight(2);
  const r = tool === 'wipe' ? WIPE_RADIUS : HEAL_RADIUS;
  circle(mouseX, mouseY, r * 2);
  noStroke();
}

// input

function mousePressed(event) {
  const onCanvas = event && event.target === canvasEl;
  if (tool === 'cut') {
    mouseCutAllowed = onCanvas;
  } else {
    dragging = onCanvas;
  }
}

function touchStarted(event) {
  const onCanvas = event && event.target === canvasEl;
  if (!onCanvas) return;

  if (event.touches && event.touches.length >= 2) {
    beginPinch(event);
    return false;
  }

  if (isPinching) {
    isPinching = false;
    pinchStart = null;
    return false;
  }

  const now = millis();
  if (now - lastTapTime < 300) {
    resetView();
    lastTapTime = 0;
    return false;
  }
  lastTapTime = now;

  if (tool !== 'cut') dragging = true;
  return false;
}

function touchMoved(event) {
  const onCanvas = event && event.target === canvasEl;
  if (!onCanvas) return;

  if (event.touches && event.touches.length >= 2) {
    updatePinch(event);
    return false;
  }
}

function touchEnded(event) {
  const remaining = (event && event.touches) ? event.touches.length : 0;
  if (remaining < 2) {
    isPinching = false;
    pinchStart = null;
  }
  if (remaining === 0) dragging = false;
}

function keyPressed() {
  if (key === 'r' || key === 'R') init();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  resetView();
  init();
}
