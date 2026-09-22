// Everything you can see. Reads world + sim state, never writes to it.

import * as THREE from 'three';
import { CONFIG, cellCenter, cellOf, mulberry32 } from './world.js';
import { makeBuilding, roofPropGeometries } from './architecture.js';
import { vehicleModels, CAR_PAINT, personParts, COAT_COLORS, SKIN_TONES, streetProps } from './models.js';

const OWNER_TINT = { player: 0x4ade80, r1: 0xd4664a, r2: 0xe0b341, r3: 0x6fa8c7 };
const MODEL_MIX = ['sedan', 'sedan', 'taxi', 'suv', 'sedan', 'van', 'sports', 'boxtruck', 'suv', 'taxi'];

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpV = new THREE.Vector3();
const tmpS = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);

/** Text baked to a canvas, with an outline so it survives any background. */
function textTexture(text, { size = 64, color = '#ffffff', outline = 'rgba(0,0,0,0.75)',
                             weight = 700, pad = 14, track = 0 } = {}) {
  const font = `${weight} ${size}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  const c = document.createElement('canvas');
  let g = c.getContext('2d');
  g.font = font;
  const label = track ? text.split('').join(String.fromCharCode(8202)) : text;
  c.width = Math.max(64, Math.ceil(g.measureText(label).width) + pad * 2);
  c.height = size + pad * 2;
  g = c.getContext('2d');
  g.font = font;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineWidth = Math.max(3, size / 10);
  g.strokeStyle = outline;
  g.strokeText(label, c.width / 2, c.height / 2);
  g.fillStyle = color;
  g.fillText(label, c.width / 2, c.height / 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return { texture: t, aspect: c.width / c.height };
}

function freeze(o) {
  o.updateMatrix();
  o.matrixAutoUpdate = false;
  return o;
}

export class CityScene {
  constructor(state, canvas) {
    this.state = state;
    this.city = state.city;
    this.matCache = new Map();

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.4, 6000);

    this.collisionGrid = new Map();   // built during _buildings(), so make it first
    this.clock = 0;

    this.terrain = new THREE.Group();
    this._lights();
    this._sky();
    this._water();
    this.scene.add(this.terrain);
    this._ground();
    this._streetLabels();
    this._streetFurniture();
    this._buildings();
    this._vehicles();
    this._crowd();
    this._highlight();
    this._vision();
    this._avatar();
    this._playerCar();

    this.rebuildCollision();
  }

  // ------------------------------------------------------------------ light

  _lights() {
    this.hemi = new THREE.HemisphereLight(0xbcd4ff, 0x30291f, 1.0);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff0dd, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = this.sun.shadow.camera;
    s.near = 20; s.far = 1400; s.left = -230; s.right = 230; s.top = 320; s.bottom = -230;
    this.sun.shadow.bias = -0.0009;
    this.sun.shadow.normalBias = 0.5;
    this.scene.add(this.sun, this.sun.target);

    this.scene.fog = new THREE.FogExp2(0x9fb3cc, 0.0004);
  }

  _sky() {
    this.skyUniforms = {
      uTop: { value: new THREE.Color(0x3f74c0) },
      uMid: { value: new THREE.Color(0x9fb3cc) },
      uBot: { value: new THREE.Color(0xd7c4a8) },
      uSun: { value: new THREE.Vector3(0.4, 0.5, 0.3) },
      uSunColor: { value: new THREE.Color(0xffd9a0) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 uTop, uMid, uBot, uSunColor;
        uniform vec3 uSun;
        varying vec3 vDir;
        void main() {
          float h = clamp(vDir.y * 1.15 + 0.08, -1.0, 1.0);
          vec3 c = h > 0.0 ? mix(uMid, uTop, pow(h, 0.7)) : mix(uMid, uBot, pow(-h, 0.55));
          float d = max(dot(normalize(vDir), normalize(uSun)), 0.0);
          c += uSunColor * (pow(d, 22.0) * 0.85 + pow(d, 4.0) * 0.16);
          gl_FragColor = vec4(c, 1.0);
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(3200, 24, 16), mat);
    this.sky.frustumCulled = false;
    this.scene.add(this.sky);
  }

  _water() {
    // A scrolling normal map is enough to make a flat plane read as river.
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    const img = g.createImageData(128, 128);
    for (let y = 0; y < 128; y++) {
      for (let x = 0; x < 128; x++) {
        const i = (y * 128 + x) * 4;
        const w = Math.sin(x * 0.28) * 0.5 + Math.sin((x * 0.11 + y * 0.19)) * 0.5;
        img.data[i] = 128 + w * 34;
        img.data[i + 1] = 128 + Math.sin(y * 0.24 + x * 0.05) * 30;
        img.data[i + 2] = 255;
        img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    this.waterNormal = new THREE.CanvasTexture(c);
    this.waterNormal.wrapS = this.waterNormal.wrapT = THREE.RepeatWrapping;
    this.waterNormal.repeat.set(90, 90);

    const mat = new THREE.MeshStandardMaterial({
      color: 0x1d3b4d, roughness: 0.16, metalness: 0.55,
      normalMap: this.waterNormal, normalScale: new THREE.Vector2(0.55, 0.55),
    });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(11000, 11000), mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(0, -0.6, 0);
    this.scene.add(freeze(plane));
  }

  // ----------------------------------------------------------------- ground

  _ground() {
    const { BLOCK, PITCH } = CONFIG;
    const cells = [...this.city.land.keys()].map((k) => k.split(',').map(Number));

    // Asphalt exists only where there is land; everything else is river.
    const roadMat = new THREE.MeshStandardMaterial({ color: 0x33363b, roughness: 0.97 });
    const roads = new THREE.InstancedMesh(
      new THREE.BoxGeometry(PITCH + 0.4, 0.5, PITCH + 0.4), roadMat, cells.length);
    roads.receiveShadow = true;
    cells.forEach(([col, row], i) => {
      const p = cellCenter(col, row);
      tmpM.makeTranslation(p.x, 0, p.z);
      roads.setMatrixAt(i, tmpM);
    });
    this.terrain.add(roads);

    const walkMat = new THREE.MeshStandardMaterial({ color: 0x93938f, roughness: 0.93 });
    const curbMat = new THREE.MeshStandardMaterial({ color: 0x6f7073, roughness: 0.9 });
    const parkMat = new THREE.MeshStandardMaterial({ color: 0x47693a, roughness: 1 });
    const pathMat = new THREE.MeshStandardMaterial({ color: 0x9b8f77, roughness: 1 });

    const walkGeo = new THREE.BoxGeometry(BLOCK + 6, 0.36, BLOCK + 6);
    const curbGeo = new THREE.BoxGeometry(BLOCK + 8, 0.2, BLOCK + 8);
    const normals = this.city.blocks.filter((b) => !b.isPark);
    const curbs = new THREE.InstancedMesh(curbGeo, curbMat, this.city.blocks.length);
    const walks = new THREE.InstancedMesh(walkGeo, walkMat, normals.length);
    curbs.receiveShadow = walks.receiveShadow = true;
    let wi = 0, ci = 0;
    for (const b of this.city.blocks) {
      tmpM.makeTranslation(b.cx, 0.24, b.cz);
      curbs.setMatrixAt(ci++, tmpM);
      if (b.isPark) { this._park(b, parkMat, pathMat); continue; }
      tmpM.makeTranslation(b.cx, 0.32, b.cz);
      walks.setMatrixAt(wi++, tmpM);
    }
    walks.count = wi; curbs.count = ci;
    this.terrain.add(walks, curbs);

    // Lane markings and crosswalks, drawn only where two cells actually meet.
    const { STREET } = CONFIG;
    const lines = [], zebras = [];
    const STRIPES = [-3, -2, -1, 0, 1, 2, 3];
    for (const [col, row] of cells) {
      const p = cellCenter(col, row);
      // Avenue running north-south along this cell's eastern edge.
      if (this.city.isLand(col + 1, row)) {
        const ax = p.x + PITCH / 2;
        lines.push([ax, p.z, 'ns']);
        for (const side of [-1, 1]) {
          for (const k of STRIPES) {
            zebras.push([ax, p.z + side * (BLOCK / 2 + 5) + k * 1.5, 'ns']);
          }
        }
      }
      // Cross street running east-west along this cell's southern edge.
      if (this.city.isLand(col, row + 1)) {
        const sz = p.z - PITCH / 2;
        lines.push([p.x, sz, 'ew']);
        for (const side of [-1, 1]) {
          for (const k of STRIPES) {
            zebras.push([p.x + side * (BLOCK / 2 + 5) + k * 1.5, sz, 'ew']);
          }
        }
      }
    }

    const place = (w, h, color, list, y) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color }), list.length);
      list.forEach(([x, z, axis], i) => {
        // The plane lies flat; roll it so its long side runs down the street.
        tmpQ.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, axis === 'ns' ? 0 : Math.PI / 2));
        tmpM.compose(tmpV.set(x, y, z), tmpQ, tmpS);
        im.setMatrixAt(i, tmpM);
      });
      this.terrain.add(im);
    };
    place(0.44, PITCH, 0xcdbd6d, lines, 0.28);       // centre line, along the street
    place(STREET - 2, 0.85, 0xd8d8d2, zebras, 0.29); // stripes, across it

    this._bridges();
  }

  /** Two crossings to the boroughs. They read from the board and from the water. */
  _bridges() {
    const { PITCH } = CONFIG;
    const steel = new THREE.MeshStandardMaterial({ color: 0x7d8288, roughness: 0.6, metalness: 0.45 });
    const cableMat = new THREE.LineBasicMaterial({ color: 0xa6adb4 });
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x4a4e54, roughness: 0.9 });
    const DECK_Y = 26, TOWER_H = 62;

    for (const [fromCol, toCol, row] of [[6, 8, 3], [6, 8, 11]]) {
      const a = cellCenter(fromCol, row), b = cellCenter(toCol, row);
      const x0 = a.x + PITCH / 2, x1 = b.x - PITCH / 2;
      const span = x1 - x0, z = a.z;

      const deck = new THREE.Mesh(new THREE.BoxGeometry(span, 1.6, 13), deckMat);
      deck.position.set((x0 + x1) / 2, DECK_Y, z);
      deck.castShadow = deck.receiveShadow = true;
      this.terrain.add(freeze(deck));

      const towers = [x0 + span * 0.18, x1 - span * 0.18];
      for (const tx of towers) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(5, TOWER_H, 8), steel);
        t.position.set(tx, TOWER_H / 2, z);
        t.castShadow = true;
        this.terrain.add(freeze(t));
      }

      // Main cable: anchored at each shore, over both towers, sagging between.
      const top = TOWER_H - 2;
      for (const side of [-6.2, 6.2]) {
        const pts = [new THREE.Vector3(x0, DECK_Y + 1, z + side)];
        pts.push(new THREE.Vector3(towers[0], top, z + side));
        const steps = 14;
        for (let i = 1; i < steps; i++) {
          const t = i / steps;                       // 0..1 between the towers
          const sag = 22 * (1 - Math.pow(2 * t - 1, 2));
          pts.push(new THREE.Vector3(towers[0] + (towers[1] - towers[0]) * t, top - sag, z + side));
        }
        pts.push(new THREE.Vector3(towers[1], top, z + side));
        pts.push(new THREE.Vector3(x1, DECK_Y + 1, z + side));
        this.terrain.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), cableMat));
      }

      // Ramps down to each shore.
      for (const [rx, dir] of [[x0, -1], [x1, 1]]) {
        const ramp = new THREE.Mesh(new THREE.BoxGeometry(PITCH, 1.4, 13), deckMat);
        ramp.position.set(rx + dir * PITCH / 2, DECK_Y / 2, z);
        ramp.rotation.z = dir * Math.atan2(DECK_Y, PITCH);
        ramp.castShadow = true;
        this.terrain.add(freeze(ramp));
      }
    }
  }

  _park(block, parkMat, pathMat) {
    const B = CONFIG.BLOCK;
    const lawn = new THREE.Mesh(new THREE.BoxGeometry(B + 5, 0.3, B + 5), parkMat);
    lawn.position.set(block.cx, 0.15, block.cz);
    lawn.receiveShadow = true;
    this.terrain.add(freeze(lawn));
    for (const rot of [0, Math.PI / 2]) {
      const path = new THREE.Mesh(new THREE.BoxGeometry(B + 5, 0.06, 4), pathMat);
      path.position.set(block.cx, 0.33, block.cz);
      path.rotation.y = rot;
      this.terrain.add(freeze(path));
    }
    this._trees(block);
  }

  _trees(block) {
    if (!this._treeGeo) {
      this._treeGeo = {
        trunk: new THREE.CylinderGeometry(0.22, 0.34, 3.6, 5),
        crown: new THREE.IcosahedronGeometry(1, 0),
        trunkMat: new THREE.MeshStandardMaterial({ color: 0x4b3a2a, roughness: 1 }),
        crownMat: new THREE.MeshStandardMaterial({ color: 0x3c6b30, roughness: 1 }),
      };
      this._treeSpots = [];
    }
    const rnd = mulberry32(block.bx * 91 + block.by * 17);
    for (let i = 0; i < 12; i++) {
      this._treeSpots.push([
        block.cx + (rnd() - 0.5) * CONFIG.BLOCK * 0.82,
        block.cz + (rnd() - 0.5) * CONFIG.BLOCK * 0.82,
        2.2 + rnd() * 1.4,
      ]);
    }
  }

  /** Street names painted down the middle of every road, read from above. */
  _streetLabels() {
    this.streetLabels = new THREE.Group();
    this.streetLabels.visible = false;
    this.scene.add(this.streetLabels);

    const { PITCH } = CONFIG;
    const H = 7.5;
    for (const c of this.city.corridors) {
      if (!c.lots.length) continue;
      const { texture, aspect } = textTexture(c.name.toUpperCase(),
        { size: 58, color: '#f2efe6', track: 1 });
      const mat = new THREE.MeshBasicMaterial({
        map: texture, transparent: true, depthWrite: false, fog: false });
      const geo = new THREE.PlaneGeometry(H * aspect, H);
      c._labelMat = mat;

      // One label per cell the corridor passes, laid in the street itself.
      const seen = new Set();
      for (const lot of c.lots) {
        const key = c.axis === 'ns' ? lot.row : lot.col;
        if (seen.has(key)) continue;
        seen.add(key);
        const p = cellCenter(lot.col, lot.row);
        const m = new THREE.Mesh(geo, mat);
        m.rotation.x = -Math.PI / 2;
        m.rotation.z = c.axis === 'ns' ? Math.PI / 2 : 0;
        if (c.axis === 'ns') m.position.set(p.x + PITCH / 2, 0.33, p.z);
        else m.position.set(p.x, 0.33, p.z - PITCH / 2);
        m.renderOrder = 2;
        this.streetLabels.add(freeze(m));
      }
    }
  }

  /** New land means new roads, kerbs, trees and signs. Redraw the lot. */
  rebuildTerrain() {
    const labelsVisible = this.streetLabels.visible;
    for (const g of [this.terrain, this.streetLabels]) {
      g.traverse((o) => { if (o.isMesh || o.isLine) o.geometry?.dispose(); });
      g.clear();
    }
    this._treeSpots = [];
    this._ground();
    this.scene.remove(this.streetLabels);
    this._streetLabels();
    this.streetLabels.visible = labelsVisible;
    this._streetFurniture();
    this.rebuildCollision();
  }

  /** Landfill in progress: a pad of rock rising out of the water. */
  updateFills(fills) {
    if (!this.fillGroup) {
      this.fillGroup = new THREE.Group();
      this.scene.add(this.fillGroup);
      this.fillByKey = new Map();
    }
    const live = new Set();
    for (const f of fills) {
      const key = `${f.col},${f.row}`;
      live.add(key);
      let g = this.fillByKey.get(key);
      if (!g) {
        const p = cellCenter(f.col, f.row);
        g = new THREE.Mesh(
          new THREE.BoxGeometry(CONFIG.PITCH - 4, 1, CONFIG.PITCH - 4),
          new THREE.MeshStandardMaterial({ color: 0x6b5f4a, roughness: 1 }));
        g.position.set(p.x, -4, p.z);
        g.receiveShadow = true;
        this.fillGroup.add(g);
        this.fillByKey.set(key, g);
      }
      const t = Math.max(0, Math.min(1, (this.state.day - f.startDay) / (f.endDay - f.startDay)));
      const h = 0.6 + t * 4.4;
      g.scale.y = h;
      g.position.y = -4.6 + h / 2 + t * 4.4;
    }
    for (const [key, g] of this.fillByKey) {
      if (live.has(key)) continue;
      this.fillGroup.remove(g);
      g.geometry.dispose();
      this.fillByKey.delete(key);
    }
  }

  /** Named streets glow once they've become destinations. */
  refreshCorridorLabels() {
    for (const c of this.city.corridors) {
      if (!c._labelMat) continue;
      c._labelMat.color.set(c.famous ? 0xffd98a : 0xf2efe6);
      c._labelMat.opacity = c.famous ? 1 : 0.78;
    }
  }

  setBoardMode(on) {
    this.streetLabels.visible = on;
  }

  _streetFurniture() {
    const B = CONFIG.BLOCK;
    const props = streetProps();

    // Street trees along the sidewalks, plus the park trees collected above.
    const spots = this._treeSpots || [];
    for (const b of this.city.blocks) {
      if (b.isPark) continue;
      const rnd = mulberry32(b.bx * 313 + b.by * 71);
      for (let i = 0; i < 4; i++) {
        const t = -0.32 + i * 0.21;
        const edge = Math.floor(rnd() * 4);
        const o = B / 2 + 1.6;
        const [x, z] = edge === 0 ? [b.cx + t * B, b.cz - o] : edge === 1 ? [b.cx + t * B, b.cz + o]
                     : edge === 2 ? [b.cx - o, b.cz + t * B] : [b.cx + o, b.cz + t * B];
        if (rnd() < 0.55) spots.push([x, z, 1.8 + rnd() * 1.1]);
      }
    }
    const tg = this._treeGeo;
    if (tg && spots.length) {
      const trunks = new THREE.InstancedMesh(tg.trunk, tg.trunkMat, spots.length);
      const crowns = new THREE.InstancedMesh(tg.crown, tg.crownMat, spots.length);
      crowns.castShadow = true;
      spots.forEach(([x, z, s], i) => {
        tmpM.compose(tmpV.set(x, 1.9, z), new THREE.Quaternion(), tmpS.set(1, 1, 1));
        trunks.setMatrixAt(i, tmpM);
        tmpM.compose(tmpV.set(x, 3.6 + s * 0.5, z), new THREE.Quaternion(), tmpS.set(s, s * 0.9, s));
        crowns.setMatrixAt(i, tmpM);
      });
      tmpS.set(1, 1, 1);
      this.terrain.add(trunks, crowns);
    }

    // Lamp posts at every corner, plus hydrants, refuse and traffic signals.
    const lamps = [], hydrants = [], trash = [], signals = [];
    for (const b of this.city.blocks) {
      const o = B / 2 + 2.2;
      const rnd = mulberry32(b.bx * 17 + b.by * 907);
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        lamps.push([b.cx + sx * o, b.cz + sz * o, sx > 0 ? Math.PI : 0]);
        if (rnd() < 0.55) signals.push([b.cx + sx * o * 1.06, b.cz + sz * o * 1.06]);
      }
      if (b.isPark) continue;
      if (rnd() < 0.8) hydrants.push([b.cx + (rnd() - 0.5) * B * 0.7, b.cz + (rnd() < 0.5 ? -1 : 1) * o * 0.92]);
      for (let i = 0; i < 3; i++) {
        if (rnd() < 0.5) trash.push([b.cx + (rnd() - 0.5) * B * 0.8, b.cz + (rnd() < 0.5 ? -1 : 1) * o * 0.88]);
      }
    }

    const place = (geo, mat, list, y, cast = true) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      im.castShadow = cast;
      list.forEach(([x, z, rot = 0], i) => {
        tmpQ.setFromAxisAngle(UP, rot);
        tmpM.compose(tmpV.set(x, y, z), tmpQ, tmpS);
        im.setMatrixAt(i, tmpM);
      });
      this.terrain.add(im);
      return im;
    };

    const metal = new THREE.MeshStandardMaterial({ color: 0x33373c, roughness: 0.7, metalness: 0.4 });
    place(props.lampPost, metal, lamps, 0.4);
    this.lampGlow = place(props.lampHead,
      new THREE.MeshStandardMaterial({ color: 0xffe2ac, emissive: 0xffd28a, emissiveIntensity: 0 }),
      lamps, 0.4, false);
    place(props.hydrant, new THREE.MeshStandardMaterial({ color: 0xb2452f, roughness: 0.75 }), hydrants, 0.4);
    place(props.trash, new THREE.MeshStandardMaterial({ color: 0x1b1d20, roughness: 0.95 }), trash, 0.4);
    place(props.trafficLight, metal, signals, 0.4);
  }

  // -------------------------------------------------------------- buildings

  _buildings() {
    this.buildingGroup = new THREE.Group();
    this.siteGroup = new THREE.Group();
    this.roofGroup = new THREE.Group();
    this.scene.add(this.buildingGroup, this.siteGroup, this.roofGroup);
    this.buildingByLot = new Map();
    this.siteByLot = new Map();
    this.roofGeo = roofPropGeometries();
    this.roofMats = {
      watertower: new THREE.MeshStandardMaterial({ color: 0x6b4f38, roughness: 0.95 }),
      bulkhead: new THREE.MeshStandardMaterial({ color: 0x7a7269, roughness: 0.9 }),
      mast: new THREE.MeshStandardMaterial({ color: 0x53585e, roughness: 0.6, metalness: 0.5 }),
      ac: new THREE.MeshStandardMaterial({ color: 0x8e9299, roughness: 0.7, metalness: 0.3 }),
    };
    this.syncBuildings();
  }

  /** A name on the building, sized to the facade, on the two visible faces. */
  _addSignage(g, lot) {
    if (!lot.name) return;
    // Signage belongs on the base, above the entrance — a tower that steps back
    // leaves nothing under a sign hung at the top.
    const base = g.children.find((c) => c.geometry?.parameters?.width);
    if (!base) return;
    const bw = base.geometry.parameters.width;
    const bd = base.geometry.parameters.depth;
    const bh = base.geometry.parameters.height;
    const { texture, aspect } = textTexture(lot.name.toUpperCase(),
      { size: 72, color: '#f6f1e4', outline: 'rgba(0,0,0,0.85)', track: 1 });
    const h = Math.min((bw * 0.82) / aspect, bh * 0.3, 3.4);
    const mat = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, fog: false });
    const y = Math.min(base.position.y + bh / 2 - h, CONFIG.FLOOR_H * 1.35);
    const geo = new THREE.PlaneGeometry(h * aspect, h);
    const halfW = bw / 2, halfD = bd / 2;
    for (const [dx, dz, rot] of [[0, halfD + 0.32, 0], [halfW + 0.32, 0, Math.PI / 2]]) {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(lot.x + dx, y, lot.z + dz);
      m.rotation.y = rot;
      m.renderOrder = 3;
      g.add(freeze(m));
    }
  }

  _makeBuilding(lot) {
    const g = makeBuilding(lot, lot.building, this.matCache);
    const tint = OWNER_TINT[lot.building.builtBy];
    for (const child of g.children) {
      freeze(child);
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      if (tint && mats.some((m) => m && m.emissiveMap)) {
        // Owner colour shows as a faint wash so you can read the skyline.
        child.userData.ownerTint = tint;
      }
    }
    this._addSignage(g, lot);
    g.matrixAutoUpdate = false;
    g.updateMatrix();
    this.buildingGroup.add(g);
    return g;
  }

  syncBuildings() {
    let changed = false;
    for (const lot of this.city.lots) {
      const has = this.buildingByLot.get(lot.id);
      const b = lot.building;
      const sig = b
        ? `${b.floors}_${b.use}_${b.style || '-'}_${b.form || '-'}_${b.variant ?? '-'}`
          + `_${Math.round((b.condition ?? 1) * 4)}_${lot.name || ''}`
        : null;

      if (b && (!has || has.userData.sig !== sig)) {
        if (has) this.buildingGroup.remove(has);
        const g = this._makeBuilding(lot);
        g.userData.sig = sig;
        this.buildingByLot.set(lot.id, g);
        changed = true;
      } else if (!b && has) {
        this.buildingGroup.remove(has);
        this.buildingByLot.delete(lot.id);
        changed = true;
      }

      const site = this.siteByLot.get(lot.id);
      if (lot.project && !site) { this._makeSite(lot); changed = true; }
      else if (!lot.project && site) {
        this.siteGroup.remove(site);
        this.siteByLot.delete(lot.id);
        changed = true;
      }
    }
    if (changed) { this._rebuildRoofProps(); this.rebuildCollision(); this._lit = undefined; }
  }

  _rebuildRoofProps() {
    this.roofGroup.clear();
    const buckets = { watertower: [], bulkhead: [], mast: [], ac: [] };
    for (const g of this.buildingByLot.values()) {
      for (const p of g.userData.props || []) buckets[p.kind]?.push(p);
    }
    for (const kind in buckets) {
      const list = buckets[kind];
      if (!list.length) continue;
      for (const geo of this.roofGeo[kind]) {
        const im = new THREE.InstancedMesh(geo, this.roofMats[kind], list.length);
        im.castShadow = true;
        list.forEach((p, i) => {
          tmpM.compose(tmpV.set(p.x, p.y, p.z), new THREE.Quaternion(), tmpS.set(p.s, p.s, p.s));
          im.setMatrixAt(i, tmpM);
        });
        tmpS.set(1, 1, 1);
        this.roofGroup.add(im);
      }
    }
  }

  _makeSite(lot) {
    const g = new THREE.Group();
    const mud = new THREE.Mesh(
      new THREE.BoxGeometry(lot.w * 0.97, 0.8, lot.d * 0.97),
      new THREE.MeshStandardMaterial({ color: 0x5d5344, roughness: 1 })
    );
    mud.position.set(lot.x, 0.4, lot.z);
    mud.receiveShadow = true;

    // Hoarding around the site — the blue plywood fence.
    const fenceMat = new THREE.MeshStandardMaterial({ color: 0x2f5f86, roughness: 0.9 });
    for (const [sx, sz, w, d] of [[0, -1, lot.w, 0.3], [0, 1, lot.w, 0.3], [-1, 0, 0.3, lot.d], [1, 0, 0.3, lot.d]]) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(w, 2.4, d), fenceMat);
      f.position.set(lot.x + sx * lot.w / 2, 1.2, lot.z + sz * lot.d / 2);
      f.castShadow = true;
      g.add(freeze(f));
    }

    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(lot.w * 0.72, 1, lot.d * 0.72),
      new THREE.MeshStandardMaterial({ color: 0xa9a294, roughness: 0.92 })
    );
    slab.castShadow = slab.receiveShadow = true;

    const scaffold = new THREE.Mesh(
      new THREE.BoxGeometry(lot.w * 0.76, 1, lot.d * 0.76),
      new THREE.MeshStandardMaterial({ color: 0xc9b98f, roughness: 0.9, transparent: true, opacity: 0.4, wireframe: true })
    );

    const craneMat = new THREE.MeshStandardMaterial({ color: 0xe0a33a, roughness: 0.6, metalness: 0.3 });
    const mast = new THREE.Mesh(new THREE.BoxGeometry(1.1, 40, 1.1), craneMat);
    const jib = new THREE.Mesh(new THREE.BoxGeometry(30, 0.8, 0.8), craneMat);
    const counter = new THREE.Mesh(new THREE.BoxGeometry(7, 1.2, 1.2), craneMat);
    mast.castShadow = jib.castShadow = true;
    const craneX = lot.x + lot.w * 0.36, craneZ = lot.z + lot.d * 0.36;

    g.add(mud, slab, scaffold, mast, jib, counter);
    g.userData = { lot, slab, scaffold, mast, jib, counter, craneX, craneZ };
    this.siteGroup.add(g);
    this.siteByLot.set(lot.id, g);
    return g;
  }

  updateSites(dt) {
    for (const g of this.siteByLot.values()) {
      const lot = g.userData.lot;
      const p = lot.project;
      if (!p) continue;
      const t = Math.max(0, Math.min(1, (this.state.day - p.startDay) / (p.endDay - p.startDay)));
      const full = p.floors * CONFIG.FLOOR_H;
      const h = Math.max(1.2, t * full);

      g.userData.slab.scale.y = h;
      g.userData.slab.position.set(lot.x, h / 2 + 0.8, lot.z);
      g.userData.scaffold.scale.y = Math.min(full, h + 4);
      g.userData.scaffold.position.set(lot.x, Math.min(full, h + 4) / 2 + 0.8, lot.z);

      const craneH = Math.max(46, full + 22);
      g.userData.mast.scale.y = craneH / 40;
      g.userData.mast.position.set(g.userData.craneX, craneH / 2, g.userData.craneZ);
      const spin = this.clock * 0.09 + lot.id;
      for (const [part, off, len] of [[g.userData.jib, 11, 0], [g.userData.counter, -5, 0]]) {
        part.position.set(
          g.userData.craneX + Math.cos(spin) * off, craneH - 2, g.userData.craneZ + Math.sin(spin) * off
        );
        part.rotation.y = -spin;
      }
    }
  }

  // --------------------------------------------------------------- vehicles

  _vehicles() {
    const models = vehicleModels();
    const COUNT = 110;
    const rnd = mulberry32(4242);
    const { PITCH } = CONFIG;

    const ns = [...this.city.lanes.ns.entries()];
    const ew = [...this.city.lanes.ew.entries()];
    this.cars = [];
    const byModel = {};

    for (let i = 0; i < COUNT; i++) {
      const model = MODEL_MIX[Math.floor(rnd() * MODEL_MIX.length)];
      const northSouth = rnd() < 0.55;
      const pool = northSouth ? ns : ew;
      const [idx, span] = pool[Math.floor(rnd() * pool.length)];
      const dir = rnd() < 0.5 ? 1 : -1;
      // Avenues sit on a cell's eastern edge, cross streets on its southern one.
      const lane = northSouth
        ? cellCenter(idx, 0).x + PITCH / 2 + dir * 4.2
        : cellCenter(0, idx).z - PITCH / 2 - dir * 4.2;
      const car = {
        model, northSouth, lane, span, dir,
        pos: span[0] + rnd() * (span[1] - span[0]),
        speed: (model === 'boxtruck' ? 7 : model === 'sports' ? 17 : 11) + rnd() * 7,
        idx: 0,
      };
      (byModel[model] ||= []).push(car);
      this.cars.push(car);
    }

    this.carMeshes = [];
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x14181e, roughness: 0.12, metalness: 0.65 });
    for (const model in byModel) {
      const list = byModel[model];
      const spec = models[model];
      const body = new THREE.InstancedMesh(
        spec.body, new THREE.MeshStandardMaterial({ roughness: 0.38, metalness: 0.45 }), list.length);
      const glass = new THREE.InstancedMesh(spec.glass, glassMat, list.length);
      const lamps = new THREE.InstancedMesh(spec.lamps,
        new THREE.MeshStandardMaterial({ color: 0xfff2d4, emissive: 0xffcf8f, emissiveIntensity: 0 }),
        list.length);
      body.castShadow = true;
      const c = new THREE.Color();
      list.forEach((car, i) => {
        car.idx = i;
        c.setHex(spec.fixedColor
          ?? CAR_PAINT[Math.floor(mulberry32(i * 77 + model.length)() * CAR_PAINT.length)]);
        body.setColorAt(i, c);
      });
      if (body.instanceColor) body.instanceColor.needsUpdate = true;
      this.scene.add(body, glass, lamps);
      this.carMeshes.push({ model, list, body, glass, lamps });
    }
    this.carLampMats = this.carMeshes.map((m) => m.lamps.material);
  }

  updateTraffic(dt) {
    for (const car of this.cars) {
      car.pos += car.speed * car.dir * dt;
      const [lo, hi] = car.span;
      if (car.pos > hi) car.pos = lo;
      if (car.pos < lo) car.pos = hi;
    }
    for (const set of this.carMeshes) {
      for (const car of set.list) {
        const x = car.northSouth ? car.lane : car.pos;
        const z = car.northSouth ? car.pos : car.lane;
        // The models point down -Z, so face them along travel.
        const yaw = car.northSouth
          ? (car.dir > 0 ? Math.PI : 0)
          : (car.dir > 0 ? -Math.PI / 2 : Math.PI / 2);
        tmpQ.setFromAxisAngle(UP, yaw);
        tmpM.compose(tmpV.set(x, 0.03, z), tmpQ, tmpS);
        set.body.setMatrixAt(car.idx, tmpM);
        set.glass.setMatrixAt(car.idx, tmpM);
        set.lamps.setMatrixAt(car.idx, tmpM);
      }
      set.body.instanceMatrix.needsUpdate = true;
      set.glass.instanceMatrix.needsUpdate = true;
      set.lamps.instanceMatrix.needsUpdate = true;
    }
  }

  // ----------------------------------------------------------------- people

  _crowd() {
    const COUNT = 240;
    const parts = personParts();
    const rnd = mulberry32(909);

    const coatMat = new THREE.MeshStandardMaterial({ roughness: 0.88 });
    const headMat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    const legMat = new THREE.MeshStandardMaterial({ color: 0x25272c, roughness: 0.9 });

    this.pCoat = new THREE.InstancedMesh(parts.coat, coatMat, COUNT);
    this.pHead = new THREE.InstancedMesh(parts.head, headMat, COUNT);
    this.pLegA = new THREE.InstancedMesh(parts.leg, legMat, COUNT);
    this.pLegB = new THREE.InstancedMesh(parts.leg, legMat, COUNT);
    this.pCoat.castShadow = true;

    const c = new THREE.Color();
    const cells = [...this.city.land.keys()].map((k) => k.split(',').map(Number));
    this.peds = [];
    for (let i = 0; i < COUNT; i++) {
      const [col, row] = cells[Math.floor(rnd() * cells.length)];
      const spot = cellCenter(col, row);
      this.peds.push({
        x: spot.x + (rnd() - 0.5) * CONFIG.BLOCK, z: spot.z + (rnd() - 0.5) * CONFIG.BLOCK,
        dir: rnd() * Math.PI * 2, speed: 1.0 + rnd() * 1.0,
        scale: 0.92 + rnd() * 0.18, phase: rnd() * 6.28, turn: rnd() * 5,
      });
      c.setHex(COAT_COLORS[Math.floor(rnd() * COAT_COLORS.length)]);
      this.pCoat.setColorAt(i, c);
      c.setHex(SKIN_TONES[Math.floor(rnd() * SKIN_TONES.length)]);
      this.pHead.setColorAt(i, c);
    }
    if (this.pCoat.instanceColor) this.pCoat.instanceColor.needsUpdate = true;
    if (this.pHead.instanceColor) this.pHead.instanceColor.needsUpdate = true;
    this.scene.add(this.pCoat, this.pHead, this.pLegA, this.pLegB);
  }

  /** Pedestrians live near the camera and are recycled in front of you. */
  updateCrowd(dt, focus) {
    const halfBlock = CONFIG.BLOCK / 2 + 2.6;
    const legQ = new THREE.Quaternion();
    for (let i = 0; i < this.peds.length; i++) {
      const p = this.peds[i];
      p.phase += dt * p.speed * 5.4;
      p.turn -= dt;
      p.x += Math.cos(p.dir) * p.speed * dt;
      p.z += Math.sin(p.dir) * p.speed * dt;
      if (p.turn < 0) { p.dir += (Math.random() - 0.5) * 1.5; p.turn = 3 + Math.random() * 5; }

      const dx = p.x - focus.x, dz = p.z - focus.z;
      const far = dx * dx + dz * dz > 170 * 170;
      const here = cellOf(p.x, p.z);
      // Recycle anyone who has drifted too far, or out over the water.
      if (far || !this.city.isLand(here.col, here.row)) {
        const a = Math.random() * Math.PI * 2, r = 45 + Math.random() * 95;
        const nx = focus.x + Math.cos(a) * r, nz = focus.z + Math.sin(a) * r;
        const c = cellOf(nx, nz);
        if (!this.city.isLand(c.col, c.row)) { const f = cellOf(focus.x, focus.z); p.x = cellCenter(f.col, f.row).x; p.z = cellCenter(f.col, f.row).z; }
        else { p.x = nx; p.z = nz; }
      }
      const cell = cellOf(p.x, p.z);
      const centre = cellCenter(cell.col, cell.row);
      const cx = centre.x, cz = centre.z;
      const lx = p.x - cx, lz = p.z - cz;
      if (Math.abs(lx) > halfBlock) { p.x = cx + Math.sign(lx) * halfBlock; p.dir = Math.PI - p.dir; }
      if (Math.abs(lz) > halfBlock) { p.z = cz + Math.sign(lz) * halfBlock; p.dir = -p.dir; }

      const s = p.scale;
      const swing = Math.sin(p.phase) * 0.62;
      const bob = Math.abs(Math.cos(p.phase)) * 0.035;
      const yaw = -p.dir + Math.PI / 2;
      tmpQ.setFromAxisAngle(UP, yaw);
      tmpS.set(s, s, s);

      tmpM.compose(tmpV.set(p.x, (1.06 + bob) * s, p.z), tmpQ, tmpS);
      this.pCoat.setMatrixAt(i, tmpM);
      tmpM.compose(tmpV.set(p.x, (1.52 + bob) * s, p.z), tmpQ, tmpS);
      this.pHead.setMatrixAt(i, tmpM);

      for (const [mesh, sign, off] of [[this.pLegA, 1, -0.09], [this.pLegB, -1, 0.09]]) {
        legQ.setFromAxisAngle(UP, yaw);
        legQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), swing * sign));
        tmpV.set(p.x + Math.cos(yaw) * off * s, 0.74 * s + bob, p.z - Math.sin(yaw) * off * s);
        tmpM.compose(tmpV, legQ, tmpS);
        mesh.setMatrixAt(i, tmpM);
      }
    }
    tmpS.set(1, 1, 1);
    for (const m of [this.pCoat, this.pHead, this.pLegA, this.pLegB]) m.instanceMatrix.needsUpdate = true;
  }

  // -------------------------------------------------------------- highlight

  _highlight() {
    this.highlightGroup = new THREE.Group();
    this.scene.add(this.highlightGroup);
    this.highlightOwner = null;
  }

  /** Light up everything one developer owns, so you can read their position. */
  setOwnerHighlight(ownerId) {
    this.highlightOwner = ownerId;
    for (const c of this.highlightGroup.children) c.geometry.dispose();
    this.highlightGroup.clear();
    this.highlightPulse = null;
    if (!ownerId) return 0;

    const lots = this.city.lots.filter((l) => l.owner === ownerId);
    if (!lots.length) return 0;
    const color = OWNER_TINT[ownerId] ?? 0xffffff;

    const padMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.34, depthWrite: false, fog: false });
    const beamMat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.12, depthWrite: false, fog: false });
    const pads = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.5, 1), padMat, lots.length);
    const beams = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), beamMat, lots.length);
    pads.renderOrder = 4; beams.renderOrder = 4;

    const q = new THREE.Quaternion();
    lots.forEach((lot, i) => {
      tmpM.compose(tmpV.set(lot.x, 0.85, lot.z), q, tmpS.set(lot.w * 1.02, 1, lot.d * 1.02));
      pads.setMatrixAt(i, tmpM);
      // A column tall enough to spot from the board, keyed to what's on the lot.
      const floors = lot.building?.floors ?? lot.project?.floors ?? 4;
      const h = floors * CONFIG.FLOOR_H + 34;
      tmpM.compose(tmpV.set(lot.x, h / 2, lot.z), q, tmpS.set(lot.w * 0.5, h, lot.d * 0.5));
      beams.setMatrixAt(i, tmpM);
    });
    tmpS.set(1, 1, 1);
    this.highlightGroup.add(pads, beams);
    this.highlightPulse = { padMat, beamMat };
    return lots.length;
  }

  updateHighlight() {
    if (!this.highlightPulse) return;
    const t = 0.72 + Math.sin(this.clock * 2.4) * 0.28;
    this.highlightPulse.padMat.opacity = 0.34 * t;
    this.highlightPulse.beamMat.opacity = 0.14 * t;
  }

  // ----------------------------------------------------------------- vision

  _vision() {
    this.vision = new THREE.Group();
    this.vision.visible = false;
    const env = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0x4fb8ff, transparent: true, opacity: 0.1, depthWrite: false }));
    const wire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 0x8fe6ff, transparent: true, opacity: 0.9 }));
    const ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xcdeeff, transparent: true, opacity: 0.26, depthWrite: false }));
    const ghostWire = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 }));
    this.vision.add(env, wire, ghost, ghostWire);
    this.visionParts = { env, wire, ghost, ghostWire };
    this.scene.add(this.vision);
  }

  showVision(lot, floors) {
    if (!lot) { this.vision.visible = false; return; }
    const { env, wire, ghost, ghostWire } = this.visionParts;
    const minF = Math.max(1, Math.ceil(lot.far / CONFIG.MAX_COVERAGE));
    const envH = Math.max(minF, floors) * CONFIG.FLOOR_H * 1.02;
    for (const o of [env, wire]) {
      o.scale.set(lot.w * 0.96, envH, lot.d * 0.96);
      o.position.set(lot.x, envH / 2 + 0.5, lot.z);
    }
    const entitled = lot.areaSf * lot.far;
    const perFloor = lot.areaSf * CONFIG.MAX_COVERAGE;
    const gsf = Math.min(entitled, floors * perFloor);
    const side = Math.sqrt((gsf / floors) / CONFIG.SF_PER_M2);
    const h = floors * CONFIG.FLOOR_H;
    for (const o of [ghost, ghostWire]) {
      o.scale.set(side, h, side);
      o.position.set(lot.x, h / 2 + 0.5, lot.z);
    }
    this.vision.visible = true;
  }

  hideVision() { this.vision.visible = false; }

  // ----------------------------------------------------------------- avatar

  _avatar() {
    const parts = personParts();
    const g = new THREE.Group();
    const coat = new THREE.Mesh(parts.coat, new THREE.MeshStandardMaterial({ color: 0x2b3440, roughness: 0.8 }));
    coat.position.y = 1.08;
    const head = new THREE.Mesh(parts.head, new THREE.MeshStandardMaterial({ color: 0xd9ab84, roughness: 0.85 }));
    head.position.y = 1.55;
    const legMat = new THREE.MeshStandardMaterial({ color: 0x1f2126, roughness: 0.9 });
    this.avatarLegs = [
      new THREE.Mesh(parts.leg, legMat), new THREE.Mesh(parts.leg, legMat),
    ];
    this.avatarLegs[0].position.set(-0.09, 0.76, 0);
    this.avatarLegs[1].position.set(0.09, 0.76, 0);
    coat.castShadow = head.castShadow = true;
    g.add(coat, head, ...this.avatarLegs);
    this.avatar = g;
    this.avatarPhase = 0;
    this.scene.add(g);
  }

  animateAvatar(dt, moving) {
    this.avatarPhase += dt * (moving ? 9 : 0);
    const swing = moving ? Math.sin(this.avatarPhase) * 0.6 : 0;
    this.avatarLegs[0].rotation.x = swing;
    this.avatarLegs[1].rotation.x = -swing;
  }

  _playerCar() {
    const spec = vehicleModels().sedan;
    const g = new THREE.Group();
    const body = new THREE.Mesh(spec.body, new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.3, metalness: 0.55 }));
    const glass = new THREE.Mesh(spec.glass, new THREE.MeshStandardMaterial({ color: 0x0f1319, roughness: 0.1, metalness: 0.7 }));
    this.playerLamps = new THREE.Mesh(spec.lamps,
      new THREE.MeshStandardMaterial({ color: 0xfff2d4, emissive: 0xffcf8f, emissiveIntensity: 0 }));
    body.castShadow = true;
    g.add(body, glass, this.playerLamps);
    g.position.y = 0.03;
    this.playerCar = g;
    this.scene.add(g);
  }

  // -------------------------------------------------------------- collision

  rebuildCollision() {
    this.collisionGrid.clear();
    const add = (key, boxDef) => {
      if (!this.collisionGrid.has(key)) this.collisionGrid.set(key, []);
      this.collisionGrid.get(key).push(boxDef);
    };
    for (const lot of this.city.lots) {
      let hw, hd;
      if (lot.building) { hw = lot.w * 0.94 / 2; hd = lot.d * 0.94 / 2; }
      else if (lot.project) { hw = lot.w * 0.97 / 2; hd = lot.d * 0.97 / 2; }
      else continue;
      add(`${lot.bx},${lot.by}`, { x: lot.x, z: lot.z, hw, hd });
    }
  }

  resolveCollision(x, z, radius = 0.5) {
    const { col: bx, row: by } = cellOf(x, z);
    let nx = x, nz = z;
    for (let ix = bx - 1; ix <= bx + 1; ix++) {
      for (let iy = by - 1; iy <= by + 1; iy++) {
        const list = this.collisionGrid.get(`${ix},${iy}`);
        if (!list) continue;
        for (const b of list) {
          const dx = nx - b.x, dz = nz - b.z;
          const ox = b.hw + radius - Math.abs(dx);
          const oz = b.hd + radius - Math.abs(dz);
          if (ox > 0 && oz > 0) {
            if (ox < oz) nx = b.x + Math.sign(dx || 1) * (b.hw + radius);
            else nz = b.z + Math.sign(dz || 1) * (b.hd + radius);
          }
        }
      }
    }
    return [nx, nz];
  }

  // -------------------------------------------------------------- day cycle

  updateSky(hour, focus = { x: 0, z: 0 }, dt = 0) {
    this.clock += dt;
    this.waterNormal.offset.x = this.clock * 0.006;
    this.waterNormal.offset.y = this.clock * 0.0035;

    const t = (hour - 5.5) / 13;               // daylight 5:30 to 18:30
    const elev = Math.sin(Math.max(0, Math.min(1, t)) * Math.PI);
    const day = Math.max(0, elev);
    const ang = t * Math.PI;

    const dir = new THREE.Vector3(Math.cos(ang) * 0.85, Math.max(0.1, elev), Math.sin(ang) * 0.55 - 0.3).normalize();
    this.sun.position.set(focus.x + dir.x * 420, dir.y * 480 + 60, focus.z + dir.z * 420);
    this.sun.target.position.set(focus.x, 0, focus.z);
    this.sun.target.updateMatrixWorld();
    this.sun.intensity = 0.25 + day * 3.3;
    this.sun.color.setHSL(0.09 + (1 - day) * 0.02, 0.45 - day * 0.3, 0.55 + day * 0.28);
    this.hemi.intensity = 0.3 + day * 1.35;
    this.hemi.color.setHSL(0.6, 0.3, 0.35 + day * 0.45);

    const dusk = day > 0 && day < 0.3;
    this.skyUniforms.uSun.value.copy(dir);
    this.skyUniforms.uTop.value.setHSL(0.6, 0.55, 0.06 + day * 0.4);
    this.skyUniforms.uMid.value.setHSL(0.58, 0.4, 0.07 + day * 0.58);
    this.skyUniforms.uBot.value.setHSL(dusk ? 0.06 : 0.55, dusk ? 0.6 : 0.3, 0.08 + day * 0.62);
    this.skyUniforms.uSunColor.value.setHSL(0.09, 0.7, 0.2 + day * 0.35);

    const fogC = this.skyUniforms.uMid.value;
    this.scene.fog.color.copy(fogC);
    this.scene.fog.density = 0.00030 + (1 - day) * 0.00035;

    const lit = 1 - Math.min(1, day * 2.4);
    if (this._lit === undefined || Math.abs(lit - this._lit) > 0.02) {
      this._lit = lit;
      for (const g of this.buildingByLot.values()) {
        for (const child of g.children) {
          // Volumes carry a material array (walls + roof caps), so check both.
          for (const m of Array.isArray(child.material) ? child.material : [child.material]) {
            if (!m) continue;
            if (m.emissiveMap) m.emissiveIntensity = lit * 0.95 * (m.userData.litScale ?? 1);
            else if (m.userData.shopGlow) m.emissiveIntensity = lit * 0.55;
          }
        }
      }
      this.lampGlow.material.emissiveIntensity = lit * 2.4;
      for (const m of this.carLampMats) m.emissiveIntensity = lit * 2.2;
      this.playerLamps.material.emissiveIntensity = lit * 2.2;
    }
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  render() { this.renderer.render(this.scene, this.camera); }
}
