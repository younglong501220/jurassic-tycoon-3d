import * as THREE from 'three';
import { CELL_SIZE, GRID_SIZE, STAFF_CONFIGS } from './config';
import { FacilityKey, GridCellObject, StaffRole } from './types';

function boxPart(
  w: number,
  h: number,
  d: number,
  color: number,
  x: number,
  y: number,
  z: number,
  roughness = 0.65,
  metalness = 0.08,
  emissive = 0x000000,
  emissiveIntensity = 0
): THREE.Mesh {
  const geo = new THREE.BoxGeometry(w, h, d);
  const mat = new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    emissive,
    emissiveIntensity,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function cylPart(
  rTop: number,
  rBot: number,
  h: number,
  color: number,
  x: number,
  y: number,
  z: number,
  roughness = 0.65,
  metalness = 0.08,
  radialSegs = 12
): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(rTop, rBot, h, radialSegs);
  const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function spherePart(
  r: number,
  color: number,
  x: number,
  y: number,
  z: number,
  sx = 1,
  sy = 1,
  sz = 1,
  roughness = 0.6,
  metalness = 0.05
): THREE.Mesh {
  const geo = new THREE.SphereGeometry(r, 14, 10);
  const mat = new THREE.MeshStandardMaterial({ color, roughness, metalness });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export function createFenceMesh(tier: 1 | 2 | 3 = 1): THREE.Group {
  const group = new THREE.Group();

  const postColor = tier === 3 ? 0x1e293b : tier === 2 ? 0x334155 : 0x64748b;
  const collarColor = tier === 3 ? 0xd97706 : tier === 2 ? 0x0f172a : 0x334155;
  const capColor = tier === 3 ? 0xfacc15 : tier === 2 ? 0x22d3ee : 0x38bdf8;
  const capEmissive = tier === 3 ? 0xeab308 : tier === 2 ? 0x06b6d4 : 0x0284c7;
  const height = tier === 3 ? 1.85 : tier === 2 ? 1.68 : 1.5;

  const post = boxPart(0.38, height, 0.38, postColor, 0, height / 2, 0, 0.35, 0.65);
  group.add(post);

  const baseCollar = boxPart(0.5, 0.18, 0.5, collarColor, 0, 0.09, 0, 0.6, 0.35);
  group.add(baseCollar);

  if (tier >= 2) {
    // 中段強化金屬環箍
    const ring = boxPart(0.46, 0.12, 0.46, tier === 3 ? 0xf59e0b : 0x38bdf8, 0, height * 0.52, 0, 0.3, 0.7);
    group.add(ring);
  }

  const cap = boxPart(0.44, 0.18, 0.44, capColor, 0, height + 0.06, 0, 0.2, 0.25, capEmissive, tier === 3 ? 0.95 : 0.75);
  cap.castShadow = false;
  group.add(cap);

  const connectors = new THREE.Group();
  group.add(connectors);
  group.userData.connectors = connectors;
  group.userData.fenceTier = tier;
  return group;
}

export function refreshFenceAndNeighbors(
  grid: (GridCellObject | null)[][],
  gx: number,
  gz: number,
  fenceTier: 1 | 2 | 3 = 1
): void {
  const coords = [
    [gx, gz],
    [gx + 1, gz],
    [gx - 1, gz],
    [gx, gz + 1],
    [gx, gz - 1],
  ];

  const railMat = new THREE.MeshStandardMaterial({
    color: fenceTier === 3 ? 0xfbbf24 : fenceTier === 2 ? 0x64748b : 0x94a3b8,
    metalness: 0.72,
    roughness: 0.28,
  });
  const wireMat = new THREE.MeshStandardMaterial({
    color: fenceTier === 3 ? 0x38bdf8 : fenceTier === 2 ? 0x22d3ee : 0xfacc15,
    emissive: fenceTier === 3 ? 0x0ea5e9 : fenceTier === 2 ? 0x06b6d4 : 0xeab308,
    emissiveIntensity: fenceTier === 3 ? 0.9 : fenceTier === 2 ? 0.7 : 0.5,
    roughness: 0.25,
  });

  for (const [cx, cz] of coords) {
    if (cx < 0 || cx >= GRID_SIZE || cz < 0 || cz >= GRID_SIZE) continue;
    const cell = grid[cx][cz];
    if (!cell || cell.type !== 'fence') continue;

    const connectors = cell.mesh.userData.connectors as THREE.Group;
    while (connectors.children.length > 0) {
      connectors.remove(connectors.children[0]);
    }

    const dirs = [
      { dx: 1, dz: 0, rotY: 0, offsetX: CELL_SIZE / 4, offsetZ: 0 },
      { dx: -1, dz: 0, rotY: 0, offsetX: -CELL_SIZE / 4, offsetZ: 0 },
      { dx: 0, dz: 1, rotY: Math.PI / 2, offsetX: 0, offsetZ: CELL_SIZE / 4 },
      { dx: 0, dz: -1, rotY: Math.PI / 2, offsetX: 0, offsetZ: -CELL_SIZE / 4 },
    ];

    let hasNeighbor = false;
    for (const d of dirs) {
      const nx = cx + d.dx;
      const nz = cz + d.dz;
      const neighbor = nx >= 0 && nx < GRID_SIZE && nz >= 0 && nz < GRID_SIZE ? grid[nx][nz] : null;
      if (neighbor && neighbor.type === 'fence') {
        hasNeighbor = true;
        const bar1 = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE / 2, 0.1, 0.1), railMat);
        bar1.position.set(d.offsetX, fenceTier === 3 ? 1.55 : 1.28, d.offsetZ);
        bar1.rotation.y = d.rotY;
        bar1.castShadow = true;

        const bar2 = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE / 2, 0.08, 0.08), wireMat);
        bar2.position.set(d.offsetX, fenceTier === 3 ? 1.15 : 0.88, d.offsetZ);
        bar2.rotation.y = d.rotY;

        const bar3 = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE / 2, 0.1, 0.1), railMat);
        bar3.position.set(d.offsetX, 0.45, d.offsetZ);
        bar3.rotation.y = d.rotY;
        bar3.castShadow = true;

        connectors.add(bar1, bar2, bar3);

        if (fenceTier >= 2) {
          const extraWire = new THREE.Mesh(new THREE.BoxGeometry(CELL_SIZE / 2, 0.07, 0.07), wireMat);
          extraWire.position.set(d.offsetX, fenceTier === 3 ? 0.78 : 1.48, d.offsetZ);
          extraWire.rotation.y = d.rotY;
          connectors.add(extraWire);
        }
        if (fenceTier === 3) {
          const forceMat = new THREE.MeshBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity: 0.24,
            side: THREE.DoubleSide,
          });
          const shield = new THREE.Mesh(new THREE.PlaneGeometry(CELL_SIZE / 2, 1.15), forceMat);
          shield.position.set(d.offsetX, 1.0, d.offsetZ);
          shield.rotation.y = d.rotY;
          connectors.add(shield);
        }
      }
    }

    if (!hasNeighbor) {
      const wing = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.12, 0.12), railMat);
      wing.position.y = fenceTier === 3 ? 1.25 : 1.0;
      wing.castShadow = true;
      const wire = new THREE.Mesh(new THREE.BoxGeometry(1.35, 0.07, 0.07), wireMat);
      wire.position.y = 0.65;
      connectors.add(wing, wire);
    }
  }
}

