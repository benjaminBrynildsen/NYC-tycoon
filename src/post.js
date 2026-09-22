// Post-processing. The city is mostly a night city — a million lit windows,
// streetlamps, headlights — and none of that reads as *light* until it spills
// past the edge of the thing emitting it. Bloom is what sells the skyline.
//
// It runs before tone mapping, on linear values, which is the only place the
// spill is physically meaningful: the renderer skips tone mapping when it
// draws into a render target, so RenderPass leaves HDR values in the buffer,
// bloom reads them, and OutputPass does the tone map and colour conversion at
// the very end.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export class Post {
  constructor(renderer, scene, camera, quality) {
    this.renderer = renderer;
    this.q = quality;

    const size = renderer.getSize(new THREE.Vector2());
    const dpr = renderer.getPixelRatio();
    // MSAA is lost the moment we render into a target, so ask for it back.
    const target = new THREE.WebGLRenderTarget(size.width * dpr, size.height * dpr, {
      type: THREE.HalfFloatType,
      samples: quality.msaa || 0,
    });

    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));

    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.width, size.height), 0.5, 0.62, 1.0);
    // A phone blurs at half resolution; nobody can tell, and it costs a quarter.
    const scale = quality.bloomScale ?? 1;
    if (scale !== 1) {
      const base = this.bloom.setSize.bind(this.bloom);
      this.bloom.setSize = (w, h) =>
        base(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
    }
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.setNight(0);
  }

  /**
   * 0 is noon, 1 is the middle of the night. By day the threshold sits above
   * white so only a hot specular highlight blooms; after dark it drops under
   * the lit windows and the whole grid starts to glow.
   */
  setNight(n) {
    const k = Math.max(0, Math.min(1, n));
    // Tuned against the skyline at 22:30. Push much past this and the
    // streetlamps smear into one hot ribbon and the water stops reading as
    // water — the glow has to stay a halo, not a wash.
    this.bloom.threshold = 1.05 - k * 0.25;
    this.bloom.strength = 0.10 + k * 0.22;
    this.bloom.radius = 0.42 + k * 0.06;
  }

  setSize(w, h) { this.composer.setSize(w, h); }

  render() { this.composer.render(); }

  dispose() {
    this.composer.renderTarget1.dispose();
    this.composer.renderTarget2.dispose();
    this.bloom.dispose?.();
  }
}
