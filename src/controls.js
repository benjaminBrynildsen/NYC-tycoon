// Player movement, driving, and the camera-mode system — the continuous rise
// from the sidewalk to the board and back.

import * as THREE from 'three';
import { CONFIG, lotAt } from './world.js';
import { WATER_Y } from './scene.js';

export const MODE = { STREET: 'street', CAR: 'car', BOARD: 'board', AIRSHIP: 'airship' };

/** True while a text field or dropdown has focus, so game keys must stand down. */
export function isTyping() {
  const a = document.activeElement;
  return !!a && (a.tagName === 'INPUT' || a.tagName === 'SELECT'
                 || a.tagName === 'TEXTAREA' || a.isContentEditable);
}

/** Pointer lock is optional — some embedded views refuse it. Never let that throw. */
export function requestLock(el) {
  try {
    const r = el.requestPointerLock();
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch { /* drag-to-look takes over */ }
}

const TRANSITION = 1.1;   // seconds, each way
const GRAVITY = 22;       // m/s², brisk enough that a long fall still resolves
const TERMINAL = 58;
const JUMP_SPEED = 7.6;   // 1.3m — honestly clears a 1.15m parapet
const AIR_CONTROL = 0.92; // a jump keeps nearly all the speed it left with

// An airship is enormous and unhurried. It turns by flying, not on the spot.
const SHIP = {
  // accel/drag is the speed it actually settles at — about 32 m/s, 70mph,
  // which crosses the island in under a minute without feeling like a jet.
  maxSpeed: 34, reverse: -9, accel: 9, drag: 0.28,
  turn: 0.55,             // radians/s at full chat
  climb: 0.85,            // how much of your speed a nose-up converts to lift
  floor: 16, ceiling: 940,
};

export class Controls {
  constructor(scene, canvas) {
    this.s = scene;
    this.canvas = canvas;
    this.mode = MODE.STREET;
    this.firstPerson = false;

    this.pos = new THREE.Vector3(0, 0, CONFIG.PITCH * 2.2);
    this.groundY = 0;        // your actual altitude: pavement, roof, or mid-air
    this.platform = null;    // {x, z, hw, hd, y} while standing on a roof
    this.riding = null;      // the lift, mid-journey
    this.vy = 0;             // vertical speed while falling
    this.airborne = false;
    this.swimming = false;
    this.fellFrom = 0;       // altitude the current fall started at
    this.yaw = Math.PI;
    this.pitch = -0.08;
    this.vel = new THREE.Vector3();

    this.ship = { pos: new THREE.Vector3(), yaw: 0, speed: 0, roll: 0 };

    this.car = {
      pos: new THREE.Vector3(CONFIG.PITCH * 0.5 - CONFIG.STREET / 2 - 4, 0, CONFIG.PITCH * 2.2),
      yaw: 0, speed: 0, active: false,
    };

    // Board camera: an orbit rig over the city.
    this.board = { target: new THREE.Vector3(0, 0, 0), dist: 780, yaw: 0.6, pitch: -1.12 };

    this.keys = new Set();
    this.transition = null;   // { t, from, to, dir }
    this.locked = false;

    this._bind();
  }

  _bind() {
    addEventListener('keydown', (e) => {
      if (isTyping()) { this.keys.clear(); return; }
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Tab') { e.preventDefault(); this.toggleBoard(); }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    // Focusing a field hands the keyboard and the mouse back to the page.
    document.addEventListener('focusin', () => {
      if (!isTyping()) return;
      this.keys.clear();
      if (document.pointerLockElement) document.exitPointerLock();
    });

    this.canvas.addEventListener('click', (e) => {
      if (e.pointerType === 'touch' || !e.detail) return;   // not a real mouse click
      if (this.mode !== MODE.BOARD && !this.locked) requestLock(this.canvas);
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
    });
    addEventListener('mousemove', (e) => {
      if (this.mode === MODE.BOARD) {
        if (this.dragging) {
          this.board.yaw -= e.movementX * 0.004;
          this.board.pitch = Math.max(-1.5, Math.min(-0.10, this.board.pitch - e.movementY * 0.003));
        } else if (this.panning) {
          this.panMoved += Math.abs(e.movementX) + Math.abs(e.movementY);
          this.panBy(e.movementX, e.movementY);
        }
        return;
      }
      if (!this.locked && !this.lookDrag) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = Math.max(-1.05, Math.min(0.95, this.pitch - e.movementY * 0.0022));
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (this.mode === MODE.BOARD) {
        if (e.button === 2) this.dragging = true;
        // Left-drag pans the city; a left click that never moves is a select.
        if (e.button === 0) { this.panning = true; this.panMoved = 0; }
      } else if (e.button === 0 && !this.locked) this.lookDrag = true;
    });
    addEventListener('mouseup', () => {
      this.dragging = false; this.lookDrag = false; this.panning = false;
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('wheel', (e) => {
      if (this.mode !== MODE.BOARD) return;
      e.preventDefault();
      this.board.dist = Math.max(90, Math.min(2600, this.board.dist * (1 + Math.sign(e.deltaY) * 0.12)));
    }, { passive: false });
  }

  /** WASD and the arrow keys, as one forward/right pair. */
  moveAxis() {
    // A thumb stick, when there is one, stands in for the keys.
    if (this.touchAxis) return this.touchAxis;
    const k = this.keys;
    let fx = 0, fz = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) fz -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) fz += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) fx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) fx += 1;
    return { fx, fz };
  }

  get focusPoint() {
    if (this.mode === MODE.CAR) return this.car.pos;
    if (this.mode === MODE.AIRSHIP) return this.ship.pos;
    return this.pos;
  }

  toggleBoard() {
    if (this.transition) return;
    const goingUp = this.mode !== MODE.BOARD;
    const from = this.s.camera.position.clone();
    const fromQ = this.s.camera.quaternion.clone();
    if (goingUp) {
      this.prevMode = this.mode;
      this.board.target.copy(this.focusPoint);
      this.mode = MODE.BOARD;
      if (document.pointerLockElement) document.exitPointerLock();
    } else {
      this.mode = this.prevMode || MODE.STREET;
    }
    this.transition = { t: 0, from, fromQ, goingUp };
    return goingUp;
  }

  /** Move the avatar instantly but at a cost in game time (caller applies it). */
  travelTo(x, z) {
    const d = Math.hypot(x - this.pos.x, z - this.pos.z);
    this.pos.set(x, 0, z + CONFIG.LOT * 0.9);
    // Arrive on your feet, whatever you were doing when you left.
    this.groundY = 0; this.vy = 0;
    this.airborne = this.swimming = false;
    this.platform = null;
    this.car.pos.copy(this.pos);
    return d;
  }

  /**
   * Take the lift. Up puts you on a roof and keeps you inside its parapet;
   * down returns you to the pavement beside the building.
   */
  startRide(platform) {
    if (this.riding || this.mode !== MODE.STREET) return false;
    if (this.airborne || this.swimming) return false;
    const up = !!platform;
    this.riding = {
      t: 0, dur: 2.2, up,
      fromY: this.groundY,
      toY: up ? platform.y : 0,
      platform,
      fromFloor: up ? 0 : (this.platform?.floors ?? 0),
      toFloor: up ? platform.floors : 0,
      exit: up ? null : { x: this.platform.x, z: this.platform.z + this.platform.hd + 14 },
    };
    return true;
  }

  /** Floor the lift is passing, for the indicator. */
  get rideFloor() {
    if (!this.riding) return null;
    const k = Math.min(1, this.riding.t / this.riding.dur);
    return Math.round(this.riding.fromFloor + (this.riding.toFloor - this.riding.fromFloor) * k);
  }

  _updateRide(dt) {
    const r = this.riding;
    r.t += dt;
    const k = Math.min(1, r.t / r.dur);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;   // ease in-out
    this.groundY = r.fromY + (r.toY - r.fromY) * e;
    if (k < 1) return;
    if (r.up) {
      this.platform = r.platform;
      // Step out at the edge looking over the parapet, not at the middle of a
      // blank roof wondering what the point was.
      this.pos.set(r.platform.x, 0, r.platform.z - r.platform.hd * 0.72);
      this.yaw = 0;
      this.pitch = -0.16;
    } else {
      this.platform = null;
      let [x, z] = this.s.resolveCollision(r.exit.x, r.exit.z, 0.7);
      this.pos.set(x, 0, z);
    }
    this.groundY = r.toY;
    this.riding = null;
  }

  update(dt, sceneRef) {
    if (this.riding) this._updateRide(dt);
    else if (this.mode === MODE.CAR) this._updateCar(dt);
    else if (this.mode === MODE.AIRSHIP) this._updateAirship(dt);
    else if (this.mode === MODE.STREET) this._updateWalk(dt);
    this._updateCamera(dt, sceneRef);
  }

  // ------------------------------------------------------------- the airship

  /** Take the ship moored at a mast. Returns false if you cannot reach it. */
  boardAirship(mast) {
    if (!mast || this.mode !== MODE.STREET || this.riding) return false;
    if (this.airborne || this.swimming) return false;
    const s = this.ship;
    s.pos.set(mast.x, mast.y + 6, mast.z + 49);
    s.yaw = Math.PI;
    s.speed = 0;
    s.roll = 0;
    this.yaw = Math.PI;
    this.pitch = -0.05;
    this.mode = MODE.AIRSHIP;
    if (document.pointerLockElement) return true;
    return true;
  }

  /**
   * Step out of the gondola. You do not land the ship — you leave it and
   * fall, which the same gravity that handles a parapet takes care of. Over
   * water you go in; over a roof you land on it; low and slow it is a step.
   */
  leaveAirship() {
    if (this.mode !== MODE.AIRSHIP) return null;
    const s = this.ship;
    const out = { pos: s.pos.clone(), yaw: s.yaw };
    this.mode = MODE.STREET;
    this.pos.set(s.pos.x, 0, s.pos.z);
    this.groundY = Math.max(0, s.pos.y - 4);
    this.platform = null;
    this.airborne = true;
    this.swimming = false;
    this.vy = 0;
    this.airSpeed = 4.2;
    this.fellFrom = this.groundY;
    return out;
  }

  _updateAirship(dt) {
    const s = this.ship;
    const { fx, fz } = this.moveAxis();

    // Forward on the stick is throttle; back is reverse, which on an airship
    // means the engines in reverse and a very slow walk backwards.
    s.speed += (-fz) * SHIP.accel * dt;
    s.speed -= s.speed * SHIP.drag * dt;
    s.speed = Math.max(SHIP.reverse, Math.min(SHIP.maxSpeed, s.speed));

    // You fly where you look. The hull swings round to the heading you are
    // looking at, faster the harder you are driving it, and the stick trims
    // that heading directly so you can hold a line without turning your head.
    const authority = 0.25 + 0.75 * Math.min(1, Math.abs(s.speed) / SHIP.maxSpeed);
    let wanted = this.yaw - fx * 0.6;
    let d = wanted - s.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    const turn = Math.max(-SHIP.turn * authority, Math.min(SHIP.turn * authority, d * 1.6)) * dt;
    s.yaw += turn;
    s.roll += (-turn * 9 - s.roll) * Math.min(1, dt * 2.4);      // bank into it

    // Nose up climbs, nose down dives, both in proportion to how fast you are
    // going — a stationary airship does not levitate.
    const climb = Math.sin(this.pitch) * Math.abs(s.speed) * SHIP.climb;
    s.pos.x -= Math.sin(s.yaw) * s.speed * dt;
    s.pos.z -= Math.cos(s.yaw) * s.speed * dt;
    s.pos.y += climb * dt;

    const lx = CONFIG.WIDTH / 2 + 400, lz = CONFIG.DEPTH / 2 + 400;
    s.pos.x = Math.max(-lx, Math.min(lx, s.pos.x));
    s.pos.z = Math.max(-lz, Math.min(lz, s.pos.z));

    // It will not fly through the city: the skyline pushes it up.
    const below = this.s.surfaceAt(s.pos.x, s.pos.z).y;
    s.pos.y = Math.max(below + SHIP.floor, Math.min(SHIP.ceiling, s.pos.y));

    this.pos.set(s.pos.x, 0, s.pos.z);
    this.moving = Math.abs(s.speed) > 0.2;
  }

  _shipCameraPose() {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    const eye = new THREE.Vector3(this.ship.pos.x, this.ship.pos.y + 3.5, this.ship.pos.z);
    if (this.firstPerson) {
      // The gondola hangs under the hull, forward of centre.
      const nose = new THREE.Vector3(-Math.sin(this.ship.yaw), 0, -Math.cos(this.ship.yaw));
      return { pos: eye.clone().addScaledVector(nose, 26).add(new THREE.Vector3(0, -11, 0)), q };
    }
    // The hull is ninety metres long, so a car's chase distance puts the
    // camera inside it. Sit back past the tail and a little above.
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const pos = eye.clone().addScaledVector(back, 96).add(new THREE.Vector3(0, 16, 0));
    const floor = this.s.surfaceAt(pos.x, pos.z).y + 3;
    pos.y = Math.max(pos.y, floor);
    return { pos, q };
  }

  /** Ask for a jump; the next walk step decides whether you get one. */
  jump() {
    if (this.mode !== MODE.STREET || this.riding) return false;
    if (this.swimming) { this.vy = Math.max(this.vy, 2.4); return true; }   // a splash-about
    if (this.airborne) return false;
    this.vy = JUMP_SPEED;
    this.airborne = true;
    this.fellFrom = this.groundY;
    // You keep the speed you left with. Walking off a parapet drops you just
    // past it; a run at the edge throws you well clear of the building.
    this.airSpeed = this._walkSpeed();
    return true;
  }

  _walkSpeed() {
    return (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) ? 9.5 : 4.2;
  }

  _updateWalk(dt) {
    const speed = this.swimming ? 2.1
      : this.airborne ? (this.airSpeed ?? 4.2) * AIR_CONTROL
      : this._walkSpeed();
    let { fx, fz } = this.moveAxis();
    const len = Math.hypot(fx, fz) || 1;
    fx /= len; fz /= len;

    // forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw)
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const dx = (fx * cos + fz * sin) * speed * dt;
    const dz = (fz * cos - fx * sin) * speed * dt;

    let nx = this.pos.x + dx, nz = this.pos.z + dz;
    if (this.platform && !this.airborne) {
      // Standing on a roof, the parapet is the only thing that stops you —
      // which is why you have to jump to get over it.
      const p = this.platform;
      nx = Math.max(p.x - p.hw, Math.min(p.x + p.hw, nx));
      nz = Math.max(p.z - p.hd, Math.min(p.z + p.hd, nz));
    } else if (this.airborne) {
      // In the air nothing blocks you except the side of a building: you may
      // not drift into something whose roof is above your head.
      const ahead = this.s.surfaceAt(nx, nz);
      if (ahead.y > this.groundY + 0.4) { nx = this.pos.x; nz = this.pos.z; }
    } else {
      [nx, nz] = this.s.resolveCollision(nx, nz, 0.6);
    }
    const lx = CONFIG.WIDTH / 2 + 70, lz = CONFIG.DEPTH / 2 + 70;
    this.pos.x = Math.max(-lx, Math.min(lx, nx));
    this.pos.z = Math.max(-lz, Math.min(lz, nz));

    this._updateVertical(dt);
    this.moving = Math.hypot(dx, dz) > 0.001;
  }

  /**
   * Gravity, landing, and the river. `groundY` is the player's real altitude,
   * so walking off a kerb into the water and stepping off a 60th-floor parapet
   * are the same piece of code.
   */
  _updateVertical(dt) {
    const surface = this.s.surfaceAt(this.pos.x, this.pos.z);
    this.landedOn = null;

    if (this.swimming) {
      if (!surface.water) {                 // you reached the shore and climbed out
        this.swimming = false;
        this.groundY = surface.y;
        this.platform = surface.roof ?? null;
        this.landedOn = 'shore';
        return;
      }
      // Bob, with a little of whatever push the last jump had left in it.
      this.vy += (WATER_Y - 0.85 - this.groundY) * 9 * dt - this.vy * 3.4 * dt;
      this.groundY += this.vy * dt;
      return;
    }

    if (!this.airborne) {
      // The ground can vanish from under you: walk off a roof, or off the
      // embankment into the river.
      if (this.groundY - surface.y > 0.45) {
        this.airborne = true;
        this.platform = null;
        this.fellFrom = this.groundY;
        this.airSpeed = this._walkSpeed();
        this.vy = 0;
      } else {
        this.groundY = surface.y;
        return;
      }
    }

    this.vy = Math.max(-TERMINAL, this.vy - GRAVITY * dt);
    this.groundY += this.vy * dt;
    if (this.groundY > surface.y) return;

    // Landed.
    this.groundY = surface.y;
    this.airborne = false;
    this.fallHeight = Math.max(0, this.fellFrom - surface.y);
    this.vy = 0;
    if (surface.water) {
      this.swimming = true;
      this.platform = null;
      this.groundY = WATER_Y - 0.85;
      this.landedOn = 'water';
    } else {
      this.platform = surface.roof ?? null;
      this.landedOn = this.fallHeight > 6 ? 'hard' : 'ground';
    }
  }

  _updateCar(dt) {
    const c = this.car;
    const k = this.keys;
    const boost = k.has('ShiftLeft') || k.has('ShiftRight');
    const fwd = k.has('KeyW') || k.has('ArrowUp');
    const rev = k.has('KeyS') || k.has('ArrowDown');
    const accel = fwd ? (boost ? 62 : 42) : rev ? -30 : 0;
    c.speed += accel * dt;
    c.speed *= 1 - 0.55 * dt;                       // drag
    c.speed = Math.max(-18, Math.min(boost ? 82 : 58, c.speed));
    // Steering tightens up at low speed and calms down at high speed.
    const steerAuth = Math.min(1, Math.abs(c.speed) / 7) * (1 - Math.min(0.55, Math.abs(c.speed) / 150));
    const sign = Math.sign(c.speed || 1);
    if (k.has('KeyA') || k.has('ArrowLeft')) c.yaw += 2.2 * dt * steerAuth * sign;
    if (k.has('KeyD') || k.has('ArrowRight')) c.yaw -= 2.2 * dt * steerAuth * sign;

    const nx = c.pos.x - Math.sin(c.yaw) * c.speed * dt;
    const nz = c.pos.z - Math.cos(c.yaw) * c.speed * dt;
    const [rx, rz] = this.s.resolveCollision(nx, nz, 1.6);
    if (Math.abs(rx - nx) > 0.01 || Math.abs(rz - nz) > 0.01) c.speed *= -0.25;   // you hit something
    const lx = CONFIG.WIDTH / 2 + 70, lz = CONFIG.DEPTH / 2 + 70;
    c.pos.x = Math.max(-lx, Math.min(lx, rx));
    c.pos.z = Math.max(-lz, Math.min(lz, rz));
    this.yaw = c.yaw + Math.PI;
    this.pos.copy(c.pos);
  }

  enterCar() {
    if (this.mode !== MODE.STREET || this.platform || this.riding) return false;
    if (this.airborne || this.swimming) return false;
    if (this.pos.distanceTo(this.s.playerCar.position) > 6) return false;
    this.car.pos.copy(this.s.playerCar.position);
    this.mode = MODE.CAR;
    return true;
  }

  exitCar() {
    if (this.mode !== MODE.CAR) return false;
    this.mode = MODE.STREET;
    this.car.speed = 0;
    let [x, z] = this.s.resolveCollision(this.car.pos.x + 2.6, this.car.pos.z, 0.6);
    this.pos.set(x, 0, z);
    return true;
  }

  _boardCameraPose() {
    const b = this.board;
    const cp = Math.cos(b.pitch), sp = Math.sin(b.pitch);
    const pos = new THREE.Vector3(
      b.target.x + Math.sin(b.yaw) * cp * b.dist,
      b.target.y - sp * b.dist,
      b.target.z + Math.cos(b.yaw) * cp * b.dist
    );
    const q = new THREE.Quaternion();
    const m = new THREE.Matrix4().lookAt(pos, b.target, new THREE.Vector3(0, 1, 0));
    q.setFromRotationMatrix(m);
    return { pos, q };
  }

  _streetCameraPose() {
    const eye = (this.mode === MODE.CAR ? 2.0 : this.swimming ? 1.05 : 1.72) + this.groundY;
    const head = new THREE.Vector3(this.pos.x, eye, this.pos.z);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    if (this.firstPerson) return { pos: head, q };
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const dist = this.mode === MODE.CAR ? 9.5 : 5.4;
    const pos = head.clone().addScaledVector(back, dist).add(new THREE.Vector3(0, 1.3, 0));
    // Looking up must not bury the camera in the pavement.
    if (pos.y < this.groundY + 0.9) {
      const t = (this.groundY + 0.9 - head.y - 1.3) / (back.y * dist || -1);
      pos.copy(head).addScaledVector(back, Math.max(1.2, dist * Math.max(0, Math.min(1, t))))
         .add(new THREE.Vector3(0, 1.3, 0));
      pos.y = Math.max(pos.y, this.groundY + 0.9);
    }
    if (!this.platform && !this.riding) {
      const [cx, cz] = this.s.resolveCollision(pos.x, pos.z, 0.4);
      pos.x = cx; pos.z = cz;
    }
    return { pos, q };
  }

  /**
   * Drag the city around. The ground under the cursor stays under the cursor,
   * so the map follows the hand rather than the camera.
   */
  panBy(dx, dy) {
    const b = this.board;
    const k = b.dist * 0.0021;
    const sin = Math.sin(b.yaw), cos = Math.cos(b.yaw);
    const right = { x: cos, z: -sin };
    const fwd = { x: -sin, z: -cos };
    b.target.x += (-right.x * dx + fwd.x * dy) * k;
    b.target.z += (-right.z * dx + fwd.z * dy) * k;
    const lx = CONFIG.WIDTH * 0.75, lz = CONFIG.DEPTH * 0.65;
    b.target.x = Math.max(-lx, Math.min(lx, b.target.x));
    b.target.z = Math.max(-lz, Math.min(lz, b.target.z));
  }

  _boardPan(dt) {
    const sp = 260 * dt * (this.board.dist / 600);
    const sin = Math.sin(this.board.yaw), cos = Math.cos(this.board.yaw);
    const { fx, fz } = this.moveAxis();
    if (!fx && !fz) return;
    this.board.target.x += (fx * cos + fz * sin) * sp;
    this.board.target.z += (fz * cos - fx * sin) * sp;
    const lx = CONFIG.WIDTH * 0.75, lz = CONFIG.DEPTH * 0.65;
    this.board.target.x = Math.max(-lx, Math.min(lx, this.board.target.x));
    this.board.target.z = Math.max(-lz, Math.min(lz, this.board.target.z));
  }

  _updateCamera(dt, s) {
    const cam = s.camera;
    if (this.mode === MODE.BOARD && !this.transition) this._boardPan(dt);

    const target = this.mode === MODE.BOARD ? this._boardCameraPose()
      : this.mode === MODE.AIRSHIP ? this._shipCameraPose()
      : this._streetCameraPose();

    if (this.transition) {
      const tr = this.transition;
      tr.t += dt / TRANSITION;
      const k = Math.min(1, tr.t);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;   // easeInOutCubic
      cam.position.lerpVectors(tr.from, target.pos, e);
      cam.quaternion.copy(tr.fromQ).slerp(target.q, e);
      cam.fov = 62 + Math.sin(e * Math.PI) * 8;
      cam.updateProjectionMatrix();
      if (k >= 1) this.transition = null;
    } else {
      cam.position.copy(target.pos);
      cam.quaternion.copy(target.q);
      if (cam.fov !== 62) { cam.fov = 62; cam.updateProjectionMatrix(); }
    }

    // Keep the avatar and the car where they belong in the world.
    s.avatar.position.set(this.pos.x, this.groundY, this.pos.z);
    s.avatar.rotation.y = this.yaw + Math.PI;
    s.avatar.visible = !(this.firstPerson && this.mode === MODE.STREET && !this.transition)
      && this.mode !== MODE.CAR && this.mode !== MODE.AIRSHIP;
    if (s.playerShip) {
      s.playerShip.visible = this.mode === MODE.AIRSHIP
        || (this.mode === MODE.BOARD && this.prevMode === MODE.AIRSHIP);
      s.playerShip.position.copy(this.ship.pos);
      // The hull models its nose on +Z, and the ship flies toward -Z at yaw
      // zero — so the model is half a turn round from the heading.
      s.playerShip.rotation.set(0, this.ship.yaw + Math.PI, this.ship.roll);
    }
    if (this.mode === MODE.CAR) {
      s.playerCar.position.copy(this.car.pos);
      s.playerCar.rotation.y = this.car.yaw;
    }

  }

  /** Which lot is the player standing on (or nearest to)? */
  currentLot(city) {
    return lotAt(city, this.focusPoint.x, this.focusPoint.z);
  }
}
