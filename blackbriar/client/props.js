// Real 3D props: CC0 models from Poly Haven (see ASSET_CREDITS.md), packed as base64 GLB in assets/props/*.json.
// Each prop becomes a list of { geo, mat } in model space plus its bounding box; world.js merges placed copies into the static scene.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const PROP_IDS = ['SchoolDesk_01', 'SchoolChair_01', 'WetFloorSign_01', 'metal_office_desk', 'steel_frame_shelves_01', 'drawer_cabinet', 'cardboard_box_01',
  'multi_cleaner_bottle', 'bleach_bottle', 'plastic_bottle_gallon', 'korean_fire_extinguisher_01', 'Television_01', 'trashbag', 'lifebuoy', 'life_jacket',
  'security_camera_01', 'fire_alarm', 'street_rat', 'binder_notebook', 'office_notepads', 'power_box_01', 'ladder_sectioned_01', 'dustpan', 'tool_cart'];
export const PROPS = {};

async function parse(url) {
  const j = await (await fetch(url)).json();
  const str = atob(j.glb), buf = new Uint8Array(str.length); for (let i = 0; i < str.length; i++) buf[i] = str.charCodeAt(i);
  // the artifact host's content policy blocks fetch() of blob: URLs, so textures go through <img> instead of ImageBitmap
  const cib = window.createImageBitmap; try { window.createImageBitmap = undefined; } catch (e) { }
  const p = new GLTFLoader().parseAsync(buf.buffer, '');
  try { window.createImageBitmap = cib; } catch (e) { }
  return p;
}
export async function loadProps(onProgress) {
  let done = 0;
  await Promise.all(PROP_IDS.map(async (id) => {
    try {
      const g = await parse(`assets/props/${id}.json`); g.scene.updateMatrixWorld(true);
      const parts = [], box = new THREE.Box3();
      g.scene.traverse(o => {
        if (!o.isMesh) return;
        const geo = o.geometry.clone().applyMatrix4(o.matrixWorld); geo.computeBoundingBox(); box.union(geo.boundingBox);
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        if (mats.length > 1) { for (const gr of geo.groups) { const sub = geo.clone(); sub.setIndex(geo.index ? Array.from(geo.index.array.slice(gr.start, gr.start + gr.count)) : null); parts.push({ geo: sub, mat: mats[gr.materialIndex] }); } }
        else parts.push({ geo, mat: mats[0] });
      });
      for (const p of parts) { const m = p.mat; m.envMapIntensity = 0.6; if (m.map) m.map.anisotropy = 4; if (m.transparent && m.opacity > 0.95) m.transparent = false; }
      PROPS[id] = { parts, box };
    } catch (e) { console.warn('prop failed', id, e); }
    onProgress && onProgress(++done / PROP_IDS.length);
  }));
  return PROPS;
}
