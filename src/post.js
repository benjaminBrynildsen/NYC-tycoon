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
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
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

    // Ambient occlusion, before bloom so the glow spills from an image that
    // already has its corners in it. Radius is in metres, like everything
    // else here: four metres is a kerb, a doorway, the gap between a tower
    // and its neighbour — the scale at which a city actually reads as solid.
    if (quality.ao) {
      this.ao = new GTAOPass(scene, camera, size.width, size.height, undefined,
        { screenSpaceRadius: true, radius: 0.4, distanceExponent: 1.0,
          thickness: 30, scale: 2.5, samples: quality.aoSamples ?? 16 },
        { lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, rings: 2, samples: 16 });
      this.ao.blendIntensity = 1.0;

      // Clouds and the sky are drawn into the same depth buffer the AO reads,
      // and a cloud that occludes a tower 400m below it is not a corner — it
      // is a halo. Keep them out of the pass entirely.
      const base = this.ao.overrideVisibility.bind(this.ao);
      this.ao.overrideVisibility = () => {
        base();                                  // caches visibility first
        scene.traverse((o) => { if (o.userData.noAO) o.visible = false; });
      };
      this.composer.addPass(this.ao);
    }

    if (quality.bloom) this._addBloom(size, quality);
    this.composer.addPass(new OutputPass());

    this.setNight(0);
  }

  _addBloom(size, quality) {
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.width, size.height), 0.5, 0.62, 1.0);
    // A phone blurs at half resolution; nobody can tell, and it costs a quarter.
    const scale = quality.bloomScale ?? 1;
    if (scale !== 1) {
      const base = this.bloom.setSize.bind(this.bloom);
      this.bloom.setSize = (w, h) =>
        base(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
    }
    this.composer.addPass(this.bloom);
  }

  /**
   * 0 is noon, 1 is the middle of the night. By day the threshold sits above
   * white so only a hot specular highlight blooms; after dark it drops under
   * the lit windows and the whole grid starts to glow.
   */
  setNight(n) {
    if (!this.bloom) return;
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
    this.bloom?.dispose?.();
    this.ao?.dispose?.();
  }
}
