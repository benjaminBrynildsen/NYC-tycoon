// Everything you can see: the city mesh, traffic, crowds, sky and the Vision
// envelope. Reads world + sim state, never writes to it.

import * as THREE from 'three';
import { CONFIG, DISTRICTS, massing, minFloors, buildableSf, mulberry32 } from './world.js';

const OWNER_COLORS = {
  player: 0x4ade80, r1: 0xd4664a, r2: 0xe0b341, r3: 0x6fa8c7, npc: null,
};

function windowTexture(styleSeed) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const rnd = mulberry32(styleSeed);
  const base = ['#6b6f76', '#7a7168', '#5f6b74', '#847a6e'][styleSeed % 4];
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const lit = rnd();
      g.fillStyle = `rgba(20,24,30,${0.55 + lit * 0.3})`;
      g.fillRect(x * 16 + 3, y * 16 + 4, 10, 9);
    }
  }
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < 4; y++) g.fillRect(0, y * 16 + 14, 64, 2);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function emissiveTexture(styleSeed) {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 64;
  const g = c.getContext('2d');
  const rnd = mulberry32(styleSeed + 555);
  g.fillStyle = '#000'; g.fillRect(0, 0, 64, 64);
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      if (rnd() < 0.55) {
        const warm = rnd();
        g.fillStyle = warm < 0.7 ? '#ffd79a' : '#cfe4ff';
        g.fillRect(x * 16 + 3, y * 16 + 4, 10, 9);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class CityScene {
  constructor(state, canvas) {
    this.state = state;
    this.city = state.city;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.5, 4000);

    this.winTex = [0, 1, 2, 3].map(windowTexture);
    this.emTex = [0, 1, 2, 3].map(emissiveTexture);

    this.buildingByLot = new Map();
    this.buildingGroup = new THREE.Group();
    this.scene.add(this.buildingGroup);

    this._buildSky();
    this._buildGround();
    this._buildAllBuildings();
    this._buildTraffic();
    this._buildCrowd();
    this._buildVision();
    this._buildAvatar();
    this._buildPlayerCar();

    this.collisionGrid = new Map();
    this.rebuildCollision();
  }

  // ------------------------------------------------------------------ setup

  _buildSky() {
    this.hemi = new THREE.HemisphereLight(0xbcd4ff, 0x2a2622, 1.0);
    this.scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xfff0dd, 2.4);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = this.sun.shadow.camera;
    s.near = 1; s.far = 900; s.left = -260; s.right = 260; s.top = 260; s.bottom = -260;
    this.sun.shadow.bias = -0.0008;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.scene.fog = new THREE.Fog(0x9fb3cc, 320, 1700);
    this.scene.background = new THREE.Color(0x9fb3cc);
  }

  _buildGround() {
    const E = CONFIG.EXTENT;
    const asphalt = new THREE.Mesh(
      new THREE.PlaneGeometry(E * 1.6, E * 1.6),
      new THREE.MeshStandardMaterial({ color: 0x2f3236, roughness: 0.95 })
    );
    asphalt.rotation.x = -Math.PI / 2;
    asphalt.receiveShadow = true;
    this.scene.add(asphalt);

    // Sidewalks and parks, one slab per block.
    const walkMat = new THREE.MeshStandardMaterial({ color: 0x8c8d8a, roughness: 0.92 });
    const parkMat = new THREE.MeshStandardMaterial({ color: 0x4a6b3c, roughness: 1 });
    const geo = new THREE.BoxGeometry(CONFIG.BLOCK + 5, 0.4, CONFIG.BLOCK + 5);
    const walks = new THREE.InstancedMesh(geo, walkMat, this.city.blocks.length);
    const parks = [];
    let wi = 0;
    const m = new THREE.Matrix4();
    for (const b of this.city.blocks) {
      if (b.isPark) {
        const p = new THREE.Mesh(geo, parkMat);
        p.position.set(b.cx, 0.2, b.cz);
        p.receiveShadow = true;
        this.scene.add(p);
        parks.push(p);
        this._addTrees(b);
        continue;
      }
      m.makeTranslation(b.cx, 0.2, b.cz);
      walks.setMatrixAt(wi++, m);
    }
    walks.count = wi;
    walks.receiveShadow = true;
    walks.instanceMatrix.needsUpdate = true;
    this.scene.add(walks);

    // Lane markings down the middle of every street.
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xd8c76a });
    const half = CONFIG.EXTENT / 2;
    for (let i = 0; i <= CONFIG.GRID; i++) {
      const pos = -half + i * CONFIG.PITCH;
      for (const axis of ['x', 'z']) {
        const g = new THREE.Mesh(new THREE.PlaneGeometry(axis === 'x' ? 0.5 : CONFIG.EXTENT, axis === 'x' ? CONFIG.EXTENT : 0.5), lineMat);
        g.rotation.x = -Math.PI / 2;
        g.position.set(axis === 'x' ? pos : 0, 0.05, axis === 'x' ? 0 : pos);
        this.scene.add(g);
      }
    }
  }

  _addTrees(block) {
    const rnd = mulberry32(block.bx * 91 + block.by * 17);
    const trunk = new THREE.MeshStandardMaterial({ color: 0x4b3a2a, roughness: 1 });
    const leaf = new THREE.MeshStandardMaterial({ color: 0x3f6b32, roughness: 1 });
    for (let i = 0; i < 9; i++) {
      const x = block.cx + (rnd() - 0.5) * CONFIG.BLOCK * 0.8;
      const z = block.cz + (rnd() - 0.5) * CONFIG.BLOCK * 0.8;
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 3.5, 5), trunk);
      t.position.set(x, 1.9, z);
      const c = new THREE.Mesh(new THREE.IcosahedronGeometry(2.6 + rnd(), 0), leaf);
      c.position.set(x, 4.8, z);
      c.castShadow = true;
      this.scene.add(t, c);
    }
  }

  _materialsFor(lot, b) {
    const style = lot.seed % 4;
    const tex = this.winTex[style].clone();
    const em = this.emTex[style].clone();
    const sideM = b.side || Math.sqrt(lot.areaSf * 0.7 / CONFIG.SF_PER_M2);
    tex.repeat.set(Math.max(1, Math.round(sideM / 4)), Math.max(1, Math.round(b.floors / 2)));
    em.repeat.copy(tex.repeat);
    tex.needsUpdate = em.needsUpdate = true;

    const tint = OWNER_COLORS[b.builtBy] ?? null;
    const mat = new THREE.MeshStandardMaterial({
      map: tex, emissiveMap: em, emissive: 0xffffff, emissiveIntensity: 0,
      roughness: 0.82, metalness: 0.04,
      color: tint ? new THREE.Color(tint).lerp(new THREE.Color(0xffffff), 0.62) : 0xffffff,
    });
    return mat;
  }

  _buildOne(lot) {
    const b = lot.building;
    if (!b) return null;
    const side = b.side || Math.sqrt((lot.areaSf * 0.7) / CONFIG.SF_PER_M2);
    const h = b.floors * CONFIG.FLOOR_H;
    const geo = new THREE.BoxGeometry(side, h, side);
    const mesh = new THREE.Mesh(geo, this._materialsFor(lot, b));
    mesh.position.set(lot.x, h / 2 + 0.4, lot.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.lotId = lot.id;
    mesh.userData.side = side;
    mesh.userData.height = h;

    // A squat base on taller towers so the street wall reads properly.
    if (b.floors > 12) {
      const podH = CONFIG.FLOOR_H * 3;
      const pod = new THREE.Mesh(
        new THREE.BoxGeometry(lot.w * 0.92, podH, lot.d * 0.92),
        new THREE.MeshStandardMaterial({ color: 0x5c5f63, roughness: 0.9 })
      );
      pod.position.set(lot.x, podH / 2 + 0.4, lot.z);
      pod.castShadow = pod.receiveShadow = true;
      pod.userData.lotId = lot.id;
      mesh.userData.podium = pod;
      this.buildingGroup.add(pod);
    }
    this.buildingGroup.add(mesh);
    return mesh;
  }

  _buildAllBuildings() {
    for (const lot of this.city.lots) {
      const mesh = this._buildOne(lot);
      if (mesh) this.buildingByLot.set(lot.id, mesh);
    }
    this.siteGroup = new THREE.Group();
    this.scene.add(this.siteGroup);
    this.siteByLot = new Map();
  }

  /** Called when the sim finishes or starts something. Cheap enough to do wholesale. */
  syncBuildings() {
    for (const lot of this.city.lots) {
      const has = this.buildingByLot.get(lot.id);
      if (lot.building && !has) {
        const m = this._buildOne(lot);
        if (m) this.buildingByLot.set(lot.id, m);
      } else if (!lot.building && has) {
        this.buildingGroup.remove(has);
        if (has.userData.podium) this.buildingGroup.remove(has.userData.podium);
        has.geometry.dispose();
        this.buildingByLot.delete(lot.id);
      }
      // Construction sites
      const site = this.siteByLot.get(lot.id);
      if (lot.project && !site) {
        const g = new THREE.Group();
        const pad = new THREE.Mesh(
          new THREE.BoxGeometry(lot.w * 0.95, 1.2, lot.d * 0.95),
          new THREE.MeshStandardMaterial({ color: 0x6b5a3e, roughness: 1 })
        );
        pad.position.set(lot.x, 0.6, lot.z);
        const frame = new THREE.Mesh(
          new THREE.BoxGeometry(lot.w * 0.7, 1, lot.d * 0.7),
          new THREE.MeshStandardMaterial({ color: 0xb8b2a4, roughness: 0.7, transparent: true, opacity: 0.75 })
        );
        frame.position.set(lot.x, 1, lot.z);
        const crane = new THREE.Mesh(
          new THREE.BoxGeometry(0.8, 40, 0.8),
          new THREE.MeshStandardMaterial({ color: 0xe0a33a })
        );
        crane.position.set(lot.x + lot.w * 0.35, 20, lot.z + lot.d * 0.35);
        const jib = new THREE.Mesh(new THREE.BoxGeometry(26, 0.6, 0.6), crane.material);
        jib.position.set(lot.x + lot.w * 0.35 + 9, 39, lot.z + lot.d * 0.35);
        g.add(pad, frame, crane, jib);
        g.userData = { frame, crane, jib, lot };
        this.siteGroup.add(g);
        this.siteByLot.set(lot.id, g);
      } else if (!lot.project && site) {
        this.siteGroup.remove(site);
        this.siteByLot.delete(lot.id);
      }
    }
    this.rebuildCollision();
  }

  updateSites() {
    for (const [lotId, g] of this.siteByLot) {
      const lot = this.city.lots[lotId] || this.city.lots.find((l) => l.id === lotId);
      const p = lot && lot.project;
      if (!p) continue;
      const t = Math.max(0, Math.min(1, (this.state.day - p.startDay) / (p.endDay - p.startDay)));
      const h = Math.max(1, t * p.floors * CONFIG.FLOOR_H);
      g.userData.frame.scale.y = h;
      g.userData.frame.position.y = h / 2 + 1;
      const craneH = Math.max(40, h + 18);
      g.userData.crane.scale.y = craneH / 40;
      g.userData.crane.position.y = craneH / 2;
      g.userData.jib.position.y = craneH - 2;
      g.userData.jib.rotation.y += 0.002;
    }
  }

  // --------------------------------------------------------------- vehicles

  _buildTraffic() {
    const COUNT = 90;
    const body = new THREE.BoxGeometry(2, 1.4, 4.4);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.45, metalness: 0.35 });
    this.traffic = new THREE.InstancedMesh(body, mat, COUNT);
    this.traffic.castShadow = true;
    const palette = [0x1b1b1e, 0xb8bcc2, 0x8d2f2a, 0x1f3d63, 0xd8d3c6, 0xe2b93b, 0x2f5d3a, 0x6f6f75, 0xa94f2e, 0xf0eee8];
    this.cars = [];
    const half = CONFIG.EXTENT / 2;
    const rnd = mulberry32(4242);
    const c = new THREE.Color();
    for (let i = 0; i < COUNT; i++) {
      const axis = rnd() < 0.5 ? 'x' : 'z';
      const lane = Math.floor(rnd() * (CONFIG.GRID + 1));
      const laneCoord = -half + lane * CONFIG.PITCH;
      const dir = rnd() < 0.5 ? 1 : -1;
      this.cars.push({
        axis, laneCoord: laneCoord + dir * 4, dir,
        pos: (rnd() - 0.5) * CONFIG.EXTENT,
        speed: 11 + rnd() * 9,
      });
      c.setHex(palette[Math.floor(rnd() * palette.length)]);
      this.traffic.setColorAt(i, c);
    }
    this.traffic.instanceColor.needsUpdate = true;
    this.scene.add(this.traffic);
  }

  updateTraffic(dt) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const half = CONFIG.EXTENT / 2 + 40;
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      car.pos += car.speed * car.dir * dt;
      if (car.pos > half) car.pos = -half;
      if (car.pos < -half) car.pos = half;
      const x = car.axis === 'x' ? car.pos : car.laneCoord;
      const z = car.axis === 'x' ? car.laneCoord : car.pos;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0),
        car.axis === 'x' ? (car.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (car.dir > 0 ? 0 : Math.PI));
      m.compose(new THREE.Vector3(x, 0.9, z), q, new THREE.Vector3(1, 1, 1));
      this.traffic.setMatrixAt(i, m);
    }
    this.traffic.instanceMatrix.needsUpdate = true;
  }

  // ----------------------------------------------------------------- crowds

  _buildCrowd() {
    const COUNT = 220;
    const geo = new THREE.CapsuleGeometry(0.28, 0.9, 3, 6);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.9 });
    this.crowd = new THREE.InstancedMesh(geo, mat, COUNT);
    this.crowd.castShadow = true;
    const coats = [0x24262b, 0x3c4450, 0x6d5f4e, 0x8a3f37, 0x2f4a3c, 0xb9b3a6, 0x4a3f55, 0x1f2a33];
    const rnd = mulberry32(909);
    const c = new THREE.Color();
    this.peds = [];
    for (let i = 0; i < COUNT; i++) {
      this.peds.push({
        x: (rnd() - 0.5) * CONFIG.EXTENT, z: (rnd() - 0.5) * CONFIG.EXTENT,
        dir: rnd() * Math.PI * 2, speed: 1.1 + rnd() * 0.9, t: rnd() * 10,
      });
      c.setHex(coats[Math.floor(rnd() * coats.length)]);
      this.crowd.setColorAt(i, c);
    }
    this.crowd.instanceColor.needsUpdate = true;
    this.scene.add(this.crowd);
  }

  /** Pedestrians live near the camera; far ones are recycled in front of you. */
  updateCrowd(dt, focus) {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const scl = new THREE.Vector3(1, 1, 1);
    const half = CONFIG.BLOCK / 2 + 2;
    for (let i = 0; i < this.peds.length; i++) {
      const p = this.peds[i];
      p.t += dt;
      p.x += Math.cos(p.dir) * p.speed * dt;
      p.z += Math.sin(p.dir) * p.speed * dt;
      if (p.t > 4 + (i % 7)) { p.dir += (Math.random() - 0.5) * 1.4; p.t = 0; }

      const dx = p.x - focus.x, dz = p.z - focus.z;
      if (dx * dx + dz * dz > 160 * 160) {
        const a = Math.random() * Math.PI * 2;
        const r = 40 + Math.random() * 90;
        p.x = focus.x + Math.cos(a) * r;
        p.z = focus.z + Math.sin(a) * r;
      }
      // Keep them roughly on the sidewalk ring of whichever block they're in.
      const bx = Math.round((p.x + CONFIG.EXTENT / 2 - CONFIG.PITCH / 2) / CONFIG.PITCH);
      const bz = Math.round((p.z + CONFIG.EXTENT / 2 - CONFIG.PITCH / 2) / CONFIG.PITCH);
      const cx = -CONFIG.EXTENT / 2 + CONFIG.PITCH / 2 + bx * CONFIG.PITCH;
      const cz = -CONFIG.EXTENT / 2 + CONFIG.PITCH / 2 + bz * CONFIG.PITCH;
      const lx = p.x - cx, lz = p.z - cz;
      if (Math.abs(lx) > half) { p.x = cx + Math.sign(lx) * half; p.dir = Math.PI - p.dir; }
      if (Math.abs(lz) > half) { p.z = cz + Math.sign(lz) * half; p.dir = -p.dir; }

      const bob = Math.sin(p.t * 7 + i) * 0.05;
      q.setFromAxisAngle(up, -p.dir + Math.PI / 2);
      m.compose(new THREE.Vector3(p.x, 1.2 + bob, p.z), q, scl);
      this.crowd.setMatrixAt(i, m);
    }
    this.crowd.instanceMatrix.needsUpdate = true;
  }

  // ----------------------------------------------------------------- vision

  _buildVision() {
    this.vision = new THREE.Group();
    this.vision.visible = false;
    const env = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0x5ec8ff, transparent: true, opacity: 0.14, depthWrite: false })
    );
    const wire = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 0x8fe6ff, transparent: true, opacity: 0.9 })
    );
    const ghost = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xbfe9ff, transparent: true, opacity: 0.3, depthWrite: false })
    );
    const ghostWire = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 })
    );
    this.vision.add(env, wire, ghost, ghostWire);
    this.visionParts = { env, wire, ghost, ghostWire };
    this.scene.add(this.vision);
  }

  showVision(lot, floors, use) {
    if (!lot) { this.vision.visible = false; return; }
    const { env, wire, ghost, ghostWire } = this.visionParts;
    // The legal envelope: full lot footprint, full entitlement height.
    const envFloors = minFloors(lot);
    const envH = Math.max(envFloors, floors) * CONFIG.FLOOR_H * 1.02;
    for (const o of [env, wire]) {
      o.scale.set(lot.w * 0.96, envH, lot.d * 0.96);
      o.position.set(lot.x, envH / 2 + 0.5, lot.z);
    }
    const m = massing(lot, floors);
    for (const o of [ghost, ghostWire]) {
      o.scale.set(m.side, m.height, m.side);
      o.position.set(lot.x, m.height / 2 + 0.5, lot.z);
    }
    this.vision.visible = true;
  }

  hideVision() { this.vision.visible = false; }

  // ----------------------------------------------------------------- avatar

  _buildAvatar() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.34, 1.0, 4, 8),
      new THREE.MeshStandardMaterial({ color: 0x2b3440, roughness: 0.8 })
    );
    body.position.y = 1.05;
    body.castShadow = true;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.24, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xc79b74, roughness: 0.9 })
    );
    head.position.y = 1.82;
    head.castShadow = true;
    g.add(body, head);
    this.avatar = g;
    this.scene.add(g);
  }

  _buildPlayerCar() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(2.1, 1.1, 4.6),
      new THREE.MeshStandardMaterial({ color: 0x14161a, roughness: 0.35, metalness: 0.5 })
    );
    body.position.y = 0.75;
    const cab = new THREE.Mesh(
      new THREE.BoxGeometry(1.85, 0.8, 2.2),
      new THREE.MeshStandardMaterial({ color: 0x0c0e11, roughness: 0.15, metalness: 0.2 })
    );
    cab.position.set(0, 1.5, -0.2);
    body.castShadow = cab.castShadow = true;
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.3, 10);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x15151a, roughness: 1 });
    for (const [wx, wz] of [[-1, 1.5], [1, 1.5], [-1, -1.5], [1, -1.5]]) {
      const w = new THREE.Mesh(wheelGeo, wheelMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.42, wz);
      g.add(w);
    }
    g.add(body, cab);
    this.playerCar = g;
    this.scene.add(g);
  }

  // -------------------------------------------------------------- collision

  rebuildCollision() {
    this.collisionGrid.clear();
    const add = (key, box) => {
      if (!this.collisionGrid.has(key)) this.collisionGrid.set(key, []);
      this.collisionGrid.get(key).push(box);
    };
    for (const lot of this.city.lots) {
      let hw, hd;
      if (lot.building) {
        const side = lot.building.side || Math.sqrt(lot.areaSf * 0.7 / CONFIG.SF_PER_M2);
        hw = hd = (lot.building.floors > 12 ? lot.w * 0.92 : side) / 2;
      } else if (lot.project) {
        hw = hd = lot.w * 0.95 / 2;
      } else continue;
      add(`${lot.bx},${lot.by}`, { x: lot.x, z: lot.z, hw, hd });
    }
  }

  /** Push a point out of any building it has walked into. */
  resolveCollision(x, z, radius = 0.5) {
    const half = CONFIG.EXTENT / 2;
    const bx = Math.round((x + half - CONFIG.PITCH / 2) / CONFIG.PITCH);
    const by = Math.round((z + half - CONFIG.PITCH / 2) / CONFIG.PITCH);
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

  updateSky(hour, focus = { x: 0, z: 0 }) {
    const t = (hour - 6) / 12;                     // 0 at 6am, 1 at 6pm
    const elev = Math.sin(Math.max(0, Math.min(1, t)) * Math.PI);
    const day = Math.max(0, elev);
    const ang = t * Math.PI;
    this.sun.position.set(
      focus.x + Math.cos(ang) * 320,
      Math.max(60, elev * 460) + 80,
      focus.z + Math.sin(ang) * 220 - 90
    );
    this.sun.target.position.set(focus.x, 0, focus.z);
    this.sun.target.updateMatrixWorld();
    this.sun.intensity = 0.25 + day * 2.5;
    this.sun.color.setHSL(0.09 + (1 - day) * 0.02, 0.45 - day * 0.25, 0.55 + day * 0.2);
    this.hemi.intensity = 0.25 + day * 0.9;

    const nightC = new THREE.Color(0x0d1320);
    const dayC = new THREE.Color(0x9fb3cc);
    const duskC = new THREE.Color(0xd9915f);
    let sky = nightC.clone().lerp(dayC, Math.min(1, day * 1.6));
    if (day > 0.02 && day < 0.35) sky.lerp(duskC, 0.5);
    this.scene.background = sky;
    this.scene.fog.color = sky;

    const lit = 1 - Math.min(1, day * 2.2);
    if (this._lit === undefined || Math.abs(lit - this._lit) > 0.02 || this._litCount !== this.buildingByLot.size) {
      this._lit = lit;
      this._litCount = this.buildingByLot.size;
      for (const mesh of this.buildingByLot.values()) mesh.material.emissiveIntensity = lit * 0.85;
    }
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  render() { this.renderer.render(this.scene, this.camera); }
}
