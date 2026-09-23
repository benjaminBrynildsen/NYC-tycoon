// Bootstrap and the game loop. Wires the sim, the renderer, the controls and the HUD.

import * as THREE from 'three';
import { generateCity, CONFIG, cellOf, canReclaim, minFloors } from './world.js';
import { createState, advance, netWorth, leaderboard, money, sf, logEvent, formatDate,
         currentEra, currentYear,
         reclaimCost, startReclaim, canReclaimHere, sellAll,
         takeableFirms, takeOverFirm } from './economy.js';
import { CityScene, QUALITY } from './scene.js';
import { Controls, MODE, requestLock, isTyping } from './controls.js';
import { UI } from './ui.js';
import { rewardLine } from './contracts.js';
import { isTouch, setupTouch } from './touch.js';

// Game minutes that pass per real second, by speed setting.
// 43,200 minutes is thirty days: one month every second.
const SPEEDS = [0, 5, 60, 720, 4320, 43200];

// On foot the clock stays walkable — a month a second would strobe the sun
// and make the street unreadable. The board is where you compress time.
const STREET_CAP = 60;

/**
 * Seed handling. A reset reloads the page rather than tearing the scene down,
 * which is the one way to guarantee nothing is left over from the last game,
 * so the seed has to survive the reload. The hash makes a city shareable; the
 * session copy is the fallback where an embedded view rewrites the URL.
 */
const DEFAULT_SEED = 7;
const DEFAULT_YEAR = 1998;

function readStart() {
  const m = /^#s(\d+)y(\d+)$/.exec(location.hash || '');
  if (m) return { seed: +m[1], year: +m[2] };
  try {
    const v = sessionStorage.getItem('airrights.start');
    if (v) { const [s2, y2] = v.split(':').map(Number); return { seed: s2, year: y2 }; }
  } catch { /* private window or blocked storage */ }
  return { seed: DEFAULT_SEED, year: DEFAULT_YEAR };
}
function writeStart(seed, year) {
  try { sessionStorage.setItem('airrights.start', `${seed}:${year}`); } catch { /* fine */ }
  try { location.hash = `s${seed}y${year}`; } catch { /* fine */ }
}

const { seed: SEED, year: START_YEAR } = readStart();
const canvas = document.getElementById('view');
const city = generateCity(SEED, START_YEAR);
const state = createState(city, SEED, START_YEAR);
// A phone gets fewer people, fewer cars and no shadows; the sim is identical.
const TOUCH = isTouch();
const scene = new CityScene(state, canvas, TOUCH ? QUALITY.low : QUALITY.high);
const controls = new Controls(scene, canvas);
const ui = new UI(state, controls);

// Give the player a foothold so month one isn't a blank sheet.
(function seedPlayer() {
  // Start in the Village: cheap, walkable, and surrounded by under-built lots.
  const candidates = city.lots.filter((l) =>
    l.region === 'manhattan' && l.hood === 'village' && l.building && l.building.floors <= 8);
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
  // Fingers are handled by the touch module, which can tell a tap from a drag
  // or a pinch. Without this guard every touch also arrives here as a click.
  if (e.pointerType === 'touch') return;
  if (controls.mode !== MODE.BOARD || e.button !== 0) return;
  if (controls.panMoved > 5) return;          // that was a drag, not a click
  pickAt(e.clientX, e.clientY);
});