// ============================================================================
// Realistic Human Character Builder (Anatomical Proportions, Face, Hair, Limbs)
// ============================================================================
const SKIN_TONES = [0xfde2c8, 0xf1c27d, 0xe0ac69, 0xc68642, 0x9c6137];
const HAIR_COLORS = [0x1c1917, 0x3b2314, 0x6b3e1b, 0x92400e, 0x27272a];
const VISITOR_COLORS = [0xef4444, 0xf97316, 0xec4899, 0x8b5cf6, 0x06b6d4, 0xeab308, 0x10b981];
const PANTS_COLORS = [0x1e293b, 0x334155, 0x1e3a8a, 0x475569, 0x44403c];

interface HumanAppearance {
  skinColor: number;
  hairColor: number;
  shirtColor: number;
  pantsColor: number;
  shoeColor: number;
  hairStyle: 'short' | 'bob' | 'bun' | 'cap';
  scale?: number;
}

function createRealisticHuman(opts: HumanAppearance): {
  group: THREE.Group;
  headGroup: THREE.Group;
  torsoGroup: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
} {
  const group = new THREE.Group();
  const s = opts.scale ?? 1.0;

  // Articulated Left & Right Legs (hips at y = 0.54)
  const makeLeg = (xPos: number) => {
    const leg = new THREE.Group();
    leg.position.set(xPos, 0.54, 0);
    // Thigh + calf
    leg.add(cylPart(0.068, 0.058, 0.25, opts.pantsColor, 0, -0.12, 0, 0.78, 0.04, 10));
    leg.add(cylPart(0.056, 0.044, 0.24, opts.pantsColor, 0, -0.36, 0, 0.78, 0.04, 10));
    // Sculpted sneaker/shoe
    leg.add(spherePart(0.054, opts.shoeColor, 0, -0.5, 0.025, 0.92, 0.65, 1.45, 0.6, 0.1));
    return leg;
  };
  const legL = makeLeg(-0.075);
  const legR = makeLeg(0.075);
  group.add(legL, legR);

  // Pelvis & Torso
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, 0.54, 0);
  group.add(torsoGroup);

  torsoGroup.add(spherePart(0.125, opts.pantsColor, 0, 0.02, 0, 1.15, 0.65, 0.82, 0.78, 0.04));
  // Belt
  torsoGroup.add(cylPart(0.135, 0.135, 0.04, 0x1c1917, 0, 0.07, 0, 0.5, 0.2, 12));
  // Tapered chest & waist
  torsoGroup.add(cylPart(0.148, 0.128, 0.36, opts.shirtColor, 0, 0.26, 0, 0.7, 0.05, 14));
  // Rounded shoulders
  torsoGroup.add(spherePart(0.062, opts.shirtColor, -0.155, 0.4, 0, 1.0, 0.9, 0.95));
  torsoGroup.add(spherePart(0.062, opts.shirtColor, 0.155, 0.4, 0, 1.0, 0.9, 0.95));
  // Collar & Neck
  torsoGroup.add(cylPart(0.055, 0.068, 0.05, opts.shirtColor, 0, 0.45, 0, 0.65, 0.05, 10));
  torsoGroup.add(cylPart(0.044, 0.048, 0.09, opts.skinColor, 0, 0.5, 0, 0.62, 0.02, 10));

  // Articulated Left & Right Arms (shoulder pivot at y = 0.94)
  const makeArm = (xPos: number) => {
    const arm = new THREE.Group();
    arm.position.set(xPos, 0.4, 0); // relative to torsoGroup
    // Sleeve + forearm + hand
    arm.add(cylPart(0.046, 0.042, 0.16, opts.shirtColor, 0, -0.07, 0, 0.7, 0.05, 10));
    arm.add(cylPart(0.038, 0.032, 0.21, opts.skinColor, 0, -0.24, 0, 0.62, 0.02, 10));
    arm.add(spherePart(0.036, opts.skinColor, 0, -0.36, 0.01, 0.85, 1.1, 0.75, 0.6, 0.02));
    return arm;
  };
  const armL = makeArm(-0.185);
  const armR = makeArm(0.185);
  torsoGroup.add(armL, armR);

  // Sculpted Realistic Head & Face
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.64, 0); // relative to torsoGroup -> y = 1.18
  torsoGroup.add(headGroup);

  // Cranium & Jawline
  headGroup.add(spherePart(0.118, opts.skinColor, 0, 0.02, 0, 0.92, 1.08, 0.96, 0.62, 0.02));
  // Ears
  headGroup.add(spherePart(0.024, opts.skinColor, -0.11, 0.01, -0.01, 0.5, 1.15, 0.8));
  headGroup.add(spherePart(0.024, opts.skinColor, 0.11, 0.01, -0.01, 0.5, 1.15, 0.8));
  // Subtle Nose
  headGroup.add(spherePart(0.019, opts.skinColor, 0, 0.005, 0.112, 0.75, 1.25, 1.1));
  // Realistic Eyes (white sclera + dark iris)
  [-0.04, 0.04].forEach((ex) => {
    headGroup.add(spherePart(0.016, 0xf8fafc, ex, 0.035, 0.1, 1.1, 0.75, 0.5, 0.3, 0.05));
    headGroup.add(spherePart(0.01, 0x1e293b, ex, 0.035, 0.107, 1.0, 1.0, 0.6, 0.15, 0.2));
    // Eyebrow
    headGroup.add(boxPart(0.032, 0.009, 0.01, opts.hairColor, ex, 0.058, 0.105, 0.8, 0.02));
  });
  // Subtle Mouth
  headGroup.add(boxPart(0.036, 0.008, 0.01, 0xb91c1c, 0, -0.042, 0.105, 0.6, 0.02));

  // Hair Styles
  headGroup.add(spherePart(0.122, opts.hairColor, 0, 0.055, -0.018, 0.96, 0.92, 0.98, 0.78, 0.04));
  if (opts.hairStyle === 'bob') {
    headGroup.add(cylPart(0.11, 0.125, 0.13, opts.hairColor, 0, -0.02, -0.025, 0.78, 0.04, 12));
  } else if (opts.hairStyle === 'bun') {
    headGroup.add(spherePart(0.052, opts.hairColor, 0, 0.12, -0.09, 1, 1, 1, 0.78, 0.04));
  } else if (opts.hairStyle === 'cap') {
    // Casual sun cap
    headGroup.add(spherePart(0.125, opts.shirtColor, 0, 0.075, -0.005, 0.98, 0.65, 1.02, 0.6, 0.05));
    headGroup.add(cylPart(0.11, 0.12, 0.015, opts.shirtColor, 0, 0.05, 0.085, 0.6, 0.05, 10));
  }

  group.scale.setScalar(s);
  group.userData.legs = [legL, legR];
  group.userData.arms = [armL, armR];
  return { group, headGroup, torsoGroup, armL, armR, legL, legR };
}

