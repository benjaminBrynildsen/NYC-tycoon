// Bootstrap and the game loop. Wires the sim, the renderer, the controls and the HUD.

import * as THREE from 'three';
import { generateCity, CONFIG, minFloors } from './world.js';
import { createState, advance, netWorth, leaderboard, money, logEvent } from './economy.js';
import { CityScene } from './scene.js';
import { Controls, MODE, requestLock, isTyping } from './controls.js';
import { UI } from './ui.js';

// Game minutes that pass per real second, by speed setting.
const SPEEDS = [0, 5, 60, 720, 4320];

/**
 * Seed handling. A reset reloads the page rather than tearing the scene down,
 * which is the one way to guarantee nothing is left over from the last game,
 * so the seed has to survive the reload. The hash makes a city shareable; the
 * session copy is the fallback where an embedded view rewrites the URL.
 */
const DEFAULT_SEED = 7;
function readSeed() {
  const m = /^#s(\d+)$/.exec(location.hash || '');
  if (m) return +m[1];
  try {
    const v = sessionStorage.getItem('airrights.seed');
    if (v) return +v;
  } catch { /* private window or blocked storage */ }
  return DEFAULT_SEED;
}
function writeSeed(seed) {
  try { sessionStorage.setItem('airrights.seed', String(seed)); } catch { /* fine */ }
  try { location.hash = `s${seed}`; } catch { /* fine */ }
}

const SEED = readSeed();
const canvas = document.getElementById('view');
const city = generateCity(SEED);
const state = createState(city, SEED);
const scene = new CityScene(state, canvas);
const controls = new Controls(scene, canvas);
const ui = new UI(state, controls);

// Give the player a foothold so month one isn't a blank sheet.
(function seedPlayer() {
  const candidates = city.lots.filter((l) => l.district === 'edge' && l.building && l.building.floors <= 8);
  const start = candidates[Math.floor(candidates.length / 2)] || city.lots[0];
  start.owner = 'player';
  start.building.builtBy = 'player';
  state.actors.player.gsfBuilt += start.building.gsf;
  controls.pos.set(start.x, 0, start.z + CONFIG.LOT * 1.4);
  controls.board.target.set(start.x, 0, start.z);
  scene.playerCar.position.set(start.x + 18, 0, start.z + CONFIG.LOT * 1.4);
  controls.car.pos.copy(scene.playerCar.position);
  logEvent(state, 'player', `took over ${start.building.floors} floors at #${start.id}`);
  state._start = start;
})();

for (const lot of city.lots) lot._intensity = 0.35;
scene.syncBuildings();

// --------------------------------------------------------------- UI wiring

let speed = 1;
ui.setSpeed(1);
ui.onSpeed = (n) => { speed = n; };
ui.onDirty = () => {
  scene.syncBuildings();
  if (ui.highlightOwner) scene.setOwnerHighlight(ui.highlightOwner);   // ownership moved
  ui.refreshBoard();
};
ui.onHighlight = (id) => scene.setOwnerHighlight(id);
ui.onTravel = (lot) => {
  const dist = controls.travelTo(lot.x, lot.z);
  advance(state, dist / 900);                 // walking across town costs you time
  if (controls.mode === MODE.BOARD) controls.toggleBoard();
  ui.toast(`Travelled to lot #${lot.id}.`);
};
ui.onMassingPreview = (lot, floors) => {
  if (controls.mode !== MODE.BOARD) scene.showVision(lot, floors);
};

// ---------------------------------------------------------------- picking

const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