/** Turn a screen point in the board view into a lot, or into open water. */
function pickAt(clientX, clientY) {
  ndc.set((clientX / innerWidth) * 2 - 1, -(clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, scene.camera);

  // Prefer an actual building hit, fall back to the ground plane. The visible
  // city is merged per block and has no idea which lot a triangle came from,
  // so the ray is cast at the pick proxies: one invisible solid per building,
  // never rendered, each of which knows its lot.
  const hits = ray.intersectObjects([scene.pickGroup, scene.siteGroup], true);
  let lot = null;
  for (const hit of hits) {
    const id = lotIdOf(hit.object);
    if (id === undefined) continue;
    lot = city.lots.find((l) => l.id === id);
    if (lot) break;
  }
  if (!lot) {
    const p = new THREE.Vector3();
    if (ray.ray.intersectPlane(groundPlane, p)) {
      lot = nearestLot(p.x, p.z, 26);
    }
  }
  if (lot) { ui.select(lot); hideWater(); return; }

  const hit = new THREE.Vector3();
  if (!ray.ray.intersectPlane(groundPlane, hit)) return;
  const { col, row } = cellOf(hit.x, hit.z);
  if (canReclaim(city, col, row)) showWater(col, row);
  else hideWater();
}

// --- reclaiming water
const waterPanel = document.getElementById('water-panel');
const hideWater = () => waterPanel.classList.add('hidden');
document.getElementById('water-close').onclick = hideWater;

function showWater(col, row) {
  ui.closeLot();
  waterPanel.classList.remove('hidden');
  const cost = reclaimCost(state, col, row, 'player');
  const why = canReclaimHere(state, 'player', col, row);
  const pending = state.fills.find((f) => f.col === col && f.row === row);
  document.getElementById('water-meta').textContent = pending
    ? `Fill in progress — ${((pending.endDay - state.day) / 30).toFixed(1)} months to go.`
    : 'Open water beside the shore. Fill it and the lots on top are yours.';
  document.getElementById('water-cost').textContent = money(cost);
  const btn = document.getElementById('do-reclaim');
  btn.disabled = !!why || !!pending;
  btn.textContent = pending ? 'Already filling' : why ? 'Locked' : `Fill it — ${money(cost)}`;
  document.getElementById('water-note').textContent = why || '';
  btn.onclick = () => {
    const r = startReclaim(state, col, row, 'player');
    if (!r.ok) return ui.toast(r.why, true);
    ui.toast(`Barges booked. ${money(r.cost)} for four lots of new ground in two years.`);
    ui.refreshTop();
    showWater(col, row);
  };
}

/**
 * A fall is worth a line, once. There is no health here and there is not going
 * to be — the joke is that the city does not care.
 */
let swimToast = 0;
function reportLanding(kind, height) {
  if (kind === 'water') {
    if (state.day - swimToast < 0.4) return;
    swimToast = state.day;
    ui.toast(height > 20
      ? `${Math.round(height)} metres into the river. Swim for the kerb — walk at the shore and you'll climb out.`
      : 'In the drink. Swim at the shore and you climb out.');
  } else if (kind === 'hard' && height > 14) {
    ui.toast(`You walked off ${Math.round(height)} metres of building. Nobody on the street looked up.`);
  }
}

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

/** Climb out of a building's meshes to the group that knows its lot. */
function lotIdOf(obj) {
  for (let o = obj; o; o = o.parent) {
    if (o.userData && o.userData.lotId !== undefined) return o.userData.lotId;
  }
  return undefined;
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
    case 'KeyE': useElevatorOrCar(); break;
    case 'Space':
      e.preventDefault();
      // On your feet the bar is a jump; from the board it is still the pause.
      if (controls.mode === MODE.STREET) controls.jump();
      else ui.setSpeed(speed === 0 ? 1 : 0);
      break;
    case 'Digit1': ui.setSpeed(1); break;
    case 'Digit2': ui.setSpeed(2); break;
    case 'Digit3': ui.setSpeed(3); break;
    case 'Digit4': ui.setSpeed(4); break;
    case 'Digit5': ui.setSpeed(5); break;
    case 'Escape':
      if (document.pointerLockElement) document.exitPointerLock();
      ui.closeLot(); scene.hideVision(); visionLot = null;
      break;
  }
});

/**
 * The mooring mast you could reach from where you're standing, if any.
 *
 * The reach has to scale with the deck. A supertall's top deck can be four
 * metres across, and a fixed reach would swallow the whole of it — leaving
 * nowhere to stand where E still means the lift down.
 */
function mastInReach() {
  if (controls.mode !== MODE.STREET || !controls.platform || controls.riding) return null;
  const lot = controls.currentLot(city);
  if (!lot) return null;
  const mast = scene.mastFor(lot.id);
  if (!mast) return null;
  const p = controls.platform;
  const reach = Math.min(5.5, Math.max(1.6, Math.min(p.hw, p.hd) * 0.45));
  return Math.hypot(controls.pos.x - mast.x, controls.pos.z - mast.z) < reach ? mast : null;
}

