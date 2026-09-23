// Building geometry and facades. Turns a lot's simulation data into something
// that looks like it belongs in New York: real typologies, setbacks that step
// back as they rise, ground-floor retail, cornices, and water towers.

import * as THREE from 'three';
import { CONFIG, STYLES, MAST_FLOORS, mulberry32 } from './world.js';

const FH = CONFIG.FLOOR_H;

// `win` is a sky-reflection pair: [top, bottom]. Glass that only ever reads as
// a black rectangle makes every building look like it has holes punched in it.
export const TYPES = {
  brownstone: { pal: ['#8d5b42', '#7b4a36', '#a97a55', '#6f5344'], win: ['#7d90a4', '#2c3138'], mortar: 0.55, cornice: '#6f4433' },
  loft:       { pal: ['#a8705a', '#96604d', '#b07c63', '#8a7f6e'], win: ['#8496a6', '#2a3038'], mortar: 0.4,  cornice: '#7a4d3c' },
  prewar:     { pal: ['#b8ab97', '#a99c88', '#c4b7a3', '#9d9384'], win: ['#8ea2b6', '#2e343c'], mortar: 0.3,  cornice: '#8f8271' },
  deco:       { pal: ['#a89a84', '#bdb09a', '#9c8f7a', '#cabda4'], win: ['#93a7ba', '#2b3138'], mortar: 0.25, cornice: '#7d7160' },
  midcentury: { pal: ['#7d8994', '#6e7a86', '#8b97a2', '#9aa39f'], win: ['#9dbdd6', '#33454f'], mortar: 0.1,  cornice: '#5e6a76' },
  glass:      { pal: ['#4e6474', '#405767', '#5c7282', '#6b8496'], win: ['#a8cde4', '#243d4f'], mortar: 0.05, cornice: '#3a4f5e' },
};

/** What kind of building this is, from its size, era and where it stands. */
export function typologyFor(lot, b) {
  if (b.style && STYLES[b.style]) return STYLES[b.style].type;   // you chose it
  const rnd = mulberry32(lot.seed + b.floors * 13);
  const f = b.floors;
  const modern = (b.age ?? 60) < 30;
  if (f <= 5) return rnd() < 0.35 ? 'loft' : 'brownstone';
  if (f <= 10) return modern ? 'midcentury' : (rnd() < 0.5 ? 'loft' : 'prewar');
  if (f <= 22) return modern ? (rnd() < 0.5 ? 'midcentury' : 'glass') : (rnd() < 0.45 ? 'deco' : 'prewar');
  return modern ? 'glass' : (rnd() < 0.55 ? 'deco' : 'midcentury');
}

// ------------------------------------------------------------------ facades

const canvasCache = new Map();

