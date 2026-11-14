import * as THREE from 'three';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { DINO_SPECIES } from './config';
import { DinoAnimActions, DinoAnimState } from './types';

/**
 * 外部 .gltf 擬真 3D 模型路徑映射表（涵蓋全部 12 種恐龍）：
 * - type  1 (暴龍):   ./models/trex.gltf
 * - type  2 (雷龍):   ./models/brachio.gltf
 * - type  3 (三角龍): ./models/triceratops.gltf
 * - type  4 (劍龍):   ./models/stegosaurus.gltf
 * - type  5 (翼手龍): ./models/pteranodon.gltf
 * - type  6 (迅猛龍): ./models/velociraptor.gltf
 * - type  7 (甲龍):   ./models/ankylosaurus.gltf
 * - type  8 (副櫛龍): ./models/parasaurolophus.gltf
 * - type  9 (棘龍):   ./models/spinosaurus.gltf
 * - type 10 (冥河龍): ./models/stygimoloch.gltf
 * - type 11 (滄龍):   ./models/mosasaurus.gltf
 * - type 12 (豐元龍): ./models/fukuiraptor.gltf
 */
export const GLTF_MODEL_PATHS: Record<number, string> = {
  1: './models/trex.gltf',
  2: './models/brachio.gltf',
  3: './models/triceratops.gltf',
  4: './models/stegosaurus.gltf',
  5: './models/pteranodon.gltf',
  6: './models/velociraptor.gltf',
  7: './models/ankylosaurus.gltf',
  8: './models/parasaurolophus.gltf',
  9: './models/spinosaurus.gltf',
  10: './models/stygimoloch.gltf',
  11: './models/mosasaurus.gltf',
  12: './models/fukuiraptor.gltf',
};

export const TARGET_MODEL_EXTENT: Record<number, number> = {
  1: 2.0, // 暴龍
  2: 2.35, // 雷龍
  3: 1.85, // 三角龍
  4: 1.85, // 劍龍
  5: 2.15, // 翼手龍
  6: 1.55, // 迅猛龍
  7: 1.72, // 甲龍
  8: 1.85, // 副櫛龍
  9: 2.2, // 棘龍
  10: 1.48, // 冥河龍
  11: 2.05, // 滄龍
  12: 1.75, // 豐元龍
};

/**
 * 每個品種模型的朝向校準角（確保模型正面對齊 +Z 前進方向）。
 * 若未來替換為面向 -Z 或 +X 的外部 GLTF 模型，僅需調整此偏移角即可消除轉向偏差。
 */
export const MODEL_YAW_OFFSET: Record<number, number> = {
  1: 0,
  2: 0,
  3: 0,
  4: 0,
  5: 0,
  6: 0,
  7: 0,
  8: 0,
  9: 0,
  10: 0,
  11: 0,
  12: 0,
};

const gltfLoader = new GLTFLoader();
const gltfCache = new Map<string, Promise<GLTF>>();

function loadGltfCached(url: string): Promise<GLTF> {
  let pending = gltfCache.get(url);
  if (!pending) {
    pending = new Promise<GLTF>((resolve, reject) => {
      gltfLoader.load(url, resolve, undefined, reject);
    });
    gltfCache.set(url, pending);
  }
  return pending;
}

export interface DinoAnimParts {
  bodyRig: THREE.Group;
  legs: THREE.Object3D[];
  wings: THREE.Object3D[];
  flippers: THREE.Object3D[];
  tailMesh: THREE.Object3D | null;
  headGroup: THREE.Object3D | null;
}

function findMatchingClip(
  clips: THREE.AnimationClip[],
  exactName: string,
  pattern: RegExp
): THREE.AnimationClip | null {
  if (!clips || clips.length === 0) return null;
  const exact = THREE.AnimationClip.findByName(clips, exactName);
  if (exact) return exact;
  return clips.find((c) => pattern.test(c.name)) || null;
}

export function extractDinoAnimationActions(
  mixer: THREE.AnimationMixer,
  clips: THREE.AnimationClip[]
): DinoAnimActions {
  const idleClip =
    findMatchingClip(clips, 'idle', /idle|stand|breath|rest/i) || clips[0] || null;
  const walkClip =
    findMatchingClip(clips, 'walking', /walk|run|move|swim|fly|glide/i) ||
    clips[1] ||
    idleClip;
  const eatClip =
    findMatchingClip(clips, 'eating', /eat|feed|bite|graze|attack/i) ||
    clips[2] ||
    idleClip;

  const makeAction = (clip: THREE.AnimationClip | null): THREE.AnimationAction | null => {
    if (!clip) return null;
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    return action;
  };

  return {
    idle: makeAction(idleClip),
    walking: makeAction(walkClip),
    eating: makeAction(eatClip),
  };
}

export function bindGltfAnimParts(model: THREE.Object3D, animParts: DinoAnimParts): void {
  animParts.legs.length = 0;
  animParts.wings.length = 0;
  animParts.flippers.length = 0;

  ['LegL', 'LegR', 'LegFL', 'LegFR', 'LegBR', 'LegBL'].forEach((name) => {
    const obj = model.getObjectByName(name);
    if (obj) animParts.legs.push(obj);
  });
  ['WingL', 'WingR'].forEach((name) => {
    const obj = model.getObjectByName(name);
    if (obj) animParts.wings.push(obj);
  });
  ['FlipperFL', 'FlipperFR', 'FlipperBL', 'FlipperBR'].forEach((name) => {
    const obj = model.getObjectByName(name);
    if (obj) animParts.flippers.push(obj);
  });
  animParts.tailMesh = model.getObjectByName('Tail') || null;
  animParts.headGroup = model.getObjectByName('Head') || null;
}