/** E does the obvious thing for wherever you're standing. */
function useElevatorOrCar() {
  if (controls.riding) return;
  if (controls.mode === MODE.AIRSHIP) {
    const left = controls.leaveAirship();
    if (left) {
      scene.releasePlayerShip(left.pos, left.yaw);
      ui.toast('Over the side. Mind the landing.');
    }
    return;
  }
  const mast = mastInReach();
  if (mast) {
    if (controls.boardAirship(mast)) {
      ui.toast('Cast off. Look where you want to go and hold forward · E steps out.');
    }
    return;
  }
  if (controls.platform) {
    controls.startRide(null);
    return;
  }
  if (controls.mode === MODE.CAR) { controls.exitCar(); ui.toast('Out of the car.'); return; }

  const lot = controls.currentLot(city);
  const roof = lot && lot.building ? scene.roofOf(lot.id) : null;
  if (roof && lot.building.floors >= 6) { controls.startRide(roof); return; }

  if (controls.enterCar()) ui.toast('Driving. W/S throttle, A/D steer, E to get out.');
}

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
document.getElementById('buildstamp').textContent = `city ${SEED} · ${START_YEAR} · build ${BUILD}`;
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
  writeStart(sameCity ? SEED : Math.floor(Math.random() * 999_999) + 1, START_YEAR);
  location.reload();
}
document.getElementById('reset-new').onclick = () => restart(false);
document.getElementById('reset-same').onclick = () => restart(true);

function beginGame(message) {
  document.getElementById('start')?.remove();
  document.getElementById('firms')?.remove();
  requestLock(canvas);
  ui.refreshTop();
  ui.refreshNews();
  ui.toast(message);
}

document.getElementById('begin').onclick = () => {
  beginGame('You own one building. Find something under-built and take it.');
};

// --- which century you start in
{
  const era = currentEra(state);
  document.getElementById('era-now').textContent = `${START_YEAR} · ${era.name}`;
  document.getElementById('era-note').textContent = era.note;
  for (const btn of document.querySelectorAll('#erapick button')) {
    btn.classList.toggle('on', +btn.dataset.year === START_YEAR);
    btn.onclick = () => {
      if (+btn.dataset.year === START_YEAR) return;
      writeStart(SEED, +btn.dataset.year);
      location.reload();
    };
  }
}

// --- joining a game already under way
document.getElementById('begin-takeover').onclick = () => {
  document.getElementById('yearpick').classList.remove('hidden');
  document.getElementById('begin-takeover').disabled = true;
};

for (const btn of document.querySelectorAll('#yearpick .yearrow button')) {
  btn.onclick = () => runAhead(+btn.dataset.years);
}

/**
 * Let the city develop without you, then offer whoever is left. The player
 * starts owning nothing, so during these years there is no empty slot in the
 * field and nothing is conjured up when you finally step in.
 */
function runAhead(years) {
  document.getElementById('yearpick').innerHTML =
    '<p class="sub small">Simulating ' + years + ' years…</p>';
  setTimeout(() => {
    for (const lot of city.lots) if (lot.owner === 'player') lot.owner = 'npc';
    state.actors.player.gsfBuilt = 0;
    state.log.length = 0;
    advance(state, years * 365);
    scene.syncBuildings();
    scene.refreshCorridorLabels();
    showFirms();
  }, 40);
}