function facadeCanvas(type, variant, emissive) {
  const key = `${type}_${variant}_${emissive ? 'e' : 'd'}`;
  if (canvasCache.has(key)) return canvasCache.get(key);

  const T = TYPES[type];
  const S = 128;                       // 4 window bays across, 4 floors down
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const rnd = mulberry32(variant * 7919 + type.length * 131);
  const cell = S / 4;

  if (emissive) {
    g.fillStyle = '#000';
    g.fillRect(0, 0, S, S);
  } else {
    g.fillStyle = T.pal[variant % T.pal.length];
    g.fillRect(0, 0, S, S);
    // Masonry courses / spandrel banding, depending on how heavy the wall is.
    if (T.mortar > 0.2) {
      for (let y = 0; y < S; y += 4) {
        g.fillStyle = `rgba(0,0,0,${0.05 + rnd() * 0.05 * T.mortar})`;
        g.fillRect(0, y, S, 1);
      }
      for (let i = 0; i < 90; i++) {
        g.fillStyle = `rgba(255,255,255,${rnd() * 0.05})`;
        g.fillRect(rnd() * S, rnd() * S, 6 + rnd() * 10, 3);
      }
    } else {
      for (let y = 0; y < S; y += cell) {
        g.fillStyle = 'rgba(0,0,0,0.16)';
        g.fillRect(0, y + cell - 5, S, 5);       // spandrel
      }
    }
  }

  // Windows.
  const curtain = T.mortar < 0.2;
  const wW = curtain ? cell - 6 : cell * 0.52;
  const wH = curtain ? cell * 0.6 : cell * 0.55;
  for (let ry = 0; ry < 4; ry++) {
    for (let rx = 0; rx < 4; rx++) {
      const x = rx * cell + (cell - wW) / 2;
      const y = ry * cell + (cell - wH) / 2.4;
      if (emissive) {
        if (rnd() < 0.5) continue;
        const warm = rnd();
        g.fillStyle = warm < 0.72 ? '#ffca7d' : '#bcd8ff';
        g.fillRect(x, y, wW, wH);
      } else {
        const grad = g.createLinearGradient(0, y, 0, y + wH);
        grad.addColorStop(0, T.win[0]);
        grad.addColorStop(0.45, T.win[1]);
        grad.addColorStop(1, T.win[1]);
        g.fillStyle = grad;
        g.fillRect(x, y, wW, wH);
        // Reveal / sill so the wall reads as having thickness.
        g.fillStyle = 'rgba(0,0,0,0.3)';
        g.fillRect(x, y, wW, 2);
        g.fillStyle = 'rgba(255,255,255,0.14)';
        g.fillRect(x - 1, y + wH, wW + 2, 2);
        if (!curtain) {                          // muntin
          g.fillStyle = 'rgba(255,255,255,0.10)';
          g.fillRect(x + wW / 2 - 0.5, y, 1, wH);
        }
        g.fillStyle = 'rgba(255,255,255,0.16)';  // glass sheen
        g.fillRect(x, y + 2, wW * 0.42, wH * 0.5);
      }
    }
  }
  canvasCache.set(key, c);
  return c;
}

/**
 * A height field on the same bay grid as the colour: wall at mid grey, glass
 * cut back into it, sill and lintel standing proud. Sobelled into a normal
 * map this is what gives a window a reveal — an edge that catches the sun on
 * one side and shades on the other, instead of a rectangle painted on a slab.
 */
function facadeHeight(type, variant) {
  const key = `${type}_${variant}_h`;
  if (canvasCache.has(key)) return canvasCache.get(key);
  const T = TYPES[type];
  const S = 128, cell = S / 4;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');

  g.fillStyle = '#9a9a9a';
  g.fillRect(0, 0, S, S);

  if (T.mortar > 0.2) {
    for (let y = 0; y < S; y += 4) {          // mortar courses, raked back
      g.fillStyle = `rgba(0,0,0,${0.28 * T.mortar})`;
      g.fillRect(0, y, S, 1);
    }
  } else {
    for (let y = 0; y < S; y += cell) {       // spandrel panel, set back
      g.fillStyle = 'rgba(0,0,0,0.2)';
      g.fillRect(0, y + cell - 5, S, 5);
    }
  }

  const curtain = T.mortar < 0.2;
  const wW = curtain ? cell - 6 : cell * 0.52;
  const wH = curtain ? cell * 0.6 : cell * 0.55;
  // A masonry wall is two feet thick and the window sits well inside it; a
  // curtain wall is a sheet of glass a few inches off the mullion line.
  const depth = curtain ? 40 : 96;
  for (let ry = 0; ry < 4; ry++) {
    for (let rx = 0; rx < 4; rx++) {
      const x = rx * cell + (cell - wW) / 2;
      const y = ry * cell + (cell - wH) / 2.4;
      g.fillStyle = `rgb(${154 - depth},${154 - depth},${154 - depth})`;
      g.fillRect(x, y, wW, wH);
      g.fillStyle = '#e2e2e2';                // sill, proud of the wall
      g.fillRect(x - 1.5, y + wH - 1, wW + 3, 2.5);
      if (!curtain) {
        g.fillStyle = '#c8c8c8';              // lintel
        g.fillRect(x - 1.5, y - 2, wW + 3, 2);
      }
    }
  }
  canvasCache.set(key, c);
  return c;
}

