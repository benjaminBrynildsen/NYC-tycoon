// Touch controls. Entirely additive: on a desktop none of this runs and the
// keyboard and mouse paths are untouched.

export function isTouch() {
  return (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0)
    && matchMedia('(hover: none)').matches;
}

const $ = (id) => document.getElementById(id);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// A tap is a single finger that barely moved and did not linger. Anything else
// is a drag, a pinch or a tilt, and must never select a building.
const TAP_SLOP = 12;     // pixels of total travel still counted as a tap
const TAP_MS = 550;

/**
 * Left thumb walks, right thumb looks, buttons do the verbs. In the board view
 * one finger pans, two pinch to zoom, twist to rotate and slide up or down to
 * tilt towards the skyline.
 */
export function setupTouch(controls, ui, scene, canvas, actions) {
  document.body.classList.add('touch');
  const stick = $('stick');
  const knob = $('stick-knob');
  const RADIUS = 52;

  let moveId = null, moveOrigin = null;
  let lookId = null, look = null;
  let pinch = null;
  let multi = false;          // two fingers touched at any point in this gesture

  const isBoard = () => controls.mode === 'board';
  const onUI = (t) => !!t.target.closest('#hud .panel, #touchpad, #topbar, #rail, #np-full, #firms, #start');

  const twoFingers = (e) => {
    const a = [...e.touches].slice(0, 2);
    return {
      d: Math.hypot(a[0].clientX - a[1].clientX, a[0].clientY - a[1].clientY),
      a: Math.atan2(a[1].clientY - a[0].clientY, a[1].clientX - a[0].clientX),
      cy: (a[0].clientY + a[1].clientY) / 2,
    };
  };

  canvas.addEventListener('touchstart', (e) => {
    // A brand new gesture — nothing was being tracked — starts out innocent.
    if (moveId === null && lookId === null && pinch === null) multi = false;
    if (e.touches.length > 1 || e.changedTouches.length > 1) multi = true;
    for (const t of e.changedTouches) {
      if (onUI(t)) continue;
      if (isBoard()) {
        if (lookId === null) {
          lookId = t.identifier;
          look = { x: t.clientX, y: t.clientY, moved: 0, t0: performance.now() };
        } else if (pinch === null && e.touches.length >= 2) {
          pinch = twoFingers(e);
        }
        continue;
      }
      // On the street the left half drives the stick, the right half the camera.
      if (t.clientX < innerWidth * 0.45 && moveId === null) {
        moveId = t.identifier;
        moveOrigin = { x: t.clientX, y: t.clientY };
        stick.style.left = `${t.clientX}px`;
        stick.style.top = `${t.clientY}px`;
        stick.classList.add('on');
      } else if (lookId === null) {
        lookId = t.identifier;
        look = { x: t.clientX, y: t.clientY, moved: 0, t0: performance.now() };
      }
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', (e) => {
    if (pinch && e.touches.length >= 2) {
      const now = twoFingers(e);
      // Zoom on the spread, rotate on the twist, tilt on the slide.
      const ratio = clamp(pinch.d / (now.d || 1), 0.7, 1.45);
      controls.board.dist = clamp(controls.board.dist * ratio, 90, 2600);
      // Twist the map the way the fingers turn. Screen y runs downward, so a
      // visually clockwise twist increases the angle between the fingers, and
      // the scene has to turn clockwise with it — which is +yaw, not -yaw.
      controls.board.yaw += (now.a - pinch.a);
      controls.board.pitch = clamp(controls.board.pitch + (pinch.cy - now.cy) * 0.004, -1.5, -0.10);
      pinch = now;
      // A pinch always counts as travel, so the lift never reads as a tap.
      if (look) look.moved += TAP_SLOP + 1;
      e.preventDefault();
      return;
    }
    for (const t of e.changedTouches) {
      if (t.identifier === moveId) {
        const dx = t.clientX - moveOrigin.x, dy = t.clientY - moveOrigin.y;
        const len = Math.hypot(dx, dy) || 1;
        const reach = Math.min(len, RADIUS) / RADIUS;
        knob.style.transform = `translate(${(dx / len) * reach * RADIUS}px, ${(dy / len) * reach * RADIUS}px)`;
        controls.touchAxis = { fx: (dx / len) * reach, fz: (dy / len) * reach };
      } else if (t.identifier === lookId && look) {
        const dx = t.clientX - look.x, dy = t.clientY - look.y;
        look.x = t.clientX; look.y = t.clientY;
        look.moved += Math.abs(dx) + Math.abs(dy);
        if (isBoard()) controls.panBy(dx, dy);
        else {
          controls.yaw -= dx * 0.005;
          controls.pitch = clamp(controls.pitch - dy * 0.005, -1.05, 0.95);
        }
      }
    }
    e.preventDefault();
  }, { passive: false });

  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === moveId) {
        moveId = null;
        controls.touchAxis = null;
        knob.style.transform = '';
        stick.classList.remove('on');
      } else if (t.identifier === lookId) {
        const tapped = look && !multi
          && look.moved < TAP_SLOP
          && performance.now() - look.t0 < TAP_MS;
        if (tapped) {
          if (isBoard()) actions.pick(t.clientX, t.clientY);
          $('rail').classList.remove('open');      // tapping the world closes the menu
        }
        lookId = null; look = null;
      }
    }
    if (e.touches.length < 2) pinch = null;
    if (e.touches.length === 0) multi = false;
  };
  canvas.addEventListener('touchend', end, { passive: true });
  canvas.addEventListener('touchcancel', end, { passive: true });

  $('tb-board').onclick = () => controls.toggleBoard();
  $('tb-vision').onclick = () => actions.vision();
  $('tb-action').onclick = () => actions.use();
  $('tb-jump').onclick = () => controls.jump();
  $('tb-run').onclick = () => {
    const on = $('tb-run').classList.toggle('on');
    if (on) controls.keys.add('ShiftLeft'); else controls.keys.delete('ShiftLeft');
  };
  $('tb-menu').onclick = () => $('rail').classList.toggle('open');
}