export function createDinosaurShell(type: number): {
  rootGroup: THREE.Group;
  bodyRig: THREE.Group;
  animParts: DinoAnimParts;
} {
  const rootGroup = new THREE.Group();
  const bodyRig = new THREE.Group();
  rootGroup.add(bodyRig);

  const animParts: DinoAnimParts = {
    bodyRig,
    legs: [],
    wings: [],
    flippers: [],
    tailMesh: null,
    headGroup: null,
  };

  rootGroup.userData.dinoType = type;
  rootGroup.userData.isGltf = true;
  rootGroup.userData.animState = 'idle' as DinoAnimState;
  rootGroup.userData.animParts = animParts;

  if (type === 5) {
    // 翼手龍：高空盤旋姿態
    rootGroup.userData.isFlying = true;
    bodyRig.position.y = 1.65;
  } else if (type === 11) {
    // 滄龍：水波展區效果
    rootGroup.userData.isAquatic = true;
    bodyRig.position.y = 0.42;
    const waterPad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.95, 1.0, 0.05, 24),
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.55,
        roughness: 0.15,
        metalness: 0.12,
      })
    );
    waterPad.position.y = 0.03;
    waterPad.receiveShadow = true;
    rootGroup.add(waterPad);
  }

  return { rootGroup, bodyRig, animParts };
}

/**
 * 平滑切換恐龍 GLTF 骨骼／關節動畫狀態（idle <-> walking <-> eating）。
 * 採用 Three.js AnimationAction.crossFadeTo 進行權重混成，避免切換瞬間跳動。
 */
export function setDinosaurAnimationState(
  rootGroup: THREE.Group,
  nextState: DinoAnimState,
  fadeDuration = 0.28
): void {
  const prevState = rootGroup.userData.animState as DinoAnimState | undefined;
  rootGroup.userData.animState = nextState;

  const actions = rootGroup.userData.animActions as DinoAnimActions | undefined;
  if (!actions) return;

  const nextAction = actions[nextState] || actions.idle || actions.walking || actions.eating;
  if (!nextAction) return;

  const currentAction = rootGroup.userData.activeAction as THREE.AnimationAction | null;
  if (currentAction === nextAction && prevState === nextState && nextAction.isRunning()) {
    return;
  }

  nextAction.enabled = true;
  nextAction.reset();
  nextAction.setEffectiveTimeScale(1);
  nextAction.setEffectiveWeight(1);
  nextAction.play();

  if (currentAction && currentAction !== nextAction) {
    currentAction.enabled = true;
    currentAction.crossFadeTo(nextAction, fadeDuration, true);
  } else {
    nextAction.fadeIn(fadeDuration);
  }

  rootGroup.userData.activeAction = nextAction;
}

/**
 * ============================================================================
 * 【模組化恐龍工廠函數】createDinosaur(type)
 * ============================================================================
 * 全面使用 Three.js GLTFLoader 載入外部擬真 .gltf 3D 模型，
 * 讀取模型內建骨骼／關節動畫片段（idle、walking、eating）並綁定至 AnimationMixer，
 * 同時將模型軸心與前進朝向精準對齊 +Z 軸。
 * ============================================================================
 */
export function createDinosaur(type: number): THREE.Group {
  const { rootGroup, bodyRig, animParts } = createDinosaurShell(type);
  const gltfUrl = GLTF_MODEL_PATHS[type] || GLTF_MODEL_PATHS[1];

  loadGltfCached(gltfUrl)
    .then((gltf) => {
      const model = SkeletonUtils.clone(gltf.scene);
      model.traverse((node) => {
        if ((node as THREE.Mesh).isMesh) {
          const m = node as THREE.Mesh;
          m.castShadow = true;
          m.receiveShadow = true;
          if ((m as THREE.SkinnedMesh).isSkinnedMesh) {
            m.frustumCulled = false;
          }
        }
      });

      const yawOffset = MODEL_YAW_OFFSET[type] ?? 0;
      const modelWrapper = new THREE.Group();
      model.rotation.y = yawOffset;
      modelWrapper.add(model);

      const box = new THREE.Box3().setFromObject(modelWrapper);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const targetExtent = TARGET_MODEL_EXTENT[type] ?? 1.85;
      const scale = targetExtent / maxDim;

      modelWrapper.scale.setScalar(scale);
      modelWrapper.position.x = -center.x * scale;
      modelWrapper.position.z =
        Math.abs(center.z) > size.z * 0.38 ? -center.z * scale * 0.5 : 0;

      if (type === 5 || type === 11) {
        modelWrapper.position.y = -center.y * scale;
      } else {
        modelWrapper.position.y = -box.min.y * scale;
      }
      bodyRig.add(modelWrapper);

      bindGltfAnimParts(model, animParts);

      if (gltf.animations && gltf.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(model);
        const actions = extractDinoAnimationActions(mixer, gltf.animations);

        rootGroup.userData.mixer = mixer;
        rootGroup.userData.animActions = actions;
        rootGroup.userData.activeAction = null;

        const desiredState = (rootGroup.userData.animState as DinoAnimState) || 'idle';
        setDinosaurAnimationState(rootGroup, desiredState, 0.15);
      }
    })
    .catch((err) => {
      console.error(`GLTFLoader 載入 ${gltfUrl} 失敗 (${DINO_SPECIES[type]?.name || type})：`, err);
    });

  return rootGroup;
}
