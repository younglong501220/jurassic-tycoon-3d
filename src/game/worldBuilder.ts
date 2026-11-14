import * as THREE from 'three';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  CELL_SIZE,
  DEFAULT_PARK_NAME,
  DEFAULT_TICKET_PRICE,
  ENTRANCE_CELLS,
  GRID_SIZE,
} from './config';

export function gridToWorld(gx: number, gz: number): THREE.Vector3 {
  const half = (GRID_SIZE * CELL_SIZE) / 2;
  return new THREE.Vector3(
    gx * CELL_SIZE - half + CELL_SIZE / 2,
    0,
    gz * CELL_SIZE - half + CELL_SIZE / 2
  );
}

export function worldToGrid(wx: number, wz: number): { gx: number; gz: number } | null {
  const half = (GRID_SIZE * CELL_SIZE) / 2;
  const gx = Math.floor((wx + half) / CELL_SIZE);
  const gz = Math.floor((wz + half) / CELL_SIZE);
  if (gx < 0 || gx >= GRID_SIZE || gz < 0 || gz >= GRID_SIZE) return null;
  return { gx, gz };
}

export function isEntranceCell(gx: number, gz: number): boolean {
  return ENTRANCE_CELLS.some((c) => c.gx === gx && c.gz === gz);
}

// ============================================================================
// Real 3D Botanical Tree Assets (.gltf loaded via GLTFLoader)
// ============================================================================
const TREE_MODEL_PATHS: Record<number, string> = {
  0: './models/tree_palm.gltf',   // 熱帶椰子棕櫚樹
  1: './models/tree_pine.gltf',   // 史前南洋杉松
  2: './models/tree_banyan.gltf', // 熱帶闊葉榕樹
  3: './models/tree_cycad.gltf',  // 侏羅紀蘇鐵
  4: './models/tree_acacia.gltf', // 稀樹金合歡
};

const treeLoader = new GLTFLoader();
const treeCache = new Map<string, Promise<GLTF>>();

function loadTreeGltf(url: string): Promise<GLTF> {
  let pending = treeCache.get(url);
  if (!pending) {
    pending = new Promise<GLTF>((resolve, reject) => {
      treeLoader.load(url, resolve, undefined, reject);
    });
    treeCache.set(url, pending);
  }
  return pending;
}

function createTreeAssetInstance(species: number, scale: number): THREE.Group {
  const anchor = new THREE.Group();
  anchor.scale.setScalar(scale);
  anchor.rotation.y = Math.random() * Math.PI * 2;

  const url = TREE_MODEL_PATHS[species] || TREE_MODEL_PATHS[0];
  loadTreeGltf(url)
    .then((gltf) => {
      const model = gltf.scene.clone(true);
      model.traverse((node) => {
        if ((node as THREE.Mesh).isMesh) {
          const mesh = node as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
      anchor.add(model);
    })
    .catch((err) => {
      console.error(`樹木 3D Asset 載入失敗 (${url})：`, err);
    });

  return anchor;
}

export interface GateSignageHandle {
  gateGroup: THREE.Group;
  updateSignage: (parkName: string, ticketPrice: number) => void;
  dispose: () => void;
}

export interface WorldBuildResult {
  grassTileMeshes: THREE.Mesh[];
  oceanMesh: THREE.Mesh;
  treeAnchors: THREE.Group[];
  gateSignage: GateSignageHandle;
}

function createGateBannerCanvas(): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  draw: (parkName: string, ticketPrice: number) => void;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  const draw = (parkName: string, ticketPrice: number) => {
    const cleanName = (parkName || DEFAULT_PARK_NAME).trim() || DEFAULT_PARK_NAME;

    // Deep mahogany / obsidian plaque backdrop
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, '#291509');
    grad.addColorStop(0.5, '#1c1008');
    grad.addColorStop(1, '#120a04');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Warm amber outer & inner frames
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 10;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

    ctx.strokeStyle = 'rgba(253, 224, 71, 0.55)';
    ctx.lineWidth = 3;
    ctx.strokeRect(24, 24, canvas.width - 48, canvas.height - 48);

    // Corner brass rivets
    ctx.fillStyle = '#fbbf24';
    [
      [36, 36],
      [canvas.width - 36, 36],
      [36, canvas.height - 36],
      [canvas.width - 36, canvas.height - 36],
    ].forEach(([rx, ry]) => {
      ctx.beginPath();
      ctx.arc(rx, ry, 7, 0, Math.PI * 2);
      ctx.fill();
    });

    // Gate Name (auto-fit font size)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let fontSize = 86;
    const maxWidth = canvas.width - 120;
    while (fontSize > 38) {
      ctx.font = `900 ${fontSize}px "PingFang TC", "Microsoft JhengHei", "Noto Sans TC", sans-serif`;
      if (ctx.measureText(cleanName).width <= maxWidth) break;
      fontSize -= 4;
    }

    ctx.shadowColor = 'rgba(245, 158, 11, 0.55)';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#fef3c7';
    ctx.fillText(cleanName, canvas.width / 2, 106);
    ctx.shadowBlur = 0;

    // Divider line
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.45)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(150, 166);
    ctx.lineTo(canvas.width - 150, 166);
    ctx.stroke();

    // Ticket price subtitle
    ctx.font = `700 34px "PingFang TC", "Microsoft JhengHei", "Noto Sans TC", sans-serif`;
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(`★ WELCOME · 入園門票 $${ticketPrice} ★`, canvas.width / 2, 204);
  };

  return { canvas, ctx, draw };
}