export function createVisitorMesh(): THREE.Group {
  const styles: HumanAppearance['hairStyle'][] = ['short', 'bob', 'bun', 'cap'];
  const { group } = createRealisticHuman({
    skinColor: SKIN_TONES[Math.floor(Math.random() * SKIN_TONES.length)],
    hairColor: HAIR_COLORS[Math.floor(Math.random() * HAIR_COLORS.length)],
    shirtColor: VISITOR_COLORS[Math.floor(Math.random() * VISITOR_COLORS.length)],
    pantsColor: PANTS_COLORS[Math.floor(Math.random() * PANTS_COLORS.length)],
    shoeColor: 0xf8fafc,
    hairStyle: styles[Math.floor(Math.random() * styles.length)],
    scale: 0.94 + Math.random() * 0.1,
  });
  return group;
}

export function createStaffMesh(role: StaffRole): THREE.Group {
  const cfg = STAFF_CONFIGS[role];
  const { group, headGroup, armL, armR, torsoGroup } = createRealisticHuman({
    skinColor: SKIN_TONES[role === 'cleaner' ? 1 : role === 'keeper' ? 2 : 0],
    hairColor: HAIR_COLORS[role === 'security' ? 0 : 1],
    shirtColor: cfg.shirtColor,
    pantsColor: role === 'security' ? 0x0f172a : 0x334155,
    shoeColor: 0x0f172a,
    hairStyle: 'short',
    scale: 1.03,
  });

  if (role === 'cleaner') {
    // High-vis vest stripe + cap + realistic cylindrical broom
    torsoGroup.add(boxPart(0.28, 0.05, 0.24, 0xfacc15, 0, 0.24, 0, 0.35, 0.2));
    headGroup.add(spherePart(0.126, 0x059669, 0, 0.08, 0, 1.0, 0.62, 1.04));
    headGroup.add(boxPart(0.16, 0.015, 0.1, 0x059669, 0, 0.06, 0.12));
    // Broom held in right hand
    const handle = cylPart(0.018, 0.018, 0.82, 0x92400e, 0.04, -0.22, 0.12, 0.75, 0.05, 8);
    handle.rotation.x = 0.28;
    const bristles = boxPart(0.18, 0.1, 0.08, 0xfacc15, 0.04, -0.58, 0.23, 0.85, 0.02);
    armR.add(handle, bristles);
  } else if (role === 'keeper') {
    // Khaki vest + wide-brim ranger hat + feed bucket
    torsoGroup.add(boxPart(0.27, 0.28, 0.23, 0xa16207, 0, 0.27, 0, 0.78, 0.04));
    headGroup.add(cylPart(0.22, 0.24, 0.022, 0x92400e, 0, 0.09, 0, 0.8, 0.02, 14));
    headGroup.add(cylPart(0.1, 0.12, 0.09, 0xb45309, 0, 0.14, 0, 0.8, 0.02, 12));
    // Feed bucket in left hand
    armL.add(cylPart(0.11, 0.085, 0.2, 0xf97316, -0.02, -0.44, 0.04, 0.45, 0.25, 12));
  } else {
    // Peaked police cap + silver badge + glowing flashlight
    torsoGroup.add(boxPart(0.05, 0.05, 0.02, 0xe2e8f0, 0.06, 0.34, 0.13, 0.2, 0.85));
    headGroup.add(cylPart(0.12, 0.128, 0.075, 0x1e3a8a, 0, 0.1, 0, 0.55, 0.15, 12));
    headGroup.add(boxPart(0.16, 0.015, 0.11, 0x0f172a, 0, 0.065, 0.12, 0.3, 0.4));
    // Flashlight in right hand
    const torch = cylPart(0.026, 0.022, 0.22, 0x334155, 0.02, -0.36, 0.12, 0.35, 0.7, 10);
    torch.rotation.x = Math.PI / 2;
    const lens = boxPart(0.04, 0.04, 0.02, 0xfef08a, 0.02, -0.36, 0.23, 0.1, 0.2, 0xfacc15, 0.8);
    armR.add(torch, lens);
  }

  return group;
}