canvas.addEventListener('pointerup', (e) => {
  if (controls.mode !== MODE.BOARD || e.button !== 0) return;
  if (controls.panMoved > 5) return;          // that was a drag, not a click
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, scene.camera);

  // Prefer an actual building hit, fall back to the ground plane.
  const hits = ray.intersectObjects(scene.buildingGroup.children, false);
  let lot = null;
  if (hits.length && hits[0].object.userData.lotId !== undefined) {
    lot = city.lots.find((l) => l.id === hits[0].object.userData.lotId);
  } else {
    const p = new THREE.Vector3();
    if (ray.ray.intersectPlane(groundPlane, p)) {
      lot = nearestLot(p.x, p.z, 26);
    }
  }
  if (lot) ui.select(lot);
});

/** The building or site worth putting a label on, near where you're standing. */
function nearbyNotable() {
  const f = controls.focusPoint;
  let best = null, bd = 85 * 85;
  for (const l of city.lots) {
    if (!l.project && !l.building) continue;
    if (!l.project && l.owner !== 'player') continue;
    const dx = l.x - f.x, dz = l.z - f.z;
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = l; }
  }
  return best;
}

function nearestLot(x, z, maxD) {
  let best = null, bd = maxD * maxD;
  for (const l of city.lots) {
    const dx = l.x - x, dz = l.z - z;
    const d = dx * dx + dz * dz;
    if (d < bd) { bd = d; best = l; }
  }
  return best;
}

// ------------------------------------------------------------- keybindings

let visionLot = null;

addEventListener('keydown', (e) => {
  if (e.repeat || isTyping()) return;
  switch (e.code) {
    case 'KeyV': toggleVision(); break;
    case 'KeyF':
      if (controls.mode === MODE.STREET) controls.firstPerson = !controls.firstPerson;
      break;
    case 'KeyE':
      if (controls.mode === MODE.CAR) {
        controls.exitCar();
        ui.toast('Out of the car.');
      } else if (controls.enterCar()) {
        ui.toast('Driving. W/S throttle, A/D steer, E to get out.');
      }
      break;
    case 'Space': e.preventDefault(); ui.setSpeed(speed === 0 ? 1 : 0); break;
    case 'Digit1': ui.setSpeed(1); break;
    case 'Digit2': ui.setSpeed(2); break;
    case 'Digit3': ui.setSpeed(3); break;
    case 'Digit4': ui.setSpeed(4); break;
    case 'Escape':
      if (document.pointerLockElement) document.exitPointerLock();
      ui.closeLot(); scene.hideVision(); visionLot = null;
      break;
  }
});

function toggleVision() {
  if (controls.mode === MODE.BOARD) return;
  if (visionLot) { scene.hideVision(); visionLot = null; ui.closeLot(); return; }
  const lot = controls.currentLot(city);
  if (!lot) return ui.toast('Stand on a lot to raise the Vision.', true);
  visionLot = lot;
  scene.showVision(lot, minFloors(lot));
  ui.select(lot);
}

// Rising to the board closes the Vision; dropping back keeps your place.
const origToggle = controls.toggleBoard.bind(controls);
controls.toggleBoard = () => {
  const up = origToggle();
  document.getElementById('board-panel').classList.toggle('hidden', !up);
  document.getElementById('crosshair').style.display = up ? 'none' : '';
  document.getElementById('modehint').textContent = up
    ? 'TAB — drop back to the street  ·  click a lot to inspect'
    : 'TAB — rise to the board';
  scene.setBoardMode(up);
  if (up) { scene.hideVision(); visionLot = null; ui.refreshBoard(); scene.refreshCorridorLabels(); }
  return up;
};

// ------------------------------------------------------------- start & loop

// Injected by the build so a stale page is obvious at a glance.
const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';
document.getElementById('buildstamp').textContent = `city ${SEED} · build ${BUILD}`;
console.log(`Air Rights — build ${BUILD}`);