function createBoothPriceCanvas(): {
  canvas: HTMLCanvasElement;
  draw: (ticketPrice: number) => void;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const draw = (ticketPrice: number) => {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 6;
    ctx.strokeRect(6, 6, canvas.width - 12, canvas.height - 12);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 28px "PingFang TC", "Microsoft JhengHei", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('入園門票 TICKETS', canvas.width / 2, 38);

    ctx.font = '900 50px "JetBrains Mono", monospace';
    ctx.fillStyle = '#fde047';
    ctx.fillText(`$${ticketPrice}`, canvas.width / 2, 88);
  };

  return { canvas, draw };
}

export function buildWorldEnvironment(
  scene: THREE.Scene,
  maxAnisotropy = 4
): WorldBuildResult {
  const environmentGroup = new THREE.Group();
  scene.add(environmentGroup);
  const grassTileMeshes: THREE.Mesh[] = [];
  const treeAnchors: THREE.Group[] = [];
  const totalSize = GRID_SIZE * CELL_SIZE;

  // 外圍岩石與沙灘島嶼基座，使戶外島嶼自然延伸至海面
  const cliffMesh = new THREE.Mesh(
    new THREE.BoxGeometry(totalSize + 6.5, 2.0, totalSize + 6.5),
    new THREE.MeshStandardMaterial({ color: 0x57534e, roughness: 0.95 })
  );
  cliffMesh.position.y = -1.05;
  cliffMesh.receiveShadow = true;
  environmentGroup.add(cliffMesh);

  const beachMesh = new THREE.Mesh(
    new THREE.BoxGeometry(totalSize + 11.5, 0.55, totalSize + 11.5),
    new THREE.MeshStandardMaterial({ color: 0xd6b57c, roughness: 0.9 })
  );
  beachMesh.position.y = -1.78;
  beachMesh.receiveShadow = true;
  environmentGroup.add(beachMesh);

  // 周邊 5 種真實風格 3D 樹木 Asset 分佈（透過 GLTFLoader 載入）
  const treePlacements: { x: number; z: number; species: number; scale: number }[] = [
    { x: -18.2, z: -17.5, species: 0, scale: 1.05 },
    { x: -18.6, z: -11.5, species: 1, scale: 1.0 },
    { x: -18.5, z: -5.5, species: 2, scale: 0.95 },
    { x: -18.3, z: 1.2, species: 3, scale: 1.1 },
    { x: -18.2, z: 7.4, species: 0, scale: 0.92 },
    { x: -18.4, z: 13.0, species: 4, scale: 1.02 },
    { x: -17.8, z: 17.6, species: 1, scale: 1.08 },

    { x: 18.2, z: -17.5, species: 2, scale: 1.02 },
    { x: 18.5, z: -11.0, species: 0, scale: 1.06 },
    { x: 18.5, z: -4.8, species: 4, scale: 0.96 },
    { x: 18.3, z: 2.0, species: 1, scale: 1.12 },
    { x: 18.2, z: 8.2, species: 3, scale: 1.05 },
    { x: 18.4, z: 13.8, species: 0, scale: 0.95 },
    { x: 17.8, z: 17.6, species: 2, scale: 1.0 },

    { x: -13.5, z: -18.2, species: 1, scale: 1.08 },
    { x: -7.5, z: -18.4, species: 4, scale: 0.98 },
    { x: -1.5, z: -18.3, species: 2, scale: 1.05 },
    { x: 5.0, z: -18.4, species: 0, scale: 1.0 },
    { x: 11.2, z: -18.2, species: 3, scale: 1.12 },
    { x: 15.2, z: -18.0, species: 1, scale: 0.95 },

    { x: -12.5, z: 18.2, species: 0, scale: 0.96 },
    { x: -6.2, z: 18.0, species: 3, scale: 1.08 },
    { x: 6.2, z: 18.0, species: 3, scale: 1.08 },
    { x: 12.5, z: 18.2, species: 4, scale: 0.98 },
  ];

  treePlacements.forEach((tp) => {
    const tree = createTreeAssetInstance(tp.species, tp.scale);
    tree.position.set(tp.x, -0.05, tp.z);
    environmentGroup.add(tree);
    treeAnchors.push(tree);
  });

  // 海岸自然多面體礁石
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.9 });
  [
    [-19.8, -12], [19.6, 2], [-6, -19.5], [15, -19.2], [-15, 19.2], [16, 19.2], [-20.2, 8], [20.1, -9],
  ].forEach(([rx, rz], i) => {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.95 + (i % 3) * 0.25, 0), rockMat);
    rock.position.set(rx, -1.25, rz);
    rock.scale.set(1.3, 0.72, 1.1);
    rock.rotation.set(i * 0.3, i * 0.85, i * 0.2);
    rock.castShadow = true;
    rock.receiveShadow = true;
    environmentGroup.add(rock);
  });

  // 動態波浪海洋水面（細分網格供即時水波起伏）
  const oceanGeo = new THREE.PlaneGeometry(240, 240, 44, 44);
  const oceanMesh = new THREE.Mesh(
    oceanGeo,
    new THREE.MeshStandardMaterial({
      color: 0x0284c7,
      roughness: 0.16,
      metalness: 0.24,
      flatShading: false,
    })
  );
  oceanMesh.rotation.x = -Math.PI / 2;
  oceanMesh.position.y = -1.92;
  oceanMesh.receiveShadow = true;
  environmentGroup.add(oceanMesh);

  // 16 x 16 草地網格
  const tileGeo = new THREE.BoxGeometry(CELL_SIZE - 0.04, 0.2, CELL_SIZE - 0.04);
  const grassLightMat = new THREE.MeshStandardMaterial({ color: 0x65a30d, roughness: 0.85 });
  const grassDarkMat = new THREE.MeshStandardMaterial({ color: 0x4d7c0f, roughness: 0.85 });
  const roadMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.88 });

  for (let gx = 0; gx < GRID_SIZE; gx++) {
    for (let gz = 0; gz < GRID_SIZE; gz++) {
      const isRoad = isEntranceCell(gx, gz);
      const mat = isRoad ? roadMat : (gx + gz) % 2 === 0 ? grassLightMat : grassDarkMat;
      const tile = new THREE.Mesh(tileGeo, mat);
      const pos = gridToWorld(gx, gz);
      tile.position.set(pos.x, -0.1, pos.z);
      tile.receiveShadow = true;
      tile.userData = { gx, gz, isGrassTile: true };
      environmentGroup.add(tile);
      grassTileMeshes.push(tile);
    }
  }

  // 網格線
  const gridHelper = new THREE.GridHelper(totalSize, GRID_SIZE, 0x1e293b, 0x365314);
  gridHelper.position.y = 0.015;
  const gridMats = Array.isArray(gridHelper.material) ? gridHelper.material : [gridHelper.material];
  gridMats.forEach((m) => {
    m.opacity = 0.22;
    m.transparent = true;
  });
  environmentGroup.add(gridHelper);

  // 南側侏羅紀大門（含可自訂大門名稱招牌與門票售票亭）
  const gateGroup = new THREE.Group();
  const pillarMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.65, metalness: 0.2 });
  const plinthMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.78, metalness: 0.12 });
  const amberMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    emissive: 0xb45309,
    emissiveIntensity: 0.55,
  });
  const signMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.65 });
  const trimGoldMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.35,
    metalness: 0.65,
  });

  // 石柱與基座
  [-2.45, 2.45].forEach((px) => {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.55, 1.25), plinthMat);
    plinth.position.set(px, 0.275, 16.5);
    plinth.castShadow = true;
    plinth.receiveShadow = true;
    gateGroup.add(plinth);

    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.95, 3.9, 0.95), pillarMat);
    pillar.position.set(px, 1.95, 16.5);
    pillar.castShadow = true;
    gateGroup.add(pillar);

    const torch = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.48, 10), amberMat);
    torch.position.set(px, 4.18, 16.5);
    gateGroup.add(torch);
  });

  // 上方主橫樑
  const topBeam = new THREE.Mesh(new THREE.BoxGeometry(6.3, 0.95, 1.05), signMat);
  topBeam.position.set(0, 3.88, 16.5);
  topBeam.castShadow = true;
  gateGroup.add(topBeam);

  // 金屬邊框與雙面大門名稱招牌
  const signFrame = new THREE.Mesh(new THREE.BoxGeometry(5.6, 1.4, 1.16), trimGoldMat);
  signFrame.position.set(0, 4.18, 16.5);
  signFrame.castShadow = true;
  gateGroup.add(signFrame);

  const gateBanner = createGateBannerCanvas();
  gateBanner.draw(DEFAULT_PARK_NAME, DEFAULT_TICKET_PRICE);
  const bannerTex = new THREE.CanvasTexture(gateBanner.canvas);
  bannerTex.colorSpace = THREE.SRGBColorSpace;
  bannerTex.anisotropy = Math.max(1, maxAnisotropy);

  const bannerMat = new THREE.MeshStandardMaterial({
    map: bannerTex,
    emissive: 0xffffff,
    emissiveMap: bannerTex,
    emissiveIntensity: 0.26,
    roughness: 0.4,
    metalness: 0.1,
  });

  const frontPlaque = new THREE.Mesh(new THREE.PlaneGeometry(5.32, 1.26), bannerMat);
  frontPlaque.position.set(0, 4.18, 16.5 + 0.59);
  gateGroup.add(frontPlaque);

  const backPlaque = new THREE.Mesh(new THREE.PlaneGeometry(5.32, 1.26), bannerMat);
  backPlaque.position.set(0, 4.18, 16.5 - 0.59);
  backPlaque.rotation.y = Math.PI;
  gateGroup.add(backPlaque);

  // 門側售票亭（Ticket Booth）與即時門票看板
  const boothGroup = new THREE.Group();
  boothGroup.position.set(3.55, 0, 16.5);

  const boothBase = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.95, 1.15), plinthMat);
  boothBase.position.y = 0.475;
  boothBase.castShadow = true;
  boothBase.receiveShadow = true;
  boothGroup.add(boothBase);

  const boothGlass = new THREE.Mesh(
    new THREE.BoxGeometry(0.98, 0.85, 0.98),
    new THREE.MeshStandardMaterial({
      color: 0xbae6fd,
      roughness: 0.15,
      metalness: 0.2,
      transparent: true,
      opacity: 0.72,
    })
  );
  boothGlass.position.y = 1.35;
  boothGroup.add(boothGlass);

  const boothRoof = new THREE.Mesh(new THREE.ConeGeometry(0.95, 0.55, 4), trimGoldMat);
  boothRoof.position.y = 2.04;
  boothRoof.rotation.y = Math.PI / 4;
  boothRoof.castShadow = true;
  boothGroup.add(boothRoof);

  const boothBoard = createBoothPriceCanvas();
  boothBoard.draw(DEFAULT_TICKET_PRICE);
  const boothTex = new THREE.CanvasTexture(boothBoard.canvas);
  boothTex.colorSpace = THREE.SRGBColorSpace;
  boothTex.anisotropy = Math.max(1, maxAnisotropy);

  const boothSignMat = new THREE.MeshStandardMaterial({
    map: boothTex,
    emissive: 0xffffff,
    emissiveMap: boothTex,
    emissiveIntensity: 0.28,
    roughness: 0.35,
  });
  const boothPriceFront = new THREE.Mesh(new THREE.PlaneGeometry(0.92, 0.46), boothSignMat);
  boothPriceFront.position.set(0, 0.62, 0.585);
  boothGroup.add(boothPriceFront);

  gateGroup.add(boothGroup);

  const apron = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.18, 2.6), roadMat);
  apron.position.set(0, -0.09, 17.3);
  apron.receiveShadow = true;
  gateGroup.add(apron);

  gateGroup.traverse((child) => {
    child.userData.isMainGate = true;
  });

  environmentGroup.add(gateGroup);

  const gateSignage: GateSignageHandle = {
    gateGroup,
    updateSignage: (parkName: string, ticketPrice: number) => {
      gateBanner.draw(parkName, ticketPrice);
      bannerTex.needsUpdate = true;
      boothBoard.draw(ticketPrice);
      boothTex.needsUpdate = true;
    },
    dispose: () => {
      bannerTex.dispose();
      boothTex.dispose();
      bannerMat.dispose();
      boothSignMat.dispose();
    },
  };

  return { grassTileMeshes, oceanMesh, treeAnchors, gateSignage };
}
