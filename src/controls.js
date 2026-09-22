// Player movement, driving, and the camera-mode system — the continuous rise
// from the sidewalk to the board and back.

import * as THREE from 'three';
import { CONFIG, lotAt } from './world.js';

export const MODE = { STREET: 'street', CAR: 'car', BOARD: 'board' };

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
    this.yaw = Math.PI;
    this.pitch = -0.08;
    this.vel = new THREE.Vector3();

    this.car = {
      pos: new THREE.Vector3(CONFIG.PITCH * 0.5 - CONFIG.STREET / 2 - 4, 0, CONFIG.PITCH * 2.2),
      yaw: 0, speed: 0, active: false,
    };

    // Board camera: an orbit rig over the city.
    this.board = { target: new THREE.Vector3(0, 0, 0), dist: 620, yaw: 0.6, pitch: -0.95 };

    this.keys = new Set();
    this.transition = null;   // { t, from, to, dir }
    this.locked = false;

    this._bind();
  }

  _bind() {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Tab') { e.preventDefault(); this.toggleBoard(); }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    this.canvas.addEventListener('click', () => {
      if (this.mode !== MODE.BOARD && !this.locked) requestLock(this.canvas);
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
    });
    addEventListener('mousemove', (e) => {
      if (this.mode === MODE.BOARD) {
        if (this.dragging) {
          this.board.yaw -= e.movementX * 0.004;
          this.board.pitch = Math.max(-1.45, Math.min(-0.18, this.board.pitch - e.movementY * 0.003));
        }
        return;
      }
      if (!this.locked && !this.lookDrag) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch = Math.max(-1.2, Math.min(1.1, this.pitch - e.movementY * 0.0022));
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (this.mode === MODE.BOARD && e.button === 2) this.dragging = true;
      if (this.mode !== MODE.BOARD && e.button === 0 && !this.locked) this.lookDrag = true;
    });
    addEventListener('mouseup', () => { this.dragging = false; this.lookDrag = false; });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    this.canvas.addEventListener('wheel', (e) => {
      if (this.mode !== MODE.BOARD) return;
      e.preventDefault();
      this.board.dist = Math.max(90, Math.min(1400, this.board.dist * (1 + Math.sign(e.deltaY) * 0.12)));
    }, { passive: false });
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

  update(dt, sceneRef) {
    if (this.mode === MODE.CAR) this._updateCar(dt);
    else if (this.mode === MODE.STREET) this._updateWalk(dt);
    this._updateCamera(dt, sceneRef);
  }

  _updateWalk(dt) {
    const run = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const speed = run ? 9.5 : 4.2;
    let fx = 0, fz = 0;
    if (this.keys.has('KeyW')) fz -= 1;
    if (this.keys.has('KeyS')) fz += 1;
    if (this.keys.has('KeyA')) fx -= 1;
    if (this.keys.has('KeyD')) fx += 1;
    const len = Math.hypot(fx, fz) || 1;
    fx /= len; fz /= len;

    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    const dx = (fx * cos - fz * sin) * speed * dt;
    const dz = (fx * sin + fz * cos) * speed * dt;

    let nx = this.pos.x + dx, nz = this.pos.z + dz;
    [nx, nz] = this.s.resolveCollision(nx, nz, 0.6);
    const lim = CONFIG.EXTENT / 2 + 60;
    this.pos.x = Math.max(-lim, Math.min(lim, nx));
    this.pos.z = Math.max(-lim, Math.min(lim, nz));
    this.moving = Math.hypot(dx, dz) > 0.001;
  }

  _updateCar(dt) {
    const c = this.car;
    const accel = this.keys.has('KeyW') ? 26 : this.keys.has('KeyS') ? -22 : 0;
    c.speed += accel * dt;
    c.speed *= 1 - 0.9 * dt;                        // drag
    c.speed = Math.max(-14, Math.min(42, c.speed));
    const steerAuth = Math.min(1, Math.abs(c.speed) / 9);
    if (this.keys.has('KeyA')) c.yaw += 1.9 * dt * steerAuth * Math.sign(c.speed || 1);
    if (this.keys.has('KeyD')) c.yaw -= 1.9 * dt * steerAuth * Math.sign(c.speed || 1);

    const nx = c.pos.x - Math.sin(c.yaw) * c.speed * dt;
    const nz = c.pos.z - Math.cos(c.yaw) * c.speed * dt;
    const [rx, rz] = this.s.resolveCollision(nx, nz, 1.6);
    if (Math.abs(rx - nx) > 0.01 || Math.abs(rz - nz) > 0.01) c.speed *= -0.25;   // you hit something
    const lim = CONFIG.EXTENT / 2 + 60;
    c.pos.x = Math.max(-lim, Math.min(lim, rx));
    c.pos.z = Math.max(-lim, Math.min(lim, rz));
    this.yaw = c.yaw + Math.PI;
    this.pos.copy(c.pos);
  }

  enterCar() {
    if (this.mode !== MODE.STREET) return false;
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
    const eye = this.mode === MODE.CAR ? 2.0 : 1.72;
    const head = new THREE.Vector3(this.pos.x, eye, this.pos.z);
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    if (this.firstPerson) return { pos: head, q };
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const dist = this.mode === MODE.CAR ? 9.5 : 5.4;
    const pos = head.clone().addScaledVector(back, dist).add(new THREE.Vector3(0, 1.3, 0));
    const [cx, cz] = this.s.resolveCollision(pos.x, pos.z, 0.4);
    pos.x = cx; pos.z = cz;
    return { pos, q };
  }

  _boardPan(dt) {
    const sp = 260 * dt * (this.board.dist / 600);
    const sin = Math.sin(this.board.yaw), cos = Math.cos(this.board.yaw);
    let fx = 0, fz = 0;
    if (this.keys.has('KeyW')) fz -= 1;
    if (this.keys.has('KeyS')) fz += 1;
    if (this.keys.has('KeyA')) fx -= 1;
    if (this.keys.has('KeyD')) fx += 1;
    if (!fx && !fz) return;
    this.board.target.x += (fx * cos - fz * sin) * sp;
    this.board.target.z += (fx * sin + fz * cos) * sp;
    const lim = CONFIG.EXTENT * 0.8;
    this.board.target.x = Math.max(-lim, Math.min(lim, this.board.target.x));
    this.board.target.z = Math.max(-lim, Math.min(lim, this.board.target.z));
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
    s.avatar.position.set(this.pos.x, 0, this.pos.z);
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
