// Low-poly model kit: cars, people and street furniture. Everything here is
// built from boxes, merged once, and drawn with instancing.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

function box(w, h, d, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}
function cyl(rt, rb, h, seg, x = 0, y = 0, z = 0, rotZ = 0) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  if (rotZ) g.rotateZ(rotZ);
  g.translate(x, y, z);
  return g;
}
const merge = (list) => mergeGeometries(list, false);

// ------------------------------------------------------------------ vehicles

function wheels(halfW, axleF, axleR, r = 0.36) {
  const w = [];
  for (const [sx, sz] of [[-1, axleF], [1, axleF], [-1, axleR], [1, axleR]]) {
    w.push(cyl(r, r, 0.26, 10, sx * halfW, r, sz, Math.PI / 2));
  }
  return w;
}

/**
 * Each vehicle is three geometries: painted body, dark glass, and emissive
 * lamps. They share one transform, so the scene draws three instanced meshes
 * per model and they stay glued together.
 */
export function vehicleModels() {
  const M = {};

  // Sedan — long hood, low cabin.
  M.sedan = {
    body: merge([
      box(1.86, 0.62, 4.5, 0, 0.66, 0),
      box(1.72, 0.52, 2.3, 0, 1.18, -0.12),
      box(1.8, 0.2, 4.4, 0, 0.42, 0),
    ]),
    glass: merge([
      ...wheels(0.93, 1.45, -1.45),
      box(1.63, 0.42, 1.0, 0, 1.25, 0.55),
      box(1.63, 0.42, 0.9, 0, 1.25, -0.85),
      box(1.66, 0.36, 1.2, 0, 1.25, -0.1),
    ]),
    lamps: merge([
      box(0.34, 0.16, 0.12, -0.66, 0.78, 2.22), box(0.34, 0.16, 0.12, 0.66, 0.78, 2.22),
      box(0.4, 0.14, 0.1, -0.64, 0.8, -2.24), box(0.4, 0.14, 0.1, 0.64, 0.8, -2.24),
    ]),
    scale: 1,
  };

  // SUV — taller, boxier, bigger wheels.
  M.suv = {
    body: merge([
      box(1.98, 0.9, 4.7, 0, 0.86, 0),
      box(1.9, 0.78, 3.0, 0, 1.66, -0.3),
      box(1.94, 0.18, 4.6, 0, 0.5, 0),
    ]),
    glass: merge([
      ...wheels(1.0, 1.55, -1.5, 0.44),
      box(1.8, 0.56, 1.1, 0, 1.74, 1.05),
      box(1.8, 0.56, 1.4, 0, 1.74, -1.25),
      box(1.84, 0.5, 1.5, 0, 1.74, -0.1),
    ]),
    lamps: merge([
      box(0.36, 0.2, 0.12, -0.7, 1.05, 2.32), box(0.36, 0.2, 0.12, 0.7, 1.05, 2.32),
      box(0.3, 0.3, 0.1, -0.76, 1.2, -2.34), box(0.3, 0.3, 0.1, 0.76, 1.2, -2.34),
    ]),
    scale: 1,
  };

  // Taxi — a sedan with a roof sign and a partition.
  M.taxi = {
    body: merge([
      box(1.9, 0.66, 4.6, 0, 0.68, 0),
      box(1.76, 0.58, 2.5, 0, 1.24, -0.1),
      box(0.9, 0.24, 0.34, 0, 1.64, 0.35),
    ]),
    glass: merge([
      ...wheels(0.95, 1.5, -1.48),
      box(1.66, 0.46, 1.05, 0, 1.3, 0.6),
      box(1.66, 0.46, 0.95, 0, 1.3, -0.95),
      box(1.7, 0.4, 1.3, 0, 1.3, -0.1),
    ]),
    lamps: merge([
      box(0.34, 0.16, 0.12, -0.66, 0.8, 2.28), box(0.34, 0.16, 0.12, 0.66, 0.8, 2.28),
      box(0.38, 0.14, 0.1, -0.64, 0.82, -2.3), box(0.38, 0.14, 0.1, 0.64, 0.82, -2.3),
      box(0.86, 0.2, 0.3, 0, 1.64, 0.35),
    ]),
    fixedColor: 0xf2b829,
    scale: 1,
  };

  // Work van — high roof, flat front.
  M.van = {
    body: merge([
      box(2.0, 1.5, 5.2, 0, 1.2, -0.2),
      box(1.94, 0.7, 1.5, 0, 0.92, 2.1),
    ]),
    glass: merge([
      ...wheels(1.0, 1.75, -1.7, 0.4),
      box(1.8, 0.62, 0.14, 0, 1.4, 2.78),
      box(0.16, 0.56, 1.0, -0.98, 1.4, 2.0), box(0.16, 0.56, 1.0, 0.98, 1.4, 2.0),
    ]),
    lamps: merge([
      box(0.34, 0.2, 0.12, -0.72, 0.85, 2.84), box(0.34, 0.2, 0.12, 0.72, 0.85, 2.84),
      box(0.26, 0.4, 0.1, -0.88, 1.6, -2.82), box(0.26, 0.4, 0.1, 0.88, 1.6, -2.82),
    ]),
    scale: 1,
  };

  // Box truck — the thing double-parked on your street.
  M.boxtruck = {
    body: merge([
      box(2.28, 2.3, 5.0, 0, 2.0, -1.0),
      box(2.1, 1.5, 2.2, 0, 1.3, 2.3),
      box(2.2, 0.3, 7.2, 0, 0.66, 0),
    ]),
    glass: merge([
      ...wheels(1.12, 2.5, -1.9, 0.46),
      cyl(0.46, 0.46, 0.26, 10, -1.12, 0.46, -3.0, Math.PI / 2),
      cyl(0.46, 0.46, 0.26, 10, 1.12, 0.46, -3.0, Math.PI / 2),
      box(1.94, 0.72, 0.14, 0, 1.62, 3.34),
      box(0.16, 0.66, 1.1, -1.04, 1.6, 2.4), box(0.16, 0.66, 1.1, 1.04, 1.6, 2.4),
    ]),
    lamps: merge([
      box(0.32, 0.2, 0.12, -0.8, 0.9, 3.4), box(0.32, 0.2, 0.12, 0.8, 0.9, 3.4),
      box(0.3, 0.24, 0.1, -0.98, 1.0, -3.52), box(0.3, 0.24, 0.1, 0.98, 1.0, -3.52),
    ]),
    scale: 1,
  };

  // Sports coupe — low, wide, pointless in traffic.
  M.sports = {
    body: merge([
      box(1.92, 0.44, 4.3, 0, 0.5, 0),
      box(1.7, 0.4, 1.9, 0, 0.9, -0.35),
      box(1.86, 0.16, 4.2, 0, 0.32, 0),
      box(1.5, 0.12, 0.5, 0, 0.98, -2.0),
    ]),
    glass: merge([
      ...wheels(0.94, 1.42, -1.42, 0.34),
      box(1.58, 0.34, 1.6, 0, 0.98, -0.2),
    ]),
    lamps: merge([
      box(0.46, 0.12, 0.1, -0.58, 0.6, 2.12), box(0.46, 0.12, 0.1, 0.58, 0.6, 2.12),
      box(0.5, 0.12, 0.1, -0.56, 0.62, -2.14), box(0.5, 0.12, 0.1, 0.56, 0.62, -2.14),
    ]),
    scale: 1,
  };

  return M;
}

