// Touch controls. Entirely additive: on a desktop none of this runs and the
// keyboard and mouse paths are untouched.

export function isTouch() {
  return (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0)
    && matchMedia('(hover: none)').matches;
}

const $ = (id) => document.getElementById(id);

/**
 * Left thumb walks, right thumb looks, buttons do the verbs. In the board view
 * one finger pans the city and two pinch and twist it.
 */
export function setupTouch(controls, ui, scene, canvas, actions) {
  document.body.classList.add('touch');
  const stick = $('stick');
  const knob = $('stick-knob');
  const RADIUS = 52;

  let moveId = null, moveOrigin = null;
  let lookId = null, lookLast = null;
  let pinch = null;

  const isBoard = () => controls.mode === 'board';
  const onUI = (t) => !!t.target.closest('#hud .panel, #touchpad, #topbar, #rail, #np-full, #firms, #start');

  canvas.addEventListener('touchstart', (e) => {
    for (const t of e.changedTouches) {
      if (onUI(t)) continue;
      if (isBoard()) {
        if (lookId === null) { lookId = t.identifier; lookLast = { x: t.clientX, y: t.clientY, moved: 0 }; }
        else if (pinch === null) {
          const a = [...e.touches].slice(0, 2);
          pinch = { d: Math.hypot(a[0].clientX - a[1].clientX, a[0].clientY - a[1].clientY),
                    a: Math.atan2(a[1].clientY - a[0].clientY, a[1].clientX - a[0].clientX) };
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
        lookLast = { x: t.clientX, y: t.clientY, moved: 0 };
      }
    }
  }, { passive: true });

  canvas.addEventListener('touchmove', (e) => {
    if (pinch && e.touches.length >= 2) {
      const a = [...e.touches].slice(0, 2);
      const d = Math.hypot(a[0].clientX - a[1].clientX, a[0].clientY - a[1].clientY);
      const ang = Math.atan2(a[1].clientY - a[0].clientY, a[1].clientX - a[0].clientX);
      controls.board.dist = Math.max(90, Math.min(2600, controls.board.dist * (pinch.d / (d || 1))));
      controls.board.yaw -= (ang - pinch.a);
      pinch = { d, a: ang };
      e.preventDefault();
      return;
    }
    for (const t of e.changedTouches) {
      if (t.identifier === moveId) {
        const dx = t.clientX - moveOrigin.x, dy = t.clientY - moveOrigin.y;
        const len = Math.hypot(dx, dy) || 1;
        const clamp = Math.min(len, RADIUS) / RADIUS;
        knob.style.transform = `translate(${(dx / len) * clamp * RADIUS}px, ${(dy / len) * clamp * RADIUS}px)`;
        controls.touchAxis = { fx: (dx / len) * clamp, fz: (dy / len) * clamp };
      } else if (t.identifier === lookId) {
        const dx = t.clientX - lookLast.x, dy = t.clientY - lookLast.y;
        lookLast = { x: t.clientX, y: t.clientY, moved: lookLast.moved + Math.abs(dx) + Math.abs(dy) };
        if (isBoard()) controls.panBy(dx, dy);
        else {
          controls.yaw -= dx * 0.005;
          controls.pitch = Math.max(-1.05, Math.min(0.95, controls.pitch - dy * 0.005));
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
        // A tap that never moved is a selection, not a drag.
        if (isBoard() && lookLast && lookLast.moved < 12) actions.pick(t.clientX, t.clientY);
        lookId = null; lookLast = null;
      }
    }
    if (e.touches.length < 2) pinch = null;
  };
  canvas.addEventListener('touchend', end, { passive: true });
  canvas.addEventListener('touchcancel', end, { passive: true });

  $('tb-board').onclick = () => controls.toggleBoard();
  $('tb-vision').onclick = () => actions.vision();
  $('tb-action').onclick = () => actions.use();
  $('tb-run').onclick = () => {
    const on = $('tb-run').classList.toggle('on');
    if (on) controls.keys.add('ShiftLeft'); else controls.keys.delete('ShiftLeft');
  };
  $('tb-menu').onclick = () => $('rail').classList.toggle('open');
}