function createStationAttendant(kind: 'nurse' | 'concierge'): THREE.Group {
  const isNurse = kind === 'nurse';
  const { group, headGroup, torsoGroup } = createRealisticHuman({
    skinColor: isNurse ? SKIN_TONES[0] : SKIN_TONES[1],
    hairColor: isNurse ? HAIR_COLORS[1] : HAIR_COLORS[0],
    shirtColor: isNurse ? 0xf8fafc : 0x0284c7,
    pantsColor: isNurse ? 0xe2e8f0 : 0x0f172a,
    shoeColor: isNurse ? 0xf8fafc : 0x1e293b,
    hairStyle: isNurse ? 'bun' : 'bob',
    scale: 0.96,
  });

  if (isNurse) {
    // Nurse cap with red cross + stethoscope
    headGroup.add(boxPart(0.12, 0.055, 0.06, 0xffffff, 0, 0.145, 0.02, 0.5, 0.05));
    headGroup.add(boxPart(0.045, 0.016, 0.01, 0xef4444, 0, 0.148, 0.052, 0.3, 0.1));
    headGroup.add(boxPart(0.016, 0.045, 0.01, 0xef4444, 0, 0.148, 0.052, 0.3, 0.1));
    torsoGroup.add(cylPart(0.075, 0.075, 0.02, 0x334155, 0, 0.42, 0.02, 0.4, 0.5, 10));
  } else {
    // Concierge yellow scarf/tie + gold nameplate
    torsoGroup.add(boxPart(0.04, 0.16, 0.02, 0xfacc15, 0, 0.35, 0.13, 0.45, 0.1));
    torsoGroup.add(boxPart(0.05, 0.025, 0.015, 0xfbbf24, 0.07, 0.36, 0.135, 0.25, 0.8));
  }

  return group;
}