/** Sobel a height field into a tangent-space normal map. */
function facadeNormal(type, variant) {
  const key = `${type}_${variant}_n`;
  if (canvasCache.has(key)) return canvasCache.get(key);
  const src = facadeHeight(type, variant);
  const S = src.width;
  const sg = src.getContext('2d').getImageData(0, 0, S, S).data;
  const out = document.createElement('canvas');
  out.width = out.height = S;
  const og = out.getContext('2d');
  const img = og.createImageData(S, S);
  // Wrapping lookups, because the texture tiles and a seam down every bay
  // would be worse than no normal map at all.
  const at = (x, y) => sg[(((y % S) + S) % S * S + ((x % S) + S) % S) * 4] / 255;
  const strength = 2.6;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * S + x) * 4;
      img.data[i] = ((dx / len) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len) * 255;
      img.data[i + 3] = 255;
    }
  }
  og.putImageData(img, 0, 0);
  canvasCache.set(key, out);
  return out;
}

/**
 * Where the wall is smooth and where it is not. Three multiplies the material
 * roughness by the green channel, so this is a scale: glass comes out a third
 * as rough as the masonry it is set into, which is what makes the reflection
 * sit in the window rather than over the whole facade.
 */
function facadeRough(type, variant) {
  const key = `${type}_${variant}_r`;
  if (canvasCache.has(key)) return canvasCache.get(key);
  const T = TYPES[type];
  const S = 128, cell = S / 4;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, S, S);
  const curtain = T.mortar < 0.2;
  const wW = curtain ? cell - 6 : cell * 0.52;
  const wH = curtain ? cell * 0.6 : cell * 0.55;
  for (let ry = 0; ry < 4; ry++) {
    for (let rx = 0; rx < 4; rx++) {
      const x = rx * cell + (cell - wW) / 2;
      const y = ry * cell + (cell - wH) / 2.4;
      g.fillStyle = '#585858';
      g.fillRect(x, y, wW, wH);
    }
  }
  canvasCache.set(key, c);
  return c;
}

/** A tiling texture from a canvas. Linear data maps must not be sRGB. */
function dataTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function makeTexture(type, variant, emissive) {
  const t = new THREE.CanvasTexture(facadeCanvas(type, variant, emissive));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** How many bays across a wall, and how many floors down it. */
export function facadeTiling(sideM, floors) {
  return { rx: Math.max(1, Math.round(sideM / 13)), ry: Math.max(1, Math.round(floors / 4)) };
}

/** Bake the tiling into the wall's own UVs. */
export function tileUV(geo, rx, ry) {
  const uv = geo.getAttribute('uv');
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * rx, uv.getY(i) * ry);
  uv.needsUpdate = true;
  return geo;
}

/**
 * Materials are shared across every building with the same look. Tiling used
 * to be part of the key, which meant a 40-storey tower and a 41-storey one
 * next door had separate materials and could never be drawn together. The
 * repeat lives in the geometry now, so the key is just the look.
 */
export function facadeMaterial(cache, type, variant, condition) {
  const wear = condition < 0.45 ? 'w' : condition < 0.75 ? 'm' : 'g';
  const key = `f_${type}_${variant}_${wear}`;
  if (cache.has(key)) return cache.get(key);

  const T = TYPES[type];
  const glassy = type === 'glass' || type === 'midcentury';
  // Neglect reads as grime: darker, flatter, less light in the windows.
  const grime = condition < 0.75 ? new THREE.Color(0x6a6055) : new THREE.Color(0xffffff);
  const tint = new THREE.Color(0xffffff).lerp(grime, Math.max(0, 0.8 - condition));

  const m = new THREE.MeshStandardMaterial({
    map: makeTexture(type, variant, false),
    emissiveMap: makeTexture(type, variant, true),
    emissive: 0xffffff,
    emissiveIntensity: 0,
    color: tint,
    normalMap: dataTexture(facadeNormal(type, variant)),
    normalScale: new THREE.Vector2(glassy ? 0.55 : 1.0, glassy ? 0.55 : 1.0),
    roughnessMap: dataTexture(facadeRough(type, variant)),
    roughness: glassy ? 0.24 + (1 - condition) * 0.4 : 0.78 + (1 - condition) * 0.15,
    metalness: glassy ? 0.5 : 0.03,
  });
  m.userData.litScale = 0.35 + condition * 0.65;
  cache.set(key, m);
  return m;
}