// --- reset
const resetBtn = document.getElementById('reset');
const resetMenu = document.getElementById('resetmenu');
const closeReset = () => resetMenu.classList.add('hidden');
resetBtn.onclick = (e) => {
  e.stopPropagation();
  if (document.pointerLockElement) document.exitPointerLock();
  resetMenu.classList.toggle('hidden');
};
document.getElementById('reset-cancel').onclick = closeReset;
addEventListener('pointerdown', (e) => {
  if (!resetMenu.contains(e.target) && e.target !== resetBtn) closeReset();
});
function restart(sameCity) {
  writeSeed(sameCity ? SEED : Math.floor(Math.random() * 999_999) + 1);
  location.reload();
}
document.getElementById('reset-new').onclick = () => restart(false);
document.getElementById('reset-same').onclick = () => restart(true);

document.getElementById('begin').onclick = () => {
  document.getElementById('start').remove();
  requestLock(canvas);
  ui.toast('You own one building. Find something under-built and take it.');
};

function resize() {
  scene.resize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();

let last = performance.now();
let uiAccum = 0;

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // Street time runs at a fixed pace; only the board lets you compress it.
  const minutesPerSecond = controls.mode === MODE.BOARD ? SPEEDS[speed] : Math.min(SPEEDS[speed], 5);
  advance(state, (minutesPerSecond * dt) / (60 * 24));

  controls.update(dt, scene);
  scene.updateTraffic(dt);
  scene.updateCrowd(dt, controls.focusPoint);
  scene.updateSites(dt);
  scene.updateHighlight();
  scene.animateAvatar(dt, controls.moving && controls.mode === MODE.STREET);

  const hour = ((state.day % 1) * 24 + 11) % 24;   // open late morning
  scene.updateSky(hour, controls.mode === MODE.BOARD ? controls.board.target : controls.focusPoint, dt);

  if (state._dirtyGeometry) {
    state._dirtyGeometry = false;
    scene.syncBuildings();
    scene.refreshCorridorLabels();
    ui.refreshBoard();
  }

  // Contextual prompt on the street.
  if (controls.mode === MODE.STREET && !visionLot) {
    const lot = controls.currentLot(city);
    const nearCar = controls.pos.distanceTo(scene.playerCar.position) < 6;
    if (nearCar) ui.prompt('E — get in the car');
    else if (lot) ui.prompt(`V — raise the Vision on lot #${lot.id}`);
    else ui.prompt('');
  } else if (controls.mode === MODE.CAR) {
    ui.prompt('E — get out');
  } else ui.prompt('');

  // While the pointer is locked the canvas swallows every click, so no HUD
  // control is reachable. Say how to get the cursor back.
  if (controls.mode !== MODE.BOARD) {
    document.getElementById('modehint').textContent = document.pointerLockElement
      ? 'ESC — free the cursor  ·  TAB — rise to the board'
      : 'click the view to look around  ·  TAB — rise to the board';
  }

  const labelLot = controls.mode === MODE.BOARD
    ? ui.selected
    : (visionLot || nearbyNotable());
  ui.updateWorldLabel(labelLot, scene.camera);

  uiAccum += dt;
  if (uiAccum > 0.25) {
    uiAccum = 0;
    ui.refreshTop();
    ui.refreshNews();
    if (controls.mode === MODE.BOARD) ui.refreshBoard();
    if (ui.selected) {
      const keep = ui.selected;
      ui.select(keep);
    }
    checkMilestones();
  }

  scene.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ------------------------------------------------------------- milestones

let wasLeader = false;
let warnedCash = false;
function checkMilestones() {
  const board = leaderboard(state);
  const leading = board[0].isPlayer;
  if (leading && !wasLeader) {
    ui.toast('You are now the biggest developer in the city.');
    wasLeader = true;
  } else if (!leading && wasLeader) {
    wasLeader = false;
  }
  const me = state.actors.player;
  if (me.cash < 0 && !warnedCash) {
    warnedCash = true;
    ui.toast('You are out of cash. Debt service is eating you — sell something.', true);
  } else if (me.cash > 5e6) warnedCash = false;
}

// Handy when poking at the running game from the console.
window.__game = { state, city, scene, controls, ui };