function showFirms() {
  const firms = takeableFirms(state);
  document.getElementById('start').remove();
  const panel = document.getElementById('firms');
  panel.classList.remove('hidden');
  const words = ['No', 'One firm is', 'Two firms are', 'Three firms are'][firms.length] || `${firms.length} firms are`;
  document.getElementById('firms-head').textContent = `${words} working the city`;
  document.getElementById('firms-sub').textContent =
    `${formatDate(state)}. Pick the books you want to inherit — the land, the cash and the debt `
    + 'all come with the name.';

  const row = (k, v, cls = '') =>
    `<div class="kv"><span>${k}</span><b class="${cls}">${v}</b></div>`;
  document.getElementById('firmlist').innerHTML = firms.map((f) => `
    <div class="firmcard" style="border-top-color:#${f.color.toString(16).padStart(6, '0')}">
      <h3>${f.name}</h3>
      <p class="blurb">${f.blurb}</p>
      <div class="nwl">Net worth</div>
      <div class="nw">${money(f.total)}</div>
      <div class="rows">
        ${row('Cash', money(f.cash), f.cash > 0 ? 'good' : 'bad')}
        ${row('Debt', money(f.debt), f.debt > f.total ? 'bad' : '')}
        ${row('Income', `${money(f.netIncome)}/yr`, f.netIncome < 0 ? 'bad' : 'good')}
        ${row('Holdings', `${f.lots} lots · ${f.built} built`)}
        ${row('Floor area', sf(f.gsf))}
        ${row('Building now', f.building ? `${f.building} site${f.building > 1 ? 's' : ''}` : '—')}
      </div>
      <div class="flag">${f.flagship
        ? `Flagship: ${f.flagship.building.floors} floors at ${f.flagship.address}`
        : 'No completed buildings.'}${f.regions.length > 1 ? ' · boroughs unlocked' : ''}</div>
      <button data-firm="${f.id}">Take over ${f.name.split(' ')[0]}</button>
    </div>`).join('');

  for (const btn of document.querySelectorAll('#firmlist button')) {
    btn.onclick = () => {
      const r = takeOverFirm(state, btn.dataset.firm);
      if (!r.ok) return;
      scene.syncBuildings();
      ui.refreshBoard();
      // Stand the player outside their biggest building.
      const flag = city.lots.find((l) => l.owner === 'player' && l.building)
        || city.lots.find((l) => l.owner === 'player');
      if (flag) {
        controls.pos.set(flag.x, 0, flag.z + CONFIG.LOT * 1.6);
        controls.board.target.set(flag.x, 0, flag.z);
        scene.playerCar.position.set(flag.x + 18, 0, flag.z + CONFIG.LOT * 1.6);
        controls.car.pos.copy(scene.playerCar.position);
      }
      beginGame(`You are ${state.actors.player.name}: ${r.lots} lots and ${money(r.debt)} of debt.`);
    };
  }
}