// ============================================================================
// Facilities (Shops, Utilities, Nursing Station, Service Station, Water Wave Exhibit)
// ============================================================================
export function createFacilityMesh(key: FacilityKey): THREE.Group {
  const group = new THREE.Group();

  switch (key) {
    case 'drink': {
      group.add(boxPart(1.5, 0.14, 1.5, 0x334155, 0, 0.07, 0, 0.85, 0.1));
      group.add(boxPart(1.3, 0.72, 1.15, 0x0e7490, 0, 0.5, 0, 0.55, 0.1));
      group.add(boxPart(1.42, 0.12, 1.28, 0xf8fafc, 0, 0.88, 0.05, 0.35, 0.1));
      group.add(cylPart(0.05, 0.05, 0.85, 0x94a3b8, -0.58, 1.3, -0.45, 0.3, 0.6));
      group.add(cylPart(0.05, 0.05, 0.85, 0x94a3b8, 0.58, 1.3, -0.45, 0.3, 0.6));
      group.add(boxPart(1.55, 0.14, 1.4, 0x06b6d4, 0, 1.72, 0, 0.65, 0.05));
      group.add(cylPart(0.22, 0.17, 0.48, 0xfef08a, 0, 2.04, 0, 0.35, 0.05));
      group.add(cylPart(0.25, 0.25, 0.07, 0xf8fafc, 0, 2.3, 0, 0.3, 0.1));
      group.add(cylPart(0.03, 0.03, 0.32, 0xef4444, 0.08, 2.48, 0, 0.3, 0.1));
      break;
    }

    case 'icecream': {
      group.add(boxPart(1.5, 0.14, 1.5, 0x475569, 0, 0.07, 0, 0.85, 0.1));
      group.add(boxPart(1.32, 0.76, 1.2, 0xf472b6, 0, 0.52, 0, 0.5, 0.05));
      group.add(boxPart(1.4, 0.12, 1.28, 0xfdf2f8, 0, 0.92, 0.04, 0.3, 0.1));
      group.add(cylPart(0.05, 0.05, 0.82, 0xf8fafc, -0.58, 1.32, -0.45));
      group.add(cylPart(0.05, 0.05, 0.82, 0xf8fafc, 0.58, 1.32, -0.45));
      group.add(boxPart(1.56, 0.16, 1.42, 0xf9a8d4, 0, 1.74, 0, 0.6, 0.05));
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(0.22, 0.42, 12),
        new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.75 })
      );
      cone.position.set(0, 1.98, 0);
      cone.rotation.x = Math.PI;
      group.add(cone);
      group.add(spherePart(0.22, 0xfef9c3, 0, 2.26, 0));
      group.add(spherePart(0.18, 0xfb7185, 0, 2.52, 0));
      break;
    }

    case 'hotdog': {
      group.add(boxPart(1.55, 0.14, 1.45, 0x334155, 0, 0.07, 0, 0.85, 0.1));
      group.add(boxPart(1.36, 0.75, 1.15, 0xdc2626, 0, 0.52, 0, 0.45, 0.15));
      group.add(boxPart(1.44, 0.12, 1.22, 0xfacc15, 0, 0.92, 0, 0.4, 0.15));
      group.add(cylPart(0.05, 0.05, 0.82, 0xe2e8f0, -0.58, 1.32, -0.45, 0.3, 0.6));
      group.add(cylPart(0.05, 0.05, 0.82, 0xe2e8f0, 0.58, 1.32, -0.45, 0.3, 0.6));
      group.add(boxPart(1.56, 0.14, 1.36, 0xfef08a, 0, 1.74, 0, 0.6, 0.05));
      group.add(spherePart(0.2, 0xd97706, 0, 1.98, 0, 2.4, 0.75, 0.95));
      group.add(spherePart(0.12, 0xb91c1c, 0, 2.08, 0, 4.2, 0.85, 0.85));
      break;
    }

    case 'gift': {
      group.add(boxPart(1.75, 0.16, 1.75, 0x475569, 0, 0.08, 0, 0.85, 0.1));
      group.add(boxPart(1.55, 1.15, 1.48, 0x92400e, 0, 0.72, -0.04, 0.78, 0.05));
      group.add(boxPart(1.15, 0.62, 0.12, 0x38bdf8, 0, 0.75, 0.7, 0.15, 0.2, 0x0ea5e9, 0.25));
      group.add(boxPart(1.75, 0.22, 1.68, 0xf59e0b, 0, 1.4, 0, 0.5, 0.15));
      group.add(boxPart(1.25, 0.28, 0.24, 0x1e293b, 0, 1.65, 0.66, 0.4, 0.4));
      group.add(spherePart(0.25, 0xfbbf24, 0, 1.76, -0.05, 0.9, 0.8, 1.4, 0.25, 0.85));
      group.add(spherePart(0.16, 0xfbbf24, 0, 2.04, 0.24, 0.85, 0.85, 1.25, 0.25, 0.85));
      break;
    }

    case 'restroom': {
      group.add(boxPart(1.65, 0.14, 1.65, 0x64748b, 0, 0.07, 0, 0.85, 0.1));
      group.add(boxPart(1.45, 1.15, 1.38, 0xf1f5f9, 0, 0.72, 0, 0.4, 0.08));
      group.add(boxPart(1.56, 0.18, 1.48, 0x2563eb, 0, 1.38, 0, 0.5, 0.15));
      group.add(boxPart(0.42, 0.82, 0.08, 0x3b82f6, -0.35, 0.55, 0.7, 0.35, 0.1));
      group.add(boxPart(0.42, 0.82, 0.08, 0xf43f5e, 0.35, 0.55, 0.7, 0.35, 0.1));
      group.add(cylPart(0.2, 0.24, 0.22, 0x94a3b8, 0, 1.58, 0, 0.3, 0.6));
      break;
    }

    case 'water': {
      group.add(boxPart(1.1, 0.12, 1.1, 0x475569, 0, 0.06, 0, 0.85, 0.1));
      group.add(cylPart(0.28, 0.3, 0.85, 0xcbd5e1, 0, 0.54, 0, 0.25, 0.78));
      group.add(boxPart(0.42, 0.16, 0.3, 0x334155, 0, 0.78, 0.24, 0.3, 0.6));
      group.add(cylPart(0.22, 0.22, 0.5, 0x38bdf8, 0, 1.24, 0, 0.1, 0.1));
      break;
    }

    case 'nursing': {
      // 護理站：純白醫療建築 + 透明玻璃診療窗 + 發光紅十字標誌 + 真人護理師
      group.add(boxPart(1.82, 0.16, 1.82, 0x64748b, 0, 0.08, 0, 0.8, 0.12));
      group.add(boxPart(1.56, 1.18, 1.24, 0xf8fafc, 0, 0.75, -0.18, 0.38, 0.08));
      // 醫療玻璃櫃台窗
      group.add(boxPart(1.12, 0.56, 0.08, 0xbae6fd, 0, 0.84, 0.45, 0.15, 0.2, 0x38bdf8, 0.2));
      group.add(boxPart(1.22, 0.38, 0.32, 0xe2e8f0, 0, 0.35, 0.48, 0.45, 0.1));
      // 紅白色醫療屋頂
      group.add(boxPart(1.78, 0.18, 1.7, 0xf1f5f9, 0, 1.44, -0.02, 0.35, 0.12));
      group.add(boxPart(1.82, 0.08, 1.74, 0xef4444, 0, 1.56, -0.02, 0.4, 0.1));
      // 屋頂與門楣 3D 發光紅十字標誌
      const crossV = boxPart(0.18, 0.56, 0.18, 0xef4444, 0, 1.95, 0.38, 0.25, 0.1, 0xdc2626, 0.55);
      const crossH = boxPart(0.56, 0.18, 0.18, 0xef4444, 0, 1.95, 0.38, 0.25, 0.1, 0xdc2626, 0.55);
      group.add(crossV, crossH);
      // 站崗真人護理師
      const nurse = createStationAttendant('nurse');
      nurse.position.set(0.58, 0.16, 0.68);
      nurse.rotation.y = -0.25;
      group.add(nurse);
      break;
    }

    case 'service': {
      // 服務站：木石景觀遊客中心 + 藍白導覽招牌 "i" + 園區地圖看板 + 真人服務專員
      group.add(boxPart(1.82, 0.16, 1.82, 0x475569, 0, 0.08, 0, 0.8, 0.12));
      group.add(boxPart(1.5, 1.12, 1.18, 0x78350f, 0, 0.72, -0.2, 0.7, 0.08));
      // 接待檯與園區導覽地圖螢幕
      group.add(boxPart(1.26, 0.44, 0.34, 0xf1f5f9, 0, 0.38, 0.46, 0.4, 0.1));
      group.add(boxPart(0.84, 0.48, 0.06, 0x0ea5e9, 0, 0.82, 0.42, 0.2, 0.2, 0x0284c7, 0.4));
      // 弧形科技遮棚屋頂
      group.add(boxPart(1.78, 0.16, 1.68, 0x0284c7, 0, 1.38, -0.02, 0.4, 0.25));
      // 屋頂發光資訊標誌圓盤 + "i" 柱
      const badge = cylPart(0.32, 0.32, 0.1, 0x0ea5e9, 0, 1.82, 0.35, 0.25, 0.3, 18);
      badge.rotation.x = Math.PI / 2;
      group.add(badge);
      group.add(boxPart(0.08, 0.24, 0.13, 0xf8fafc, 0, 1.76, 0.35, 0.2, 0.1, 0xffffff, 0.5));
      group.add(spherePart(0.055, 0xfacc15, 0, 1.96, 0.35, 1, 1, 1.2, 0.2, 0.2));
      // 站崗真人服務專員
      const concierge = createStationAttendant('concierge');
      concierge.position.set(-0.56, 0.16, 0.68);
      concierge.rotation.y = 0.25;
      group.add(concierge);
      break;
    }

    case 'waveexhibit': {
      // 水波展區：親水景觀石框 + 玻璃安全圍欄 + 水下燈光與動態起伏波浪水面
      // 四邊石質池框
      group.add(boxPart(1.94, 0.24, 0.16, 0x475569, 0, 0.12, 0.89, 0.85, 0.1));
      group.add(boxPart(1.94, 0.24, 0.16, 0x475569, 0, 0.12, -0.89, 0.85, 0.1));
      group.add(boxPart(0.16, 0.24, 1.62, 0x475569, -0.89, 0.12, 0, 0.85, 0.1));
      group.add(boxPart(0.16, 0.24, 1.62, 0x475569, 0.89, 0.12, 0, 0.85, 0.1));

      // 池底深藍水層與礁石
      group.add(boxPart(1.64, 0.08, 1.64, 0x0c4a6e, 0, 0.04, 0, 0.6, 0.1));
      group.add(spherePart(0.16, 0x64748b, -0.45, 0.1, -0.35, 1.3, 0.55, 1.1));
      group.add(spherePart(0.14, 0x475569, 0.42, 0.09, 0.36, 1.1, 0.6, 1.2));

      // 玻璃安全觀賞欄杆與金屬支柱
      const glassMat = new THREE.MeshStandardMaterial({
        color: 0xbae6fd,
        transparent: true,
        opacity: 0.36,
        roughness: 0.1,
        metalness: 0.2,
      });
      [
        [0, 0.42, 0.9, 1.78, 0.36, 0.04],
        [0, 0.42, -0.9, 1.78, 0.36, 0.04],
        [-0.9, 0.42, 0, 0.04, 0.36, 1.78],
        [0.9, 0.42, 0, 0.04, 0.36, 1.78],
      ].forEach(([gx, gy, gz, gw, gh, gd]) => {
        const panel = new THREE.Mesh(new THREE.BoxGeometry(gw, gh, gd), glassMat);
        panel.position.set(gx, gy, gz);
        group.add(panel);
      });
      [
        [-0.9, -0.9],
        [0.9, -0.9],
        [-0.9, 0.9],
        [0.9, 0.9],
      ].forEach(([px, pz]) => {
        group.add(cylPart(0.05, 0.05, 0.64, 0x94a3b8, px, 0.32, pz, 0.3, 0.7, 8));
      });

      // 動態細分波浪水面網格 (ParkEngine 每幀更新頂點起伏)
      const waveGeo = new THREE.PlaneGeometry(1.66, 1.66, 16, 16);
      waveGeo.rotateX(-Math.PI / 2);
      const waveMat = new THREE.MeshStandardMaterial({
        color: 0x0ea5e9,
        emissive: 0x0369a1,
        emissiveIntensity: 0.28,
        transparent: true,
        opacity: 0.82,
        roughness: 0.12,
        metalness: 0.25,
      });
      const waveMesh = new THREE.Mesh(waveGeo, waveMat);
      waveMesh.position.y = 0.24;
      waveMesh.receiveShadow = true;
      group.add(waveMesh);

      // 兩圈同心擴散水波紋
      const rippleRings: THREE.Mesh[] = [];
      for (let i = 0; i < 2; i++) {
        const ringGeo = new THREE.RingGeometry(0.18, 0.24, 24);
        ringGeo.rotateX(-Math.PI / 2);
        const ringMat = new THREE.MeshBasicMaterial({
          color: 0xe0f2fe,
          transparent: true,
          opacity: 0.6,
          side: THREE.DoubleSide,
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.set(i === 0 ? -0.18 : 0.22, 0.27, i === 0 ? 0.15 : -0.2);
        ring.userData.phaseOffset = i * 1.5;
        group.add(ring);
        rippleRings.push(ring);
      }

      group.userData.waveMesh = waveMesh;
      group.userData.rippleRings = rippleRings;
      break;
    }

    case 'arena': {
      // 恐龍競技場：圓形岩石底座 + 砂土決鬥擂台 + 階梯看台 + 四角照明塔與紅金雙門柱
      group.add(cylPart(0.96, 1.02, 0.16, 0x334155, 0, 0.08, 0, 0.85, 0.12, 16));
      // 黃褐決鬥沙地
      group.add(cylPart(0.68, 0.68, 0.06, 0xd6b078, 0, 0.17, 0, 0.92, 0.02, 16));
      // 中央對決標記環
      const ringGeo = new THREE.RingGeometry(0.28, 0.36, 24);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMesh = new THREE.Mesh(
        ringGeo,
        new THREE.MeshBasicMaterial({ color: 0xdc2626, side: THREE.DoubleSide })
      );
      ringMesh.position.y = 0.21;
      group.add(ringMesh);

      // 環狀階梯看台（兩層石砌拱圈）
      const tier1 = new THREE.Mesh(
        new THREE.TorusGeometry(0.76, 0.1, 8, 20),
        new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.75, metalness: 0.15 })
      );
      tier1.rotation.x = Math.PI / 2;
      tier1.position.y = 0.24;
      tier1.castShadow = true;
      tier1.receiveShadow = true;
      group.add(tier1);

      const tier2 = new THREE.Mesh(
        new THREE.TorusGeometry(0.86, 0.1, 8, 20),
        new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.6, metalness: 0.2 })
      );
      tier2.rotation.x = Math.PI / 2;
      tier2.position.y = 0.4;
      tier2.castShadow = true;
      group.add(tier2);

      // 四角聚光燈塔與紅旗標記
      [
        [-0.72, -0.72],
        [0.72, -0.72],
        [-0.72, 0.72],
        [0.72, 0.72],
      ].forEach(([px, pz]) => {
        group.add(cylPart(0.055, 0.075, 1.15, 0x1e293b, px, 0.6, pz, 0.4, 0.65, 8));
        const lamp = boxPart(0.16, 0.1, 0.16, 0xfef08a, px, 1.2, pz, 0.2, 0.2, 0xfacc15, 0.95);
        lamp.castShadow = false;
        group.add(lamp);
      });

      // 正面雙對戰戰旗門柱 + 金色獎盃頂飾
      group.add(boxPart(0.14, 0.72, 0.14, 0x991b1b, -0.34, 0.5, 0.85, 0.5, 0.3));
      group.add(boxPart(0.14, 0.72, 0.14, 0x991b1b, 0.34, 0.5, 0.85, 0.5, 0.3));
      group.add(boxPart(0.86, 0.18, 0.18, 0x1e293b, 0, 0.92, 0.85, 0.4, 0.5));
      group.add(boxPart(0.54, 0.1, 0.2, 0xf59e0b, 0, 0.92, 0.86, 0.25, 0.75, 0xd97706, 0.45));
      break;
    }

    case 'trashbin':
    default: {
      group.add(boxPart(0.95, 0.1, 0.95, 0x475569, 0, 0.05, 0, 0.85, 0.1));
      group.add(cylPart(0.28, 0.25, 0.72, 0x334155, 0, 0.46, 0, 0.45, 0.45));
      group.add(cylPart(0.31, 0.31, 0.12, 0x22c55e, 0, 0.86, 0, 0.45, 0.1));
      group.add(cylPart(0.15, 0.18, 0.12, 0x16a34a, 0, 0.96, 0, 0.45, 0.1));
      break;
    }
  }

  return group;
}

export function createLitterMesh(): THREE.Group {
  const group = new THREE.Group();
  const colors = [0xfef08a, 0xfca5a5, 0xe2e8f0, 0x93c5fd];
  const c = colors[Math.floor(Math.random() * colors.length)];
  const trash1 = boxPart(0.2, 0.08, 0.18, c, -0.1, 0.04, 0.05, 0.8, 0.05);
  const trash2 = cylPart(0.06, 0.06, 0.16, 0xef4444, 0.12, 0.08, -0.08, 0.4, 0.2);
  trash1.rotation.y = Math.random() * Math.PI;
  group.add(trash1, trash2);
  return group;
}