function solid(cache, key, color, roughness = 0.85, metalness = 0.05, glow = false) {
  const k = `s_${key}`;
  if (cache.has(k)) return cache.get(k);
  const m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
  if (glow) {
    m.emissive = new THREE.Color(0xffb765);
    m.emissiveIntensity = 0;
    m.userData.shopGlow = true;            // lit from inside after dark
  }
  cache.set(k, m);
  return m;
}

// ------------------------------------------------------------------ massing

/**
 * The stack of volumes that makes up a building. Tall buildings step back as
 * they rise, which is both what the zoning envelope wants and what makes a
 * skyline read as New York rather than as a bar chart.
 */
export function volumes(lot, b, rnd) {
  const lotW = lot.w * 0.94, lotD = lot.d * 0.94;
  const side = Math.min(lotW, b.side || Math.sqrt((lot.areaSf * 0.7) / CONFIG.SF_PER_M2));
  const form = b.form || 'stepped';
  const f = b.floors;
  const out = [];

  if (f <= 6) {
    out.push({ w: lotW, d: lotD, floors: f, y0: 0 });
    return out;
  }

  // Slab: one wide mass on a base. Point: a narrow shaft off a low podium.
  // Stepped: setbacks on the way up, the classic New York wedding cake.
  const baseFloors = form === 'point'
    ? Math.min(f - 2, 4)
    : Math.min(f - 2, f <= 14 ? 3 : 5);
  out.push({ w: lotW, d: lotD, floors: baseFloors, y0: 0 });

  let remaining = f - baseFloors;
  let y = baseFloors;
  const startShrink = form === 'slab' ? 0.93 : form === 'point' ? 0.66 : 0.84;
  let w = lotW * (startShrink + rnd() * 0.05);
  let d = lotD * (startShrink + rnd() * 0.05);

  if (form === 'slab') {
    // A slab is deliberately unarticulated: one long mass, narrow in one axis.
    d *= 0.62;
    out.push({ w, d, floors: remaining, y0: y });
    return out;
  }

  const setbacks = form === 'point' ? (f > 26 ? 1 : 0)
                 : f > 34 ? 2 : f > 18 ? 1 : 0;
  for (let i = 0; i < setbacks; i++) {
    const chunk = Math.max(3, Math.round(remaining * (0.3 + rnd() * 0.15)));
    out.push({ w, d, floors: chunk, y0: y });
    y += chunk; remaining -= chunk;
    const k = form === 'point' ? 0.72 : 0.79;
    w *= k + rnd() * 0.06;
    d *= k + rnd() * 0.06;
  }
  const floor = form === 'point' ? side * 0.62 : side * 0.8;
  out.push({ w: Math.max(w, floor), d: Math.max(d, floor), floors: remaining, y0: y });
  return out;
}

// -------------------------------------------------------------------- build

/**
 * Returns a Group for the building plus the roof props it wants, which the
 * scene batches into instanced meshes.
 */