function resize() {
  scene.resize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();

let last = performance.now();
let uiAccum = 0;
let displayHour = 11;

/** Signed hours from a to b, taking the short way round the clock face. */
function shortArc(a, b) {
  let d = b - a;
  while (d > 12) d -= 24;
  while (d < -12) d += 24;
  return d;
}

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  // Street time runs at a fixed pace; only the board lets you compress it.
  const minutesPerSecond = controls.mode === MODE.BOARD
    ? SPEEDS[speed]
    : Math.min(SPEEDS[speed], STREET_CAP);
  advance(state, (minutesPerSecond * dt) / (60 * 24));

  controls.update(dt, scene);
  scene.updateTraffic(dt);
  scene.updateCrowd(dt, controls.focusPoint);
  scene.updateSites(dt);
  scene.updateHighlight();
  scene.animateAvatar(dt, controls.moving && controls.mode === MODE.STREET);

  // The sun tracks the clock up to the 12h/s setting. Past that a real
  // day/night cycle just strobes, so the light settles to a steady early
  // afternoon and eases back to the real hour when you slow down.
  const liveHour = ((state.day % 1) * 24 + 11) % 24;
  const compressed = minutesPerSecond > SPEEDS[3];
  const gap = shortArc(displayHour, compressed ? 13 : liveHour);
  displayHour = (compressed || Math.abs(gap) > 0.75)
    ? (displayHour + gap * Math.min(1, dt * 1.6) + 24) % 24
    : liveHour;
  const hour = displayHour;
  scene.updateSky(hour, controls.mode === MODE.BOARD ? controls.board.target : controls.focusPoint, dt);

  scene.updateClouds(dt);
  scene.updateAirships(dt, !!currentEra(state).airships);
  scene.updateFills(state.fills);

  const lift = document.getElementById('elevator');
  if (controls.riding) {
    lift.classList.remove('hidden');
    document.getElementById('lift-floor').textContent = controls.rideFloor;
  } else lift.classList.add('hidden');

  if (state._dirtyTerrain) {
    state._dirtyTerrain = false;
    scene.rebuildTerrain();
    scene.refreshCorridorLabels();
  }
  if (state._dirtyGeometry) {
    state._dirtyGeometry = false;
    scene.syncBuildings();
    scene.refreshCorridorLabels();
    ui.refreshBoard();
  }

  // Contextual prompt on the street.
  if (controls.mode === MODE.STREET && !visionLot) {
    const lot = controls.currentLot(city);
    const roof = lot && lot.building ? scene.roofOf(lot.id) : null;
    const nearCar = controls.pos.distanceTo(scene.playerCar.position) < 6;
    // At the mast, E is the airship; anywhere else on the roof it is the lift.
    if (mastInReach()) ui.prompt('E — take the airship');
    else if (controls.platform) ui.prompt('E — take the lift down');
    else if (roof && lot.building.floors >= 6) ui.prompt(`E — lift to the roof (${lot.building.floors} floors)  ·  V — the Vision`);
    else if (nearCar) ui.prompt('E — get in the car');
    else if (lot) ui.prompt(`V — raise the Vision on lot #${lot.id}`);
    else ui.prompt('');
  } else if (controls.mode === MODE.CAR) {
    ui.prompt('E — get out');
  } else if (controls.mode === MODE.AIRSHIP) {
    ui.prompt(`${Math.round(controls.ship.pos.y)} m · ${Math.round(controls.ship.speed * 2.24)} mph · E — over the side`);
  } else ui.prompt('');

  // While the pointer is locked the canvas swallows every click, so no HUD
  // control is reachable. Say how to get the cursor back.
  if (controls.mode !== MODE.BOARD) {
    document.getElementById('modehint').textContent = document.pointerLockElement
      ? 'ESC — free the cursor  ·  TAB — rise to the board'
      : 'click the view to look around  ·  TAB — rise to the board';
  }

  if (controls.landedOn) reportLanding(controls.landedOn, controls.fallHeight ?? 0);

  const labelLot = controls.mode === MODE.BOARD
    ? ui.selected
    : (visionLot || nearbyNotable());
  ui.updateWorldLabel(labelLot, scene.camera);

  uiAccum += dt;
  if (uiAccum > 0.25) {
    uiAccum = 0;
    // Say so when the street is holding the clock back, rather than silently
    // ignoring the speed you picked.
    const capped = controls.mode !== MODE.BOARD && SPEEDS[speed] > STREET_CAP;
    document.getElementById('speednote').textContent = capped ? 'street time — TAB to run the clock' : '';
    ui.refreshTop();
    ui.refreshNews();
    ui.refreshJobs();
    if (controls.mode === MODE.BOARD) ui.refreshBoard();
    if (ui.selected) {
      const keep = ui.selected;
      ui.select(keep);
    }
    checkMilestones();
    checkContractWins();
  }

  if (scene.post?.watchCost(dt)) {
    ui.toast('Ambient occlusion off — this device was spending more on corners than it could afford.');
  }

  scene.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/**
 * The paper reports every contract, but the one you just won deserves to land
 * in the moment rather than three headlines down the page.
 */
let seenWins = 0;
function checkContractWins() {
  const mine = state.contracts.filter((c) => c.claimedBy === 'player');
  if (mine.length <= seenWins) { seenWins = mine.length; return; }
  seenWins = mine.length;
  const c = mine[0];
  ui.toast(`${c.client} pay out — ${c.title}. ${rewardLine(c)}`);
}

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

if (TOUCH) {
  setupTouch(controls, ui, scene, canvas, {
    vision: toggleVision,
    use: useElevatorOrCar,
    pick: (cx, cy) => pickAt(cx, cy),
  });
}

// Handy when poking at the running game from the console.
window.__game = { state, city, scene, controls, ui, showWater, startReclaim, reclaimCost,
                  advance, ray, pickAt, mastInReach, use: useElevatorOrCar };
