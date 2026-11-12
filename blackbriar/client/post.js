// Post-processing (three.js examples, MIT): bloom on lamps and screens, then a film grade —
// a cool-shadow / warm-light split, vignette, grain, and fear-driven chromatic fringing. Skipped on low quality.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { N8AOPass } from './vendor/N8AO.js';

const Grade = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uDread: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uGrain: { value: 0.045 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uDread, uGrain; uniform vec2 uRes; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5; float r2 = dot(c, c);
      float ca = (0.0015 + uDread * 0.006) * r2 * 4.0;
      vec3 col = vec3(texture2D(tDiffuse, vUv + c * ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - c * ca).b);
      // linear HDR here (tone mapping happens after): cool the shadows, keep lamp light warm, take a little saturation out
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, 0.86 - uDread * 0.25);
      col *= mix(vec3(0.86, 0.95, 1.1), vec3(1.04, 1.0, 0.94), smoothstep(0.0, 0.35, l));
      col *= 1.0 - smoothstep(0.18, 0.75, r2 * (1.25 + uDread * 0.9)) * 0.75;
      float g = h(vUv * uRes + fract(uTime * 7.31) * 91.7) - 0.5;
      col += g * uGrain * (0.25 + sqrt(max(l, 0.0)) * 0.6);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export function makePost(renderer, scene, camera, quality) {
  if (quality < 1) return null;
  const size = renderer.getSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: quality >= 2 ? 2 : 0 });
  const composer = new EffectComposer(renderer, rt);
  let ao = null;
  if (quality >= 2) { // screen-space ambient occlusion: contact shadows in corners, under desks, behind lockers
    try { ao = new N8AOPass(scene, camera, size.x, size.y); Object.assign(ao.configuration, { aoRadius: 1.1, distanceFalloff: 0.9, intensity: 2.4, halfRes: true, depthAwareUpsampling: true, gammaCorrection: false }); ao.setQualityMode('Low'); composer.addPass(ao); }
    catch (e) { console.warn('AO unavailable', e); ao = null; }
  }
  if (!ao) composer.addPass(new RenderPass(scene, camera));
  const bloom = quality >= 2 ? new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.28, 0.4, 2.2) : null; if (bloom) composer.addPass(bloom);
  const grade = new ShaderPass(Grade); composer.addPass(grade);
  composer.addPass(new OutputPass());
  return {
    composer, grade, bloom, ao,
    setSize(w, h, pr) { composer.setPixelRatio(pr); composer.setSize(w, h); grade.uniforms.uRes.value.set(w * pr, h * pr); },
    render(t, dread) { grade.uniforms.uTime.value = t; grade.uniforms.uDread.value = dread; composer.render(); },
  };
}