export function makeBuilding(lot, b, cache) {
  const rnd = mulberry32(lot.seed + 31);
  const type = typologyFor(lot, b);
  const variant = b.variant ?? (lot.seed % 4);
  const condition = b.condition ?? 1;
  const T = TYPES[type];
  const group = new THREE.Group();
  const props = [];

  const vols = volumes(lot, b, rnd);
  const retailFloors = b.use === 'residential' ? 0 : 1;

  for (let i = 0; i < vols.length; i++) {
    const v = vols[i];
    const h = v.floors * FH;
    const y0 = v.y0 * FH;
    const mat = facadeMaterial(cache, type, variant, condition);
    const roofMat = solid(cache, `roof_${condition > 0.5 ? 'ok' : 'bad'}`,
                          condition > 0.5 ? 0x3a3a3d : 0x2e2c29, 0.97);
    const { rx, ry } = facadeTiling(Math.max(v.w, v.d), v.floors);
    // BoxGeometry face order: +x, -x, +y, -y, +z, -z — 2 and 3 are the caps.
    const mesh = new THREE.Mesh(tileUV(new THREE.BoxGeometry(v.w, h, v.d), rx, ry),
                                [mat, mat, roofMat, roofMat, mat, mat]);
    mesh.position.set(lot.x, y0 + h / 2 + 0.4, lot.z);
    mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.lotId = lot.id;
    group.add(mesh);

    // A cornice or parapet caps every volume. Cheap, and it's most of what
    // separates a building from a box.
    const capH = i === 0 && vols.length > 1 ? 0.5 : 0.8;
    const over = type === 'glass' ? 0.1 : 0.7;
    // The cornice is a band at the top edge; its upper face is roof, so looking
    // down from the board you see tar and gravel rather than a brick lid.
    const corMat = solid(cache, `cor_${type}_${variant}`, T.cornice, 0.9);
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(v.w + over, capH, v.d + over),
      [corMat, corMat, roofMat, roofMat, corMat, corMat]
    );
    cap.position.set(lot.x, y0 + h + 0.4, lot.z);
    cap.castShadow = true;
    cap.userData.lotId = lot.id;
    group.add(cap);
  }

  // Ground-floor retail: a darker base band with a warm, lit shopfront.
  if (retailFloors) {
    const base = vols[0];
    // Shopfront glazing: lighter than the wall above it, and lit at night.
    const ok = condition > 0.6;
    const shop = new THREE.Mesh(
      new THREE.BoxGeometry(base.w + 0.3, FH * 0.86, base.d + 0.3),
      solid(cache, `shop_${ok ? 'ok' : 'bad'}`, ok ? 0x59636e : 0x35332e, 0.35, 0.3, ok)
    );
    shop.position.set(lot.x, FH * 0.43 + 0.4, lot.z);
    shop.userData.lotId = lot.id;
    shop.receiveShadow = true;
    group.add(shop);

    // Awnings face the street on a corridor that has become a destination.
    const lively = lot.avenue.famous || lot.street.famous || b.use === 'mixed';
    if (lively && condition > 0.5) {
      const awnColors = [0x8c2f2a, 0x1f4d3a, 0x24406b, 0x7a5a1e];
      const col = awnColors[lot.seed % awnColors.length];
      for (const [ax, az, rot] of [[0, 1, 0], [1, 0, Math.PI / 2]]) {
        const aw = new THREE.Mesh(
          new THREE.BoxGeometry((ax ? base.d : base.w) * 0.55, 0.25, 1.9),
          solid(cache, `awn_${col}`, col, 0.9)
        );
        aw.position.set(lot.x + ax * (base.w / 2 + 0.6), FH * 0.82, lot.z + az * (base.d / 2 + 0.6));
        aw.rotation.y = rot;
        aw.castShadow = true;
        group.add(aw);
      }
    }
  }

  // Fire escapes on older walk-ups and lofts.
  if ((type === 'loft' || type === 'brownstone') && b.floors >= 4) {
    const v = vols[0];
    const fe = new THREE.Mesh(
      new THREE.BoxGeometry(v.w * 0.42, b.floors * FH - FH, 0.9),
      solid(cache, 'escape', 0x2f3338, 0.95)
    );
    fe.position.set(lot.x, (b.floors * FH) / 2 + FH * 0.4, lot.z + v.d / 2 + 0.45);
    fe.castShadow = true;
    group.add(fe);
  }

  // Roof kit. Every New York roof has something on it.
  const top = vols[vols.length - 1];
  const roofY = (top.y0 + top.floors) * FH + 1.2;

  // A parapet, so a roof reads as somewhere you could stand.
  if (b.floors >= 6) {
    const pm = solid(cache, 'parapet', 0x6a6560, 0.93);
    for (const [dx, dz, w, d] of [
      [0, top.d / 2, top.w + 0.5, 0.45], [0, -top.d / 2, top.w + 0.5, 0.45],
      [top.w / 2, 0, 0.45, top.d + 0.5], [-top.w / 2, 0, 0.45, top.d + 0.5],
    ]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 1.15, d), pm);
      wall.position.set(lot.x + dx, roofY + 0.58, lot.z + dz);
      wall.castShadow = true;
      group.add(wall);
    }
  }
  if (b.floors <= 20 && rnd() < 0.75) {
    props.push({ kind: 'watertower', x: lot.x + (rnd() - 0.5) * top.w * 0.4,
                 y: roofY, z: lot.z + (rnd() - 0.5) * top.d * 0.4, s: 0.9 + rnd() * 0.3 });
  }
  props.push({ kind: 'bulkhead', x: lot.x + (rnd() - 0.5) * top.w * 0.3, y: roofY,
               z: lot.z + (rnd() - 0.5) * top.d * 0.3, s: 0.8 + rnd() * 0.5 });
  let mast = null;
  if (b.floors >= MAST_FLOORS) {
    // Tall enough to moor an airship. The mast is the reason the spire exists.
    const s = 1 + rnd() * 0.4;
    props.push({ kind: 'mooringMast', x: lot.x, y: roofY, z: lot.z, s });
    mast = { x: lot.x, y: roofY + 34 * s, z: lot.z };
  } else if (b.floors > 26) {
    props.push({ kind: 'mast', x: lot.x, y: roofY, z: lot.z, s: 1 + rnd() * 1.4 });
  }
  if (b.floors > 8 && rnd() < 0.5) {
    props.push({ kind: 'ac', x: lot.x + (rnd() - 0.5) * top.w * 0.5, y: roofY,
                 z: lot.z + (rnd() - 0.5) * top.d * 0.5, s: 0.7 + rnd() * 0.4 });
  }

  const topVol = vols[vols.length - 1];
  group.userData = {
    lotId: lot.id, type, props, mast, height: b.floors * FH,
    // Every deck this building has, lowest first: a setback is a surface you
    // can land on, not a line drawn on a slab.
    decks: vols.map((v) => ({
      top: (v.y0 + v.floors) * FH + 1.2, hw: v.w / 2, hd: v.d / 2,
    })),
    // Where the lift lets you out, and how far you can walk before the parapet.
    roof: { y: (topVol.y0 + topVol.floors) * FH + 1.2,
            hw: topVol.w / 2 - 1.2, hd: topVol.d / 2 - 1.2,
            x: lot.x, z: lot.z, floors: b.floors },
  };
  return group;
}

