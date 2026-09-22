// Player movement, driving, and the camera-mode system — the continuous rise
// from the sidewalk to the board and back.

import * as THREE from 'three';
import { CONFIG, lotAt } from './world.js';

export const MODE = { STREET: 'street', CAR: 'car', BOARD: 'board' };

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

export class Controls {
  constructor(scene, canvas) {
    this.s = scene;
    this.canvas = canvas;
    this.mode = MODE.STREET;
    this.firstPerson = false;

    this.pos = new THREE.Vector3(0, 0, CONFIG.PITCH * 2.2);
    this.groundY = 0;        // raised when you are standing on a roof
    this.platform = null;    // {x, z, hw, hd, y} while up there
    this.riding = null;      // the lift, mid-journey
    this.yaw = Math.PI;
    this.pitch = -0.08;
    this.vel = new THREE.Vector3();

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
    return this.mode === MODE.CAR ? this.car.pos : this.pos;
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
    this.car.pos.copy(this.pos);
    return d;
  }

  /**
   * Take the lift. Up puts you on a roof and keeps you inside its parapet;
   * down returns you to the pavement beside the building.
   */
  startRide(platform) {
    if (this.riding || this.mode !== MODE.STREET) return false;
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
    else if (this.mode === MODE.STREET) this._updateWalk(dt);
    this._updateCamera(dt, sceneRef);
  }

  _updateWalk(dt) {
    const run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const speed = run ? 9.5 : 4.2;
    let { fx, fz } = this.moveAxis();
    const len = Math.hypot(fx, fz) || 1;
    fx /= len; fz /= len;

    // forward = (-sin yaw, -cos yaw), right = (cos yaw, -sin yaw)
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const dx = (fx * cos + fz * sin) * speed * dt;
    const dz = (fz * cos - fx * sin) * speed * dt;

    let nx = this.pos.x + dx, nz = this.pos.z + dz;
    if (this.platform) {
      // Up here the parapet is the only thing that stops you.
      const p = this.platform;
      this.pos.x = Math.max(p.x - p.hw, Math.min(p.x + p.hw, nx));
      this.pos.z = Math.max(p.z - p.hd, Math.min(p.z + p.hd, nz));
    } else {
      [nx, nz] = this.s.resolveCollision(nx, nz, 0.6);
      const lx = CONFIG.WIDTH / 2 + 70, lz = CONFIG.DEPTH / 2 + 70;
      this.pos.x = Math.max(-lx, Math.min(lx, nx));
      this.pos.z = Math.max(-lz, Math.min(lz, nz));
    }
    this.moving = Math.hypot(dx, dz) > 0.001;
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
    const eye = (this.mode === MODE.CAR ? 2.0 : 1.72) + this.groundY;
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

    const target = this.mode === MODE.BOARD ? this._boardCameraPose() : this._streetCameraPose();

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
    s.avatar.visible = !(this.firstPerson && this.mode === MODE.STREET && !this.transition) && this.mode !== MODE.CAR;
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