export const CAR_PAINT = [
  0x15161a, 0x2b2d33, 0xb9bec5, 0xe8e6e0, 0x8d2f2a, 0x1f3d63, 0x2f5d3a,
  0x6f7076, 0xa94f2e, 0x3d3a52, 0x7b8e99, 0xc9c3b4, 0x5a2733, 0x1d4f52,
];

// -------------------------------------------------------------------- people

/**
 * Four parts so the walk cycle can actually move: coat, head, and two legs
 * pivoted at the hip.
 */
export function personParts() {
  const coat = merge([
    box(0.44, 0.66, 0.26, 0, 0.0, 0),          // torso, pivot at its centre
    box(0.13, 0.5, 0.15, -0.28, -0.04, 0),     // arms
    box(0.13, 0.5, 0.15, 0.28, -0.04, 0),
    box(0.4, 0.12, 0.24, 0, 0.36, 0),          // shoulders
  ]);
  const head = merge([
    new THREE.SphereGeometry(0.115, 8, 6),
    box(0.2, 0.08, 0.22, 0, -0.14, 0),         // collar
  ]);
  const leg = box(0.155, 0.52, 0.17, 0, -0.26, 0);   // pivot at hip
  const bag = box(0.22, 0.26, 0.12, 0, 0, 0);
  return { coat, head, leg, bag };
}

export const COAT_COLORS = [
  0x24262b, 0x32394a, 0x6d5f4e, 0x7c3a33, 0x2f4a3c, 0xb9b3a6, 0x4a3f55,
  0x1f2a33, 0x8a7a5e, 0x3f5a6b, 0x55303a, 0xd6d1c4, 0x2b3a2e, 0x6a6f78,
];
export const SKIN_TONES = [0xf0c8a0, 0xd9a57a, 0xb57c53, 0x8d5a3a, 0x63402b, 0xf5d9bd];

// ----------------------------------------------------------- street furniture

export function streetProps() {
  return {
    lampPost: merge([
      cyl(0.1, 0.14, 7.4, 6, 0, 3.7, 0),
      box(1.5, 0.14, 0.14, 0.7, 7.3, 0),
    ]),
    lampHead: merge([box(0.7, 0.2, 0.34, 1.3, 7.2, 0)]),
    hydrant: merge([
      cyl(0.16, 0.19, 0.72, 8, 0, 0.36, 0),
      new THREE.SphereGeometry(0.17, 8, 6).translate(0, 0.76, 0),
      box(0.52, 0.12, 0.14, 0, 0.5, 0),
    ]),
    trash: merge([
      new THREE.SphereGeometry(0.34, 6, 5).translate(0, 0.3, 0),
      new THREE.SphereGeometry(0.28, 6, 5).translate(0.42, 0.25, 0.2),
      new THREE.SphereGeometry(0.25, 6, 5).translate(-0.3, 0.22, 0.3),
    ]),
    trafficLight: merge([
      cyl(0.09, 0.11, 6.2, 6, 0, 3.1, 0),
      box(0.26, 0.9, 0.3, 0, 5.6, 0),
    ]),
    bench: merge([
      box(1.8, 0.1, 0.5, 0, 0.45, 0),
      box(1.8, 0.5, 0.1, 0, 0.7, -0.2),
      box(0.12, 0.45, 0.45, -0.8, 0.22, 0), box(0.12, 0.45, 0.45, 0.8, 0.22, 0),
    ]),
  };
}