/** Geometry for the batched roof props, built once and instanced. */
/** The same volume stack the mesh uses, for drawing the building on paper. */
export function massingVolumes(lot, b) {
  return volumes(lot, b, mulberry32(lot.seed + 31));
}

export function roofPropGeometries() {
  const tank = new THREE.CylinderGeometry(1.5, 1.7, 3.4, 10);
  tank.translate(0, 5.2, 0);
  const cone = new THREE.ConeGeometry(1.9, 1.3, 10);
  cone.translate(0, 7.5, 0);
  const legs = new THREE.BoxGeometry(2.6, 3.6, 2.6);
  legs.translate(0, 1.8, 0);
  return {
    watertower: [tank, cone, legs],
    bulkhead: [(() => { const g = new THREE.BoxGeometry(4.2, 3, 3.4); g.translate(0, 1.5, 0); return g; })()],
    mast: [(() => { const g = new THREE.CylinderGeometry(0.16, 0.3, 14, 6); g.translate(0, 7, 0); return g; })()],
    mooringMast: [
      (() => { const g = new THREE.CylinderGeometry(0.9, 3.2, 26, 8); g.translate(0, 13, 0); return g; })(),
      (() => { const g = new THREE.CylinderGeometry(0.4, 0.9, 9, 8); g.translate(0, 30, 0); return g; })(),
      (() => { const g = new THREE.TorusGeometry(1.5, 0.28, 6, 12); g.rotateX(Math.PI / 2); g.translate(0, 34, 0); return g; })(),
    ],
    ac: [(() => { const g = new THREE.BoxGeometry(2.4, 1.2, 1.8); g.translate(0, 0.6, 0); return g; })()],
  };
}
