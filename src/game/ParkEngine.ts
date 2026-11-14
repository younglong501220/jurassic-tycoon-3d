import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  BASE_UNLOCKED_SPECIES_IDS,
  CELL_SIZE,
  CYCLE_DURATION,
  DEFAULT_DAY_CYCLE_SECONDS,
  DEFAULT_PARK_NAME,
  DEFAULT_SOUND_VOLUME,
  DEFAULT_TICKET_PRICE,
  DEFAULT_WEATHER_STAGE_SECONDS,
  DINO_SPECIES,
  ENTRANCE_CELLS,
  FACILITY_CONFIGS,
  FEED_PACK_AMOUNT,
  FEED_PACK_COST,
  FENCE_COST,
  GRID_SIZE,
  MAX_DAY_CYCLE_SECONDS,
  MAX_PARK_NAME_LENGTH,
  MAX_TICKET_PRICE,
  MAX_VISITORS,
  MIN_DAY_CYCLE_SECONDS,
  MIN_TICKET_PRICE,
  STAFF_CONFIGS,
  START_FEED,
  START_MONEY,
  TECH_TREE,
  VISITOR_SPAWN_INTERVAL,
  WEATHER_CYCLE_ORDER,
} from './config';
import { GLTF, GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  DinoAnimParts,
  GLTF_MODEL_PATHS,
  MODEL_YAW_OFFSET,
  TARGET_MODEL_EXTENT,
  bindGltfAnimParts,
  createDinosaurShell,
  extractDinoAnimationActions,
} from './dinosaurFactory';
import {
  createFacilityMesh as buildFacilityMesh,
  createFenceMesh,
  createLitterMesh,
  createStaffMesh,
  createVisitorMesh,
  refreshFenceAndNeighbors,
} from './propFactory';
import {
  AnalyticsPoint,
  CameraMode,
  DayPhase,
  DinoAnimState,
  DinoEntity,
  FacilityKey,
  FinancialSummary,
  GameSnapshot,
  GridCellObject,
  GridCellSave,
  LitterEntity,
  StaffEntity,
  StaffRole,
  TechId,
  TimeMode,
  ToolMode,
  WeatherMode,
  WeatherType,
} from './types';
import {
  GateSignageHandle,
  buildWorldEnvironment,
  gridToWorld,
  isEntranceCell,
  worldToGrid,
} from './worldBuilder';
import { ParkSoundEffects, VisitorExclaimKind } from './soundEffects';
import { Visitor } from './Visitor';
import { WeatherSystem } from './weatherSystem';

const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function emptyFinance(): FinancialSummary {
  return {
    gateRevenue: 0,
    ticketRevenue: 0,
    shopRevenue: 0,
    staffWages: 0,
    facilityUpkeep: 0,
    dinoUpkeep: 0,
    feedCost: 0,
  };
}

export interface EngineCallbacks {
  onSnapshot: (snap: GameSnapshot) => void;
  onToast: (msg: string, tone?: 'info' | 'success' | 'warn' | 'error') => void;
  onSelectDinoForShowcase: (dinoId: number, speciesType: number) => void;
  onOpenGateSettings?: () => void;
  onOpenArena?: () => void;
  onFloatingText: (screenX: number, screenY: number, text: string, variant: 'ticket' | 'shop') => void;
}

export type VisitorInteractionEvent =
  | {
      type: 'shop_purchase';
      visitor: Visitor;
      facilityKey: FacilityKey;
      facilityName: string;
      revenue: number;
      worldPos: THREE.Vector3;
    }
  | {
      type: 'facility_visit';
      visitor: Visitor;
      facilityKey: FacilityKey;
      facilityName: string;
      worldPos: THREE.Vector3;
    }
  | {
      type: 'dino_observe';
      visitor: Visitor;
      dino: DinoEntity;
      popularity: number;
      performanceScore: number;
      reaction: VisitorExclaimKind;
      isHighPopularity: boolean;
      worldPos: THREE.Vector3;
    };

interface ActivePopup {
  id: number;
  worldPos: THREE.Vector3;
  text: string;
  variant: 'ticket' | 'shop';
  age: number;
  duration: number;
}

export class ParkEngine {
  private container: HTMLElement;
  private callbacks: EngineCallbacks;
  private isSoftwareGl: boolean;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private renderer: THREE.WebGLRenderer;
  private controls: OrbitControls;
  private envMap: THREE.Texture | null = null;

  private ambientLight!: THREE.AmbientLight;
  private hemiLight!: THREE.HemisphereLight;
  private sunLight!: THREE.DirectionalLight;
  private rimLight!: THREE.DirectionalLight;
  private moonGroup!: THREE.Group;
  private moonMesh!: THREE.Mesh;
  private sunMesh!: THREE.Mesh;
  private starField!: THREE.Points;
  private starMaterial!: THREE.PointsMaterial;
  private moonTexture!: THREE.CanvasTexture;

  private grassTileMeshes: THREE.Mesh[] = [];
  private oceanMesh!: THREE.Mesh;
  private gateSignage!: GateSignageHandle;
  private wavePools: THREE.Group[] = [];
  private waveTime = 0;
  private hoverIndicator: THREE.Mesh;
  private raycaster = new THREE.Raycaster();
  private dinoGltfLoader = new GLTFLoader();
  private dinoGltfCache = new Map<string, Promise<GLTF>>();
  private soundEffects = new ParkSoundEffects();
  private weatherSystem!: WeatherSystem;
  private pointerNDC = new THREE.Vector2();
  private pointerDownPos = { x: 0, y: 0 };
  private hoveredCell: { gx: number; gz: number } | null = null;
  private lastHoverRaycast = 0;

  // Game state
  private parkName = DEFAULT_PARK_NAME;
  private ticketPrice = DEFAULT_TICKET_PRICE;
  private money = START_MONEY;
  private feedStock = START_FEED;
  private autoBuyFeed = true;
  private activeTool: ToolMode = 'inspect';
  private selectedDinoType = 1;
  private selectedFacilityKey: FacilityKey = 'drink';

  // Day-Night Cycle state
  private timeMode: TimeMode = 'auto';
  private dayCycleDuration = DEFAULT_DAY_CYCLE_SECONDS;
  private dayProgress = 0.34; // Start around crisp morning (~08:10)

  // Weather Cycle state (sunny -> rainy -> foggy)
  private weatherMode: WeatherMode = 'auto';
  private currentWeather: WeatherType = 'sunny';
  private weatherCycleIndex = 0;
  private weatherTimer = DEFAULT_WEATHER_STAGE_SECONDS;

  private grid: (GridCellObject | null)[][] = Array.from({ length: GRID_SIZE }, () =>
    Array(GRID_SIZE).fill(null)
  );
  private dinosaurs: DinoEntity[] = [];
  private visitors: Visitor[] = [];
  private visitorListeners = new Set<(event: VisitorInteractionEvent) => void>();
  private staff: StaffEntity[] = [];
  private litter: LitterEntity[] = [];
  private popups: ActivePopup[] = [];

  private satisfaction = 62;
  private safetyRating = 85;
  private cleanlinessRating = 100;
  private visitorSpawnTimer = 1.0;
  private satisfactionTimer = 0;
  private cycleTimer = CYCLE_DURATION;
  private uiEmitTimer = 0;
  private nextId = 1;

  // Research Lab & Tech Tree state
  private unlockedTechs = new Set<TechId>();
  private unlockedSpeciesIds = new Set<number>(BASE_UNLOCKED_SPECIES_IDS);
  private fenceTier: 1 | 2 | 3 = 1;
  private arenaPopularityBonus = 0;

  // First-Person Visitor Mode Camera state
  private cameraMode: CameraMode = 'overview';
  private savedOverviewCamPos = new THREE.Vector3(0, 26, 26);
  private savedOverviewTarget = new THREE.Vector3(0, 0, 2.0);
  private fpYaw = 0;
  private fpPitch = -0.04;
  private fpKeys = new Set<string>();
  private fpDragging = false;
  private fpLastPointer = { x: 0, y: 0 };
  private fpWalkPhase = 0;

  // Analytics & Revenue Growth History
  private cumulativeRevenue = 0;
  private intervalRevenue = 0;
  private analyticsTimer = 0;
  private analyticsIndex = 0;
  private analyticsHistory: AnalyticsPoint[] = [];

  private currentFinance: FinancialSummary = emptyFinance();
  private lastFinance: FinancialSummary = emptyFinance();

  private frameId = 0;
  private lastTime = performance.now();
  private disposed = false;

  private readonly skyScratch = new THREE.Color();
  private readonly ambScratch = new THREE.Color();
  private readonly sunScratch = new THREE.Color();
  private readonly hemiSkyScratch = new THREE.Color();
  private readonly hemiGroundScratch = new THREE.Color();

  private readonly DEFAULT_CAM_POS = new THREE.Vector3(0, 26, 26);
  private readonly DEFAULT_CAM_TARGET = new THREE.Vector3(0, 0, 2.0);

  constructor(
    container: HTMLElement,
    callbacks: EngineCallbacks,
    initialSave?: { snapshot?: Partial<GameSnapshot>; gridLayout?: GridCellSave[] }
  ) {
    this.container = container;
    this.callbacks = callbacks;
    this.isSoftwareGl = detectSoftwareGl();

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x93c5fd);
    this.scene.fog = new THREE.Fog(0x93c5fd, 52, 110);

    const w = Math.max(container.clientWidth, window.innerWidth);
    const h = Math.max(container.clientHeight, window.innerHeight);

    this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 220);
    this.camera.position.copy(this.DEFAULT_CAM_POS);
    this.camera.lookAt(this.DEFAULT_CAM_TARGET);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setSize(w, h);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // Studio RoomEnvironment reflection for metallic/glass details
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = this.envMap;
    pmrem.dispose();

    // OrbitControls
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.copy(this.DEFAULT_CAM_TARGET);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2.06;
    this.controls.minPolarAngle = Math.PI / 8;
    this.controls.minDistance = 12;
    this.controls.maxDistance = 58;
    this.controls.update();

    // 3-Point Tropical Daylight + Dynamic Day-Night Rig
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0x3f6212, 0.5);
    this.hemiLight.position.set(0, 32, 0);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfffbeb, 1.05);
    this.sunLight.position.set(22, 36, 18);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 5;
    this.sunLight.shadow.camera.far = 95;
    const d = 25;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);

    this.rimLight = new THREE.DirectionalLight(0xbae6fd, 0.35);
    this.rimLight.position.set(-20, 16, -22);
    this.scene.add(this.rimLight);

    // Celestial Objects: Rotating Moon Mesh, Sun Mesh & Starfield
    this.buildCelestialSky();

    // Weather Particle System (Sunny / Rainy / Foggy)
    this.weatherSystem = new WeatherSystem(this.scene, this.isSoftwareGl);
    this.soundEffects.setVolume(DEFAULT_SOUND_VOLUME / 100);

    // Build 16x16 island world & load real 3D tree model assets
    this.loadSceneEnvironment();

    // Restore persisted player progress from localStorage if available
    if (initialSave?.snapshot || initialSave?.gridLayout) {
      this.applySavedState(initialSave.snapshot, initialSave.gridLayout);
    }

    // Hover indicator
    this.hoverIndicator = new THREE.Mesh(
      new THREE.BoxGeometry(CELL_SIZE - 0.08, 0.14, CELL_SIZE - 0.08),
      new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.58 })
    );
    this.hoverIndicator.visible = false;
    this.hoverIndicator.position.y = 0.08;
    this.scene.add(this.hoverIndicator);

    this.updateDayNight(0);
    this.updateWeather(0);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    this.bindEvents();
    this.registerVisitorAudioListeners();
    this.recalcMetrics();
    if (this.analyticsHistory.length === 0) {
      this.recordAnalyticsSample();
    }
    this.emitSnapshot();
    this.startLoop();
  }

  public exportGridLayout(): GridCellSave[] {
    const items: GridCellSave[] = [];
    for (let gx = 0; gx < GRID_SIZE; gx++) {
      for (let gz = 0; gz < GRID_SIZE; gz++) {
        const cell = this.grid[gx][gz];
        if (!cell) continue;
        items.push({
          type: cell.type,
          facilityKey: cell.facilityKey,
          gx,
          gz,
        });
      }
    }
    return items;
  }

  public resetParkProgress(): void {
    if (this.cameraMode === 'first_person') {
      this.setCameraMode('overview');
    }

    // Clear grid meshes
    for (let gx = 0; gx < GRID_SIZE; gx++) {
      for (let gz = 0; gz < GRID_SIZE; gz++) {
        const cell = this.grid[gx][gz];
        if (cell) {
          this.scene.remove(cell.mesh);
          this.grid[gx][gz] = null;
        }
      }
    }
    this.wavePools = [];

    // Clear dinosaurs
    for (const d of this.dinosaurs) {
      this.disposeDinoMixer(d);
      this.scene.remove(d.mesh);
    }
    this.dinosaurs = [];

    // Clear visitors, staff, litter
    for (const v of this.visitors) this.scene.remove(v.mesh);
    this.visitors = [];
    for (const s of this.staff) this.scene.remove(s.mesh);
    this.staff = [];
    for (const l of this.litter) this.scene.remove(l.mesh);
    this.litter = [];
    this.popups = [];

    // Reset state
    this.parkName = DEFAULT_PARK_NAME;
    this.ticketPrice = DEFAULT_TICKET_PRICE;
    this.gateSignage?.updateSignage(this.parkName, this.ticketPrice);
    this.money = START_MONEY;
    this.feedStock = START_FEED;
    this.autoBuyFeed = true;
    this.activeTool = 'inspect';
    this.selectedDinoType = 1;
    this.selectedFacilityKey = 'drink';
    this.timeMode = 'auto';
    this.dayCycleDuration = DEFAULT_DAY_CYCLE_SECONDS;
    this.dayProgress = 0.34;
    this.weatherMode = 'auto';
    this.currentWeather = 'sunny';
    this.weatherCycleIndex = 0;
    this.weatherTimer = DEFAULT_WEATHER_STAGE_SECONDS;
    this.cycleTimer = CYCLE_DURATION;
    this.unlockedTechs = new Set<TechId>();
    this.unlockedSpeciesIds = new Set<number>(BASE_UNLOCKED_SPECIES_IDS);
    this.fenceTier = 1;
    this.arenaPopularityBonus = 0;
    this.cumulativeRevenue = 0;
    this.intervalRevenue = 0;
    this.analyticsIndex = 0;
    this.analyticsHistory = [];
    this.currentFinance = emptyFinance();
    this.lastFinance = emptyFinance();
    this.nextId = 1;

    this.seedStarterWaveExhibit();
    this.updateDayNight(0);
    this.updateWeather(0);
    this.recalcMetrics();
    this.recordAnalyticsSample();
    this.emitSnapshot();
    this.callbacks.onToast('已重置公園經營存檔，開啟全新園區！', 'info');
  }

  private applySavedState(
    saved?: Partial<GameSnapshot>,
    gridLayout?: GridCellSave[]
  ): void {
    if (saved) {
      if (typeof saved.parkName === 'string' && saved.parkName.trim()) {
        this.parkName = saved.parkName.trim().slice(0, MAX_PARK_NAME_LENGTH);
      }
      if (typeof saved.ticketPrice === 'number' && Number.isFinite(saved.ticketPrice)) {
        this.ticketPrice = Math.max(
          MIN_TICKET_PRICE,
          Math.min(MAX_TICKET_PRICE, Math.round(saved.ticketPrice))
        );
      }
      this.gateSignage?.updateSignage(this.parkName, this.ticketPrice);

      if (typeof saved.money === 'number' && Number.isFinite(saved.money)) {
        this.money = Math.round(saved.money);
      }
      if (typeof saved.feedStock === 'number' && Number.isFinite(saved.feedStock)) {
        this.feedStock = Math.max(0, Math.round(saved.feedStock));
      }
      if (typeof saved.autoBuyFeed === 'boolean') {
        this.autoBuyFeed = saved.autoBuyFeed;
      }
      if (saved.activeTool) this.activeTool = saved.activeTool;
      if (typeof saved.selectedDinoType === 'number' && DINO_SPECIES[saved.selectedDinoType]) {
        this.selectedDinoType = saved.selectedDinoType;
      }
      if (saved.selectedFacilityKey && FACILITY_CONFIGS[saved.selectedFacilityKey]) {
        this.selectedFacilityKey = saved.selectedFacilityKey;
      }
      if (saved.timeMode) this.timeMode = saved.timeMode;
      if (typeof saved.dayCycleDuration === 'number' && Number.isFinite(saved.dayCycleDuration)) {
        this.dayCycleDuration = Math.max(
          MIN_DAY_CYCLE_SECONDS,
          Math.min(MAX_DAY_CYCLE_SECONDS, Math.round(saved.dayCycleDuration))
        );
      }
      if (typeof saved.dayProgress === 'number' && Number.isFinite(saved.dayProgress)) {
        this.dayProgress = ((saved.dayProgress % 1) + 1) % 1;
      }
      if (saved.weatherMode) this.weatherMode = saved.weatherMode;
      if (saved.currentWeather) {
        this.currentWeather = saved.currentWeather;
        const wIdx = WEATHER_CYCLE_ORDER.indexOf(saved.currentWeather);
        if (wIdx !== -1) this.weatherCycleIndex = wIdx;
      }
      if (typeof saved.weatherTimeLeft === 'number' && saved.weatherTimeLeft > 0) {
        this.weatherTimer = saved.weatherTimeLeft;
      }
      if (typeof saved.cycleTimeLeft === 'number' && saved.cycleTimeLeft > 0) {
        this.cycleTimer = Math.min(CYCLE_DURATION, saved.cycleTimeLeft);
      }
      if (typeof saved.soundVolume === 'number' && Number.isFinite(saved.soundVolume)) {
        this.soundEffects.setVolume(Math.max(0, Math.min(100, saved.soundVolume)) / 100);
      }
      if (typeof saved.soundMuted === 'boolean') {
        this.soundEffects.setMuted(saved.soundMuted);
      }
      if (saved.currentCycleFinance) {
        this.currentFinance = { ...emptyFinance(), ...saved.currentCycleFinance };
      }
      if (saved.lastCycleFinance) {
        this.lastFinance = { ...emptyFinance(), ...saved.lastCycleFinance };
      }
      if (typeof saved.cumulativeRevenue === 'number' && Number.isFinite(saved.cumulativeRevenue)) {
        this.cumulativeRevenue = Math.max(0, Math.round(saved.cumulativeRevenue));
      }
      if (Array.isArray(saved.analyticsHistory) && saved.analyticsHistory.length > 0) {
        this.analyticsHistory = saved.analyticsHistory.slice(-60);
        const maxIdx = this.analyticsHistory.reduce((m, p) => Math.max(m, p.index), 0);
        this.analyticsIndex = maxIdx + 1;
      }
      if (Array.isArray(saved.unlockedTechs)) {
        this.unlockedTechs = new Set<TechId>(saved.unlockedTechs);
      }
      if (Array.isArray(saved.unlockedSpeciesIds) && saved.unlockedSpeciesIds.length > 0) {
        this.unlockedSpeciesIds = new Set<number>(saved.unlockedSpeciesIds);
      }
      if (saved.fenceTier === 1 || saved.fenceTier === 2 || saved.fenceTier === 3) {
        this.fenceTier = saved.fenceTier;
      }
      if (typeof saved.arenaPopularityBonus === 'number' && Number.isFinite(saved.arenaPopularityBonus)) {
        this.arenaPopularityBonus = Math.max(0, Math.min(12, saved.arenaPopularityBonus));
      }
    }

    // Restore saved grid cells (fences & facilities)
    if (Array.isArray(gridLayout)) {
      // Remove starter cells first so restored grid matches exact saved state
      for (let gx = 0; gx < GRID_SIZE; gx++) {
        for (let gz = 0; gz < GRID_SIZE; gz++) {
          const existing = this.grid[gx][gz];
          if (existing) {
            this.scene.remove(existing.mesh);
            this.grid[gx][gz] = null;
          }
        }
      }
      this.wavePools = [];

      for (const item of gridLayout) {
        if (
          item.gx < 0 ||
          item.gx >= GRID_SIZE ||
          item.gz < 0 ||
          item.gz >= GRID_SIZE ||
          isEntranceCell(item.gx, item.gz)
        ) {
          continue;
        }
        if (item.type === 'fence') {
          const mesh = createFenceMesh(this.fenceTier);
          mesh.position.copy(gridToWorld(item.gx, item.gz));
          mesh.userData.gx = item.gx;
          mesh.userData.gz = item.gz;
          mesh.traverse((child) => {
            child.userData.cellCoords = { gx: item.gx, gz: item.gz };
          });
          this.scene.add(mesh);
          this.grid[item.gx][item.gz] = { type: 'fence', mesh, gx: item.gx, gz: item.gz };
        } else if (item.type === 'facility' && item.facilityKey && FACILITY_CONFIGS[item.facilityKey]) {
          const mesh = this.createFacilityMesh(item.facilityKey, item.gx, item.gz);
          this.scene.add(mesh);
          this.grid[item.gx][item.gz] = {
            type: 'facility',
            facilityKey: item.facilityKey,
            mesh,
            gx: item.gx,
            gz: item.gz,
          };
          if (item.facilityKey === 'waveexhibit') {
            this.wavePools.push(mesh);
          }
        }
      }

      for (let gx = 0; gx < GRID_SIZE; gx++) {
        for (let gz = 0; gz < GRID_SIZE; gz++) {
          if (this.grid[gx][gz]?.type === 'fence') {
            refreshFenceAndNeighbors(this.grid, gx, gz, this.fenceTier);
          }
        }
      }
    }

    // Restore placed dinosaurs from snapshot
    if (saved && Array.isArray(saved.dinosaurs)) {
      for (const dSnap of saved.dinosaurs) {
        const cfg = DINO_SPECIES[dSnap.type];
        if (!cfg) continue;
        const gx = Math.max(0, Math.min(GRID_SIZE - 1, dSnap.gx ?? 6));
        const gz = Math.max(0, Math.min(GRID_SIZE - 1, dSnap.gz ?? 6));
        const { rootGroup: dinoMesh, bodyRig, animParts } = createDinosaurShell(cfg.id);
        const pos = gridToWorld(gx, gz);
        dinoMesh.position.copy(pos);
        dinoMesh.rotation.y = (Math.random() - 0.5) * Math.PI * 2;
        this.scene.add(dinoMesh);

        const entityId = typeof dSnap.id === 'number' ? dSnap.id : this.nextId++;
        if (entityId >= this.nextId) {
          this.nextId = entityId + 1;
        }

        const entity: DinoEntity = {
          id: entityId,
          type: cfg.id,
          config: cfg,
          mesh: dinoMesh,
          gx,
          gz,
          targetGx: gx,
          targetGz: gz,
          targetWorld: pos.clone(),
          isMoving: false,
          idleTimer: 0.6 + Math.random() * 1.6,
          animState: 'idle',
          eatingTimer: 0,
          grazeCooldown: 5 + Math.random() * 8,
          animPhase: Math.random() * Math.PI * 2,
          speed:
            cfg.id === 6 || cfg.id === 5
              ? 2.6
              : cfg.id === 12
                ? 2.35
                : cfg.id === 2
                  ? 1.15
                  : 1.7,
          satiety: typeof dSnap.satiety === 'number' ? Math.max(5, Math.min(100, dSnap.satiety)) : 90,
          popularity: typeof dSnap.popularity === 'number' ? dSnap.popularity : cfg.basePopularity,
          performanceScore: typeof dSnap.performanceScore === 'number' ? dSnap.performanceScore : 90,
          performanceStatus: dSnap.performanceStatus || '活力十足·精彩展示',
          totalViews: typeof dSnap.totalViews === 'number' ? dSnap.totalViews : 0,
          totalRevenue: typeof dSnap.totalRevenue === 'number' ? dSnap.totalRevenue : 0,
          growth: typeof dSnap.growth === 'number' ? Math.max(0, Math.min(100, dSnap.growth)) : 100,
          arenaWins: typeof dSnap.arenaWins === 'number' ? dSnap.arenaWins : 0,
          activeAction: null,
          stepPhase: 0,
          vocalCooldown: 2.5 + Math.random() * 5,
        };
        this.updateDinoPerformance(entity);
        this.dinosaurs.push(entity);
        this.loadDinosaurModel(entity, bodyRig, animParts);
      }
    }

    // Restore hired staff counts
    if (saved?.staffCounts) {
      const roles: StaffRole[] = ['cleaner', 'keeper', 'security'];
      for (const role of roles) {
        const count = Math.max(0, Math.min(20, Math.round(saved.staffCounts[role] || 0)));
        const staffSpeed =
          role === 'cleaner'
            ? this.unlockedTechs.has('staff_cleaner_boost')
              ? 4.3
              : 2.8
            : role === 'keeper'
              ? this.unlockedTechs.has('staff_keeper_boost')
                ? 4.0
                : 2.6
              : this.unlockedTechs.has('staff_security_boost')
                ? 3.5
                : 2.5;
        for (let i = 0; i < count; i++) {
          const mesh = createStaffMesh(role);
          const entry = ENTRANCE_CELLS[0];
          const startPos = gridToWorld(entry.gx, entry.gz);
          mesh.position.set(startPos.x + (Math.random() - 0.5) * 0.6, 0, startPos.z);
          this.scene.add(mesh);
          this.staff.push({
            id: this.nextId++,
            role,
            mesh,
            gx: entry.gx,
            gz: entry.gz,
            path: [],
            workTimer: 0.4 + Math.random() * 0.6,
            targetLitterId: null,
            targetDinoId: null,
            speed: staffSpeed,
            animPhase: Math.random() * Math.PI * 2,
          });
        }
      }
    }
  }

  public addVisitorInteractionListener(
    listener: (event: VisitorInteractionEvent) => void
  ): () => void {
    this.visitorListeners.add(listener);
    return () => {
      this.visitorListeners.delete(listener);
    };
  }

  private emitVisitorInteraction(event: VisitorInteractionEvent): void {
    for (const listener of this.visitorListeners) {
      listener(event);
    }
  }

  private registerVisitorAudioListeners(): void {
    // 監聽遊客商店購買與高人氣恐龍觀賞事件，觸發對應 3D 空間音效
    this.addVisitorInteractionListener((event) => {
      if (event.type === 'shop_purchase') {
        this.soundEffects.playShopInteraction(
          event.facilityKey,
          event.worldPos,
          event.visitor.mesh
        );
        if (event.facilityKey === 'waveexhibit') {
          this.soundEffects.playVisitorExclaim('awe', event.worldPos, event.visitor.mesh);
        }
        return;
      }

      if (event.type === 'facility_visit') {
        if (
          event.facilityKey === 'nursing' ||
          event.facilityKey === 'service' ||
          event.facilityKey === 'water'
        ) {
          this.soundEffects.playShopInteraction(
            event.facilityKey,
            event.worldPos,
            event.visitor.mesh
          );
        }
        return;
      }

      if (event.type === 'dino_observe') {
        if (event.isHighPopularity) {
          // 高人氣恐龍觸發驚喜／愉悅讚歎音效
          const kind: VisitorExclaimKind =
            event.popularity >= 84 && event.performanceScore >= 75 ? 'awe' : 'delight';
          this.soundEffects.playVisitorExclaim(kind, event.worldPos, event.visitor.mesh);
        } else {
          this.soundEffects.playVisitorExclaim(
            event.reaction,
            event.worldPos,
            event.visitor.mesh
          );
        }
      }
    });
  }

  private loadSceneEnvironment(): void {
    const maxAnisotropy = this.isSoftwareGl
      ? 1
      : this.renderer.capabilities.getMaxAnisotropy();
    const world = buildWorldEnvironment(this.scene, maxAnisotropy);
    this.grassTileMeshes = world.grassTileMeshes;
    this.oceanMesh = world.oceanMesh;
    this.gateSignage = world.gateSignage;
    this.gateSignage.updateSignage(this.parkName, this.ticketPrice);
    // 預先於園區右上角建立示範水波展區
    this.seedStarterWaveExhibit();
  }

  private createFacilityMesh(key: FacilityKey, gx: number, gz: number): THREE.Group {
    const mesh = buildFacilityMesh(key);
    mesh.position.copy(gridToWorld(gx, gz));
    mesh.userData.isFacility = true;
    mesh.userData.facilityKey = key;
    mesh.userData.gx = gx;
    mesh.userData.gz = gz;
    mesh.userData.blocksDinos = key !== 'waveexhibit';
    mesh.userData.blocksVisitors = true;
    mesh.traverse((child) => {
      child.userData.cellCoords = { gx, gz };
    });
    return mesh;
  }

  private seedStarterWaveExhibit(): void {
    const starterCoords: [number, number][] = [
      [13, 2],
      [13, 3],
    ];
    for (const [gx, gz] of starterCoords) {
      if (this.grid[gx]?.[gz] === null) {
        const mesh = this.createFacilityMesh('waveexhibit', gx, gz);
        this.scene.add(mesh);
        this.grid[gx][gz] = { type: 'facility', facilityKey: 'waveexhibit', mesh, gx, gz };
        this.wavePools.push(mesh);
      }
    }
  }

  private updateWaterWaves(dt: number): void {
    this.waveTime += dt;

    // 1. 島嶼周圍海面波浪起伏
    const oceanPos = this.oceanMesh.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < oceanPos.count; i++) {
      const x = oceanPos.getX(i);
      const y = oceanPos.getY(i);
      const z =
        Math.sin(x * 0.12 + this.waveTime * 1.45) * 0.18 +
        Math.cos(y * 0.14 - this.waveTime * 1.15) * 0.14;
      oceanPos.setZ(i, z);
    }
    oceanPos.needsUpdate = true;
    this.oceanMesh.geometry.computeVertexNormals();

    // 2. 園內各「水波展區」動態波浪與擴散水波紋
    for (const pool of this.wavePools) {
      const waveMesh = pool.userData.waveMesh as THREE.Mesh | undefined;
      if (waveMesh) {
        const wPos = waveMesh.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < wPos.count; i++) {
          const x = wPos.getX(i);
          const z = wPos.getZ(i);
          const wy =
            Math.sin(x * 4.2 + this.waveTime * 3.4) * 0.032 +
            Math.cos(z * 4.5 - this.waveTime * 2.8) * 0.026;
          wPos.setY(i, wy);
        }
        wPos.needsUpdate = true;
        waveMesh.geometry.computeVertexNormals();
      }

      const rings = pool.userData.rippleRings as THREE.Mesh[] | undefined;
      if (rings) {
        for (const ring of rings) {
          const off = (ring.userData.phaseOffset as number) || 0;
          const phase = ((this.waveTime * 0.65 + off) % 1 + 1) % 1;
          const scale = 0.55 + phase * 2.05;
          ring.scale.set(scale, scale, 1);
          const mat = ring.material as THREE.MeshBasicMaterial;
          mat.opacity = (1 - phase) * 0.65;
        }
      }
    }
  }

  // ===========================================================================
  // Public API for React UI
  // ===========================================================================
  public setTool(mode: ToolMode, opts?: { dinoType?: number; facilityKey?: FacilityKey }): void {
    this.activeTool = mode;
    if (opts?.dinoType !== undefined) this.selectedDinoType = opts.dinoType;
    if (opts?.facilityKey !== undefined) this.selectedFacilityKey = opts.facilityKey;
    this.hoverIndicator.visible = false;
    this.emitSnapshot();
  }

  public resetCamera(): void {
    if (this.cameraMode === 'first_person') {
      this.setCameraMode('overview');
    }
    this.camera.position.copy(this.DEFAULT_CAM_POS);
    this.controls.target.copy(this.DEFAULT_CAM_TARGET);
    this.controls.update();
    this.callbacks.onToast('已重置為斜 45 度俯瞰視角', 'info');
  }

  public setCameraMode(mode: CameraMode): void {
    if (this.cameraMode === mode) return;
    if (mode === 'first_person') {
      this.savedOverviewCamPos.copy(this.camera.position);
      this.savedOverviewTarget.copy(this.controls.target);
      this.controls.enabled = false;
      this.hoverIndicator.visible = false;
      this.cameraMode = 'first_person';
      this.camera.position.set(0, 1.65, 13.5);
      this.fpYaw = 0;
      this.fpPitch = -0.04;
      this.fpWalkPhase = 0;
      this.fpKeys.clear();
      this.updateFirstPersonOrientation();
      this.callbacks.onToast('已進入第一人稱遊客視角：使用 WASD / 方向鍵移動、滑鼠拖曳環顧園區', 'info');
    } else {
      this.cameraMode = 'overview';
      this.fpKeys.clear();
      this.fpDragging = false;
      this.camera.position.copy(this.savedOverviewCamPos);
      this.controls.target.copy(this.savedOverviewTarget);
      this.controls.enabled = true;
      this.controls.update();
      this.callbacks.onToast('已返回俯瞰經營視角', 'info');
    }
    this.emitSnapshot();
  }

  public toggleCameraMode(): void {
    this.setCameraMode(this.cameraMode === 'overview' ? 'first_person' : 'overview');
  }

  public moveFirstPersonStep(forward: number, strafe: number): void {
    if (this.cameraMode !== 'first_person') return;
    this.applyFirstPersonDisplacement(forward * 1.15, strafe * 1.15, 0.16);
  }

  public capturePhoto(): string | null {
    try {
      this.renderer.render(this.scene, this.camera);
      this.soundEffects.playCameraShutter();
      const dataUrl = this.renderer.domElement.toDataURL('image/png');
      this.callbacks.onToast('已拍下園區實景照片！', 'success');
      return dataUrl;
    } catch {
      this.callbacks.onToast('拍照失敗，無法擷取畫面', 'error');
      return null;
    }
  }

  public unlockTech(techId: TechId): void {
    const node = TECH_TREE.find((t) => t.id === techId);
    if (!node) return;
    if (this.unlockedTechs.has(techId)) {
      this.callbacks.onToast(`「${node.name}」已經完成研究了`, 'info');
      return;
    }
    if (node.prerequisite && !this.unlockedTechs.has(node.prerequisite)) {
      const pre = TECH_TREE.find((t) => t.id === node.prerequisite);
      this.callbacks.onToast(`請先完成前置研究「${pre?.name || node.prerequisite}」`, 'warn');
      return;
    }
    if (this.money < node.cost) {
      this.callbacks.onToast(`研究資金不足！「${node.name}」需要 $${node.cost}`, 'error');
      return;
    }

    this.money -= node.cost;
    this.unlockedTechs.add(techId);
    this.soundEffects.playTechUnlock();

    if (node.unlockSpeciesId) {
      this.unlockedSpeciesIds.add(node.unlockSpeciesId);
    }

    if (techId === 'fence_titanium' || techId === 'fence_plasma') {
      this.fenceTier = techId === 'fence_plasma' ? 3 : 2;
      this.upgradeAllFencesOnGrid();
    }

    if (techId === 'staff_cleaner_boost') {
      for (const s of this.staff) {
        if (s.role === 'cleaner') s.speed = 4.3;
      }
    } else if (techId === 'staff_keeper_boost') {
      for (const s of this.staff) {
        if (s.role === 'keeper') s.speed = 4.0;
      }
    } else if (techId === 'staff_security_boost') {
      for (const s of this.staff) {
        if (s.role === 'security') s.speed = 3.5;
      }
    }

    for (const d of this.dinosaurs) {
      this.updateDinoPerformance(d);
    }

    this.callbacks.onToast(`研究完成！已解鎖「${node.name}」`, 'success');
    this.recalcMetrics();
    this.emitSnapshot();
  }

  private upgradeAllFencesOnGrid(): void {
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        const cell = this.grid[x][z];
        if (!cell || cell.type !== 'fence') continue;
        this.scene.remove(cell.mesh);
        const nextMesh = createFenceMesh(this.fenceTier);
        nextMesh.position.copy(gridToWorld(x, z));
        nextMesh.userData.gx = x;
        nextMesh.userData.gz = z;
        nextMesh.traverse((child) => {
          child.userData.cellCoords = { gx: x, gz: z };
        });
        this.scene.add(nextMesh);
        cell.mesh = nextMesh;
      }
    }
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        if (this.grid[x][z]?.type === 'fence') {
          refreshFenceAndNeighbors(this.grid, x, z, this.fenceTier);
        }
      }
    }
  }

  public resolveArenaBattle(
    dinoAId: number,
    dinoBId: number,
    winnerId: number
  ): { prize: number; popularityGain: number; winnerName: string } | null {
    const dinoA = this.dinosaurs.find((d) => d.id === dinoAId);
    const dinoB = this.dinosaurs.find((d) => d.id === dinoBId);
    const winner = this.dinosaurs.find((d) => d.id === winnerId);
    if (!dinoA || !dinoB || !winner || dinoAId === dinoBId) return null;

    const basePrize = 450 + Math.round((dinoA.config.cost + dinoB.config.cost) * 0.22);
    const secMultiplier = this.unlockedTechs.has('staff_security_boost') ? 1.25 : 1.0;
    const prize = Math.round(basePrize * secMultiplier);

    this.money += prize;
    this.currentFinance.shopRevenue += prize;
    this.recordRevenue(prize);

    const prevBonus = this.arenaPopularityBonus;
    this.arenaPopularityBonus = Math.min(12, this.arenaPopularityBonus + 3);
    const popularityGain = this.arenaPopularityBonus - prevBonus;

    winner.arenaWins += 1;
    winner.totalViews += 5;
    winner.totalRevenue += prize;
    this.updateDinoPerformance(winner);

    this.soundEffects.playArenaVictory();
    this.callbacks.onToast(
      `🏆 競技場對決結束！「${winner.config.name}」奪冠，獲得獎金 +$${prize} 與園區人氣加成！`,
      'success'
    );
    this.recalcMetrics();
    this.emitSnapshot();
    return { prize, popularityGain, winnerName: winner.config.name };
  }

  public playArenaImpact(heavy = false): void {
    this.soundEffects.playArenaImpact(heavy);
  }

  public playDinoRoar(speciesType: number): void {
    this.soundEffects.playDinoCall(speciesType, 'spawn');
  }

  public setTimeMode(mode: TimeMode): void {
    this.timeMode = mode;
    if (mode === 'morning') this.dayProgress = 0.34;
    else if (mode === 'afternoon') this.dayProgress = 0.58;
    else if (mode === 'dusk') this.dayProgress = 0.77;
    else if (mode === 'night') this.dayProgress = 0.96;

    this.updateDayNight(0);
    this.emitSnapshot();
  }

  public setDayCycleDuration(seconds: number): void {
    const clamped = Math.max(
      MIN_DAY_CYCLE_SECONDS,
      Math.min(MAX_DAY_CYCLE_SECONDS, Math.round(seconds))
    );
    this.dayCycleDuration = clamped;
    this.emitSnapshot();
  }

  public setParkName(name: string): void {
    const trimmed = name.trim().slice(0, MAX_PARK_NAME_LENGTH);
    this.parkName = trimmed || DEFAULT_PARK_NAME;
    this.gateSignage?.updateSignage(this.parkName, this.ticketPrice);
    this.callbacks.onToast(`大門名稱已更新為「${this.parkName}」`, 'success');
    this.emitSnapshot();
  }

  public setTicketPrice(price: number): void {
    const clamped = Math.max(
      MIN_TICKET_PRICE,
      Math.min(MAX_TICKET_PRICE, Math.round(price))
    );
    if (clamped === this.ticketPrice) return;
    this.ticketPrice = clamped;
    this.gateSignage?.updateSignage(this.parkName, this.ticketPrice);
    this.recalcMetrics();
    this.emitSnapshot();
  }

  public toggleSoundMuted(): void {
    const muted = this.soundEffects.toggleMuted();
    this.callbacks.onToast(muted ? '已靜音園區音效' : '已開啟園區音效', 'info');
    this.emitSnapshot();
  }

  public setSoundVolume(percent: number): void {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    this.soundEffects.setVolume(clamped / 100);
    this.emitSnapshot();
  }

  public setWeatherMode(mode: WeatherMode): void {
    this.weatherMode = mode;
    if (mode === 'auto') {
      this.weatherTimer = DEFAULT_WEATHER_STAGE_SECONDS;
      this.callbacks.onToast('已切換為天氣自動循環模式', 'info');
    } else {
      this.applyWeatherTransition(mode);
    }
    this.updateDayNight(0);
    this.updateWeather(0);
    this.recalcMetrics();
    this.emitSnapshot();
  }

  public hireStaff(role: StaffRole): void {
    const cfg = STAFF_CONFIGS[role];
    if (this.money < cfg.hireCost) {
      this.callbacks.onToast(`資金不足！聘僱${cfg.name}需要 $${cfg.hireCost}`, 'error');
      return;
    }
    this.money -= cfg.hireCost;
    const mesh = createStaffMesh(role);
    const entry = ENTRANCE_CELLS[0];
    const startPos = gridToWorld(entry.gx, entry.gz);
    mesh.position.set(startPos.x, 0, startPos.z);
    this.scene.add(mesh);

    const staffSpeed =
      role === 'cleaner'
        ? this.unlockedTechs.has('staff_cleaner_boost')
          ? 4.3
          : 2.8
        : role === 'keeper'
          ? this.unlockedTechs.has('staff_keeper_boost')
            ? 4.0
            : 2.6
          : this.unlockedTechs.has('staff_security_boost')
            ? 3.5
            : 2.5;

    this.staff.push({
      id: this.nextId++,
      role,
      mesh,
      gx: entry.gx,
      gz: entry.gz,
      path: [],
      workTimer: 0.5,
      targetLitterId: null,
      targetDinoId: null,
      speed: staffSpeed,
      animPhase: Math.random() * Math.PI * 2,
    });

    this.callbacks.onToast(`已聘僱一位${cfg.name}上崗工作！`, 'success');
    this.recalcMetrics();
    this.emitSnapshot();
  }

  public fireStaff(role: StaffRole): void {
    const idx = this.staff.findIndex((s) => s.role === role);
    if (idx === -1) return;
    const removed = this.staff[idx];
    this.scene.remove(removed.mesh);
    this.staff.splice(idx, 1);
    this.callbacks.onToast(`已解僱一名${STAFF_CONFIGS[role].name}`, 'info');
    this.recalcMetrics();
    this.emitSnapshot();
  }

  public buyFeedPack(): void {
    if (this.money < FEED_PACK_COST) {
      this.callbacks.onToast(`資金不足！購買飼料需要 $${FEED_PACK_COST}`, 'error');
      return;
    }
    this.money -= FEED_PACK_COST;
    this.feedStock += FEED_PACK_AMOUNT;
    this.currentFinance.feedCost += FEED_PACK_COST;
    this.callbacks.onToast(`已採購 +${FEED_PACK_AMOUNT} 單位恐龍飼料`, 'success');
    this.emitSnapshot();
  }

  public toggleAutoBuyFeed(): void {
    this.autoBuyFeed = !this.autoBuyFeed;
    this.emitSnapshot();
  }

  public feedSingleDino(dinoId: number): void {
    const dino = this.dinosaurs.find((d) => d.id === dinoId);
    if (!dino) return;
    const feedUsed = this.unlockedTechs.has('staff_keeper_boost') ? 5 : 10;
    if (this.feedStock < feedUsed) {
      if (this.autoBuyFeed && this.money >= FEED_PACK_COST) {
        this.money -= FEED_PACK_COST;
        this.feedStock += FEED_PACK_AMOUNT;
        this.currentFinance.feedCost += FEED_PACK_COST;
      } else {
        this.callbacks.onToast(`飼料庫存不足 ${feedUsed} 單位，請先採購飼料！`, 'warn');
        return;
      }
    }
    this.feedStock -= feedUsed;
    dino.satiety = Math.min(100, dino.satiety + 45);
    dino.growth = Math.min(100, dino.growth + 25);
    this.triggerDinoEating(dino, 2.8);
    this.updateDinoPerformance(dino);
    this.soundEffects.playDinoFeed(dino.type, dino.mesh.position, dino.mesh);
    this.spawnPopup(dino.mesh.position, '🥩 餵食完成', 'shop');
    this.callbacks.onToast(`已餵食 ${dino.config.name}，表現與成長度提升！`, 'success');
    this.recalcMetrics();
    this.emitSnapshot();
  }

  public sellSingleDino(dinoId: number): void {
    const idx = this.dinosaurs.findIndex((d) => d.id === dinoId);
    if (idx === -1) return;
    const dino = this.dinosaurs[idx];
    this.disposeDinoMixer(dino);
    this.scene.remove(dino.mesh);
    this.dinosaurs.splice(idx, 1);
    const refund = Math.floor(dino.config.cost * 0.5);
    this.money += refund;
    this.callbacks.onToast(`已回收 ${dino.config.name}，退還 $${refund}`, 'info');
    this.recalcMetrics();
    this.emitSnapshot();
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    for (const dino of this.dinosaurs) {
      this.disposeDinoMixer(dino);
    }
    this.dinoGltfCache.clear();
    this.visitorListeners.clear();
    this.soundEffects.dispose();
    this.weatherSystem?.dispose();
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.renderer.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.removeEventListener('pointerup', this.onPointerUp);
    this.controls.dispose();
    this.moonTexture.dispose();
    this.starMaterial.dispose();
    this.starField.geometry.dispose();
    this.gateSignage?.dispose();
    if (this.envMap) this.envMap.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  // ===========================================================================
  // Day-Night Cycle & Celestial Sky (Rotating Moon, Sky & AmbientLight)
  // ===========================================================================
  private buildCelestialSky(): void {
    // Procedural cratered Moon CanvasTexture
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(0, 0, 256, 128);

    // Maria patches & craters so moon rotation is clearly visible
    const craters = [
      { x: 48, y: 42, r: 22, c: 'rgba(148, 163, 184, 0.55)' },
      { x: 118, y: 58, r: 28, c: 'rgba(100, 116, 139, 0.50)' },
      { x: 192, y: 38, r: 19, c: 'rgba(148, 163, 184, 0.55)' },
      { x: 76, y: 88, r: 15, c: 'rgba(100, 116, 139, 0.45)' },
      { x: 164, y: 84, r: 24, c: 'rgba(148, 163, 184, 0.52)' },
      { x: 228, y: 74, r: 14, c: 'rgba(100, 116, 139, 0.48)' },
    ];
    for (const cr of craters) {
      ctx.beginPath();
      ctx.arc(cr.x, cr.y, cr.r, 0, Math.PI * 2);
      ctx.fillStyle = cr.c;
      ctx.fill();
    }
    for (let i = 0; i < 40; i++) {
      const cx = (i * 59 + 17) % 256;
      const cy = (i * 37 + 13) % 128;
      const rr = 2 + (i % 5);
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(71, 85, 105, 0.4)' : 'rgba(248, 250, 252, 0.45)';
      ctx.fill();
    }

    this.moonTexture = new THREE.CanvasTexture(canvas);
    this.moonTexture.colorSpace = THREE.SRGBColorSpace;

    this.moonGroup = new THREE.Group();
    this.moonMesh = new THREE.Mesh(
      new THREE.SphereGeometry(3.2, 24, 18),
      new THREE.MeshStandardMaterial({
        map: this.moonTexture,
        emissive: 0xcbd5e1,
        emissiveIntensity: 0.42,
        roughness: 0.85,
        metalness: 0.05,
        fog: false,
      })
    );
    this.moonMesh.rotation.z = 0.22;
    this.moonGroup.add(this.moonMesh);

    const moonHalo = new THREE.Mesh(
      new THREE.SphereGeometry(4.3, 18, 14),
      new THREE.MeshBasicMaterial({
        color: 0xe0f2fe,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        fog: false,
      })
    );
    this.moonGroup.add(moonHalo);
    this.scene.add(this.moonGroup);

    this.sunMesh = new THREE.Mesh(
      new THREE.SphereGeometry(2.6, 18, 14),
      new THREE.MeshBasicMaterial({
        color: 0xfef08a,
        fog: false,
      })
    );
    this.scene.add(this.sunMesh);

    // Night starfield dome
    const starCount = 220;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const theta = ((i * 137.5) % 360) * (Math.PI / 180);
      const phi = Math.acos(0.18 + ((i * 29) % 80) / 100);
      const rad = 74;
      positions[i * 3] = rad * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = rad * Math.cos(phi) + 4;
      positions[i * 3 + 2] = rad * Math.sin(phi) * Math.sin(theta);
    }
    const starGeo = new THREE.BufferGeometry();
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.starMaterial = new THREE.PointsMaterial({
      color: 0xf8fafc,
      size: 0.85,
      transparent: true,
      opacity: 0,
      fog: false,
      depthWrite: false,
    });
    this.starField = new THREE.Points(starGeo, this.starMaterial);
    this.scene.add(this.starField);
  }

  private getDayPhase(p: number): DayPhase {
    if (p >= 0.25 && p < 0.5) return 'morning';
    if (p >= 0.5 && p < 0.72) return 'afternoon';
    if (p >= 0.72 && p < 0.85) return 'dusk';
    return 'night';
  }

  private formatClockLabel(p: number): string {
    const totalMinutes = Math.floor(((p % 1) + 1) % 1 * 24 * 60);
    const hh = Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  private updateDayNight(dt: number): void {
    if (this.timeMode === 'auto' && dt > 0) {
      this.dayProgress = (this.dayProgress + dt / this.dayCycleDuration) % 1;
    }

    const p = this.dayProgress;

    // Celestial orbit: Sun peaks at noon (p=0.5), Moon peaks at midnight (p=0.0/1.0)
    const sunAngle = (p - 0.25) * Math.PI * 2;
    const moonAngle = sunAngle + Math.PI;
    const orbitRadius = 48;

    this.sunMesh.position.set(
      Math.cos(sunAngle) * orbitRadius,
      Math.sin(sunAngle) * 34,
      -26
    );
    this.sunMesh.visible = this.sunMesh.position.y > -2;

    this.moonGroup.position.set(
      Math.cos(moonAngle) * orbitRadius,
      Math.sin(moonAngle) * 28 + 6,
      -28
    );
    this.moonGroup.visible = this.moonGroup.position.y > -4;
    // Rotate moon mesh continuously in the sky
    this.moonMesh.rotation.y += Math.max(dt, 0.016) * 0.35;
    this.starField.rotation.y += dt * 0.012;

    // Keyframed atmosphere & lighting interpolation
    const keyframes = [
      {
        t: 0.0,
        sky: 0x0b132b,
        amb: 0x64748b,
        ambI: 0.28,
        hemiS: 0x1e293b,
        hemiG: 0x0f172a,
        hemiI: 0.26,
        sun: 0x93c5fd,
        sunI: 0.45,
        star: 0.92,
      },
      {
        t: 0.22,
        sky: 0xfdba74,
        amb: 0xfde68a,
        ambI: 0.36,
        hemiS: 0xfed7aa,
        hemiG: 0x3f6212,
        hemiI: 0.4,
        sun: 0xfed7aa,
        sunI: 0.78,
        star: 0.22,
      },
      {
        t: 0.34,
        sky: 0x93c5fd,
        amb: 0xffffff,
        ambI: 0.45,
        hemiS: 0xe0f2fe,
        hemiG: 0x3f6212,
        hemiI: 0.5,
        sun: 0xfffbeb,
        sunI: 1.05,
        star: 0.0,
      },
      {
        t: 0.58,
        sky: 0x60a5fa,
        amb: 0xfffbeb,
        ambI: 0.54,
        hemiS: 0xfef9c3,
        hemiG: 0x4d7c0f,
        hemiI: 0.54,
        sun: 0xfef3c7,
        sunI: 1.18,
        star: 0.0,
      },
      {
        t: 0.77,
        sky: 0xea6d3b,
        amb: 0xfdba74,
        ambI: 0.35,
        hemiS: 0xfb923c,
        hemiG: 0x27272a,
        hemiI: 0.38,
        sun: 0xfb923c,
        sunI: 0.82,
        star: 0.42,
      },
      {
        t: 0.9,
        sky: 0x0b132b,
        amb: 0x64748b,
        ambI: 0.28,
        hemiS: 0x1e293b,
        hemiG: 0x0f172a,
        hemiI: 0.26,
        sun: 0x93c5fd,
        sunI: 0.45,
        star: 0.92,
      },
      {
        t: 1.0,
        sky: 0x0b132b,
        amb: 0x64748b,
        ambI: 0.28,
        hemiS: 0x1e293b,
        hemiG: 0x0f172a,
        hemiI: 0.26,
        sun: 0x93c5fd,
        sunI: 0.45,
        star: 0.92,
      },
    ];

    let k0 = keyframes[0];
    let k1 = keyframes[1];
    for (let i = 0; i < keyframes.length - 1; i++) {
      if (p >= keyframes[i].t && p <= keyframes[i + 1].t) {
        k0 = keyframes[i];
        k1 = keyframes[i + 1];
        break;
      }
    }
    const span = Math.max(0.0001, k1.t - k0.t);
    const alpha = THREE.MathUtils.clamp((p - k0.t) / span, 0, 1);

    this.skyScratch.setHex(k0.sky).lerp(this.ambScratch.setHex(k1.sky), alpha);
    (this.scene.background as THREE.Color).copy(this.skyScratch);
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(this.skyScratch);
    }

    this.ambientLight.color.setHex(k0.amb).lerp(this.ambScratch.setHex(k1.amb), alpha);
    this.ambientLight.intensity = THREE.MathUtils.lerp(k0.ambI, k1.ambI, alpha);

    this.hemiLight.color.setHex(k0.hemiS).lerp(this.hemiSkyScratch.setHex(k1.hemiS), alpha);
    this.hemiLight.groundColor
      .setHex(k0.hemiG)
      .lerp(this.hemiGroundScratch.setHex(k1.hemiG), alpha);
    this.hemiLight.intensity = THREE.MathUtils.lerp(k0.hemiI, k1.hemiI, alpha);

    this.sunLight.color.setHex(k0.sun).lerp(this.sunScratch.setHex(k1.sun), alpha);
    this.sunLight.intensity = THREE.MathUtils.lerp(k0.sunI, k1.sunI, alpha);

    // Keep directional light elevated enough for clean island shadows both day & night
    const isNightish = p < 0.24 || p >= 0.84;
    const activeAngle = isNightish ? moonAngle : sunAngle;
    this.sunLight.position.set(
      Math.cos(activeAngle) * 28,
      Math.max(16, Math.abs(Math.sin(activeAngle)) * 34 + 10),
      isNightish ? -18 : 18
    );

    this.rimLight.intensity = isNightish ? 0.22 : 0.35;
    this.starMaterial.opacity = THREE.MathUtils.lerp(k0.star, k1.star, alpha);
    this.starField.visible = this.starMaterial.opacity > 0.03;
  }

  private applyWeatherTransition(nextWeather: WeatherType): void {
    if (this.currentWeather === nextWeather) return;
    this.currentWeather = nextWeather;
    const idx = WEATHER_CYCLE_ORDER.indexOf(nextWeather);
    if (idx !== -1) this.weatherCycleIndex = idx;

    if (nextWeather === 'rainy') {
      // 下雨時部分已入園遊客會縮短行程準備離場
      for (const v of this.visitors) {
        if (v.viewsLeft > 1 && Math.random() < 0.6) {
          v.viewsLeft = 1;
        }
      }
      this.callbacks.onToast('🌧️ 天氣轉為雨天，遊客入園意願降低、在園人數減少！', 'warn');
    } else if (nextWeather === 'foggy') {
      this.callbacks.onToast('🌫️ 園區起大霧，恐龍區籠罩在迷霧之中。', 'info');
    } else {
      this.callbacks.onToast('☀️ 雨過天晴！陽光普照，遊客大量湧入公園。', 'success');
    }
  }

  private updateWeather(dt: number): void {
    if (this.weatherMode === 'auto' && dt > 0) {
      this.weatherTimer -= dt;
      if (this.weatherTimer <= 0) {
        this.weatherTimer = DEFAULT_WEATHER_STAGE_SECONDS;
        const nextIdx = (this.weatherCycleIndex + 1) % WEATHER_CYCLE_ORDER.length;
        this.applyWeatherTransition(WEATHER_CYCLE_ORDER[nextIdx]);
        this.recalcMetrics();
      }
    }

    const mods = this.weatherSystem.update(dt, this.currentWeather, this.scene, this.skyScratch);
    this.sunLight.intensity *= mods.sunMultiplier;
    this.ambientLight.intensity *= mods.ambientMultiplier;
    this.hemiLight.intensity *= mods.hemiMultiplier;
    this.starMaterial.opacity *= 1 - mods.starSuppression * 0.85;
    this.starField.visible = this.starMaterial.opacity > 0.03;
    if (!mods.sunVisible) {
      this.sunMesh.visible = false;
    }
  }

  // ===========================================================================
  // Events & Raycasting + First-Person Camera Controls
  // ===========================================================================
  private bindEvents(): void {
    window.addEventListener('resize', this.onResize);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.renderer.domElement.addEventListener('pointermove', this.onPointerMove);
    this.renderer.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.renderer.domElement.addEventListener('pointerup', this.onPointerUp);
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    if (this.cameraMode !== 'first_person') return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;

    const key = e.key.toLowerCase();
    if (key === 'escape') {
      this.setCameraMode('overview');
      return;
    }
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      this.fpKeys.add(key);
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.fpKeys.delete(e.key.toLowerCase());
  };

  private updateFirstPersonOrientation(): void {
    const dirX = -Math.sin(this.fpYaw) * Math.cos(this.fpPitch);
    const dirY = Math.sin(this.fpPitch);
    const dirZ = -Math.cos(this.fpYaw) * Math.cos(this.fpPitch);
    this.camera.lookAt(
      this.camera.position.x + dirX * 5,
      this.camera.position.y + dirY * 5,
      this.camera.position.z + dirZ * 5
    );
  }

  private isPositionWalkableInFirstPerson(wx: number, wz: number): boolean {
    if (wx < -15.3 || wx > 15.3 || wz < -15.3 || wz > 17.6) return false;
    const g = worldToGrid(wx, wz);
    if (!g) return wz >= 15.2 && wz <= 17.6 && Math.abs(wx) <= 2.4;
    const cell = this.grid[g.gx]?.[g.gz];
    if (!cell) return true;
    // 不可直接穿過高壓圍欄或非水波展區實體建築
    return false;
  }

  private applyFirstPersonDisplacement(forwardAmt: number, strafeAmt: number, dt: number): void {
    if (Math.abs(forwardAmt) < 0.001 && Math.abs(strafeAmt) < 0.001) return;

    const fwdX = -Math.sin(this.fpYaw);
    const fwdZ = -Math.cos(this.fpYaw);
    const rightX = Math.cos(this.fpYaw);
    const rightZ = -Math.sin(this.fpYaw);

    let dx = fwdX * forwardAmt + rightX * strafeAmt;
    let dz = fwdZ * forwardAmt + rightZ * strafeAmt;
    const mag = Math.hypot(dx, dz);
    if (mag > 1) {
      dx /= mag;
      dz /= mag;
    }

    const speed = 5.4;
    const stepX = dx * speed * dt;
    const stepZ = dz * speed * dt;

    const nextX = this.camera.position.x + stepX;
    const nextZ = this.camera.position.z + stepZ;

    let moved = false;
    if (this.isPositionWalkableInFirstPerson(nextX, this.camera.position.z)) {
      this.camera.position.x = nextX;
      moved = true;
    }
    if (this.isPositionWalkableInFirstPerson(this.camera.position.x, nextZ)) {
      this.camera.position.z = nextZ;
      moved = true;
    }

    if (moved) {
      this.fpWalkPhase += dt * 10.5;
      this.camera.position.y = 1.65 + Math.sin(this.fpWalkPhase) * 0.032;
    }
  }

  private updateFirstPersonCamera(dt: number): void {
    let fwd = 0;
    let strafe = 0;
    if (this.fpKeys.has('w') || this.fpKeys.has('arrowup')) fwd += 1;
    if (this.fpKeys.has('s') || this.fpKeys.has('arrowdown')) fwd -= 1;
    if (this.fpKeys.has('d') || this.fpKeys.has('arrowright')) strafe += 1;
    if (this.fpKeys.has('a') || this.fpKeys.has('arrowleft')) strafe -= 1;

    if (fwd !== 0 || strafe !== 0) {
      this.applyFirstPersonDisplacement(fwd, strafe, dt);
    } else {
      this.camera.position.y = THREE.MathUtils.lerp(this.camera.position.y, 1.65, dt * 8);
    }

    this.updateFirstPersonOrientation();
  }

  private onResize = (): void => {
    const w = Math.max(this.container.clientWidth, window.innerWidth);
    const h = Math.max(this.container.clientHeight, window.innerHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private onPointerMove = (e: PointerEvent): void => {
    if (this.cameraMode === 'first_person') {
      if (this.fpDragging) {
        const dx = e.clientX - this.fpLastPointer.x;
        const dy = e.clientY - this.fpLastPointer.y;
        this.fpLastPointer = { x: e.clientX, y: e.clientY };
        this.fpYaw -= dx * 0.0052;
        this.fpPitch = THREE.MathUtils.clamp(this.fpPitch - dy * 0.004, -0.68, 0.72);
        this.updateFirstPersonOrientation();
      }
      return;
    }

    const now = performance.now();
    if (now - this.lastHoverRaycast < 28) return;
    this.lastHoverRaycast = now;
    this.updatePointerHover(e.clientX, e.clientY);
  };

  private onPointerDown = (e: PointerEvent): void => {
    this.soundEffects.unlock();
    if (e.button === 0) {
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
      if (this.cameraMode === 'first_person') {
        this.fpDragging = true;
        this.fpLastPointer = { x: e.clientX, y: e.clientY };
      }
    }
  };

  private onPointerUp = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    if (this.cameraMode === 'first_person') {
      this.fpDragging = false;
      return;
    }

    const dist = Math.hypot(e.clientX - this.pointerDownPos.x, e.clientY - this.pointerDownPos.y);
    if (dist >= 6) return;

    // In inspect mode, allow clicking directly on any dinosaur mesh, arena facility, the main gate, OR grass tile under dinosaur
    if (this.activeTool === 'inspect') {
      this.updateNDC(e.clientX, e.clientY);
      this.raycaster.setFromCamera(this.pointerNDC, this.camera);
      const dinoMeshes = this.dinosaurs.map((d) => d.mesh);
      const dinoHits = this.raycaster.intersectObjects(dinoMeshes, true);
      if (dinoHits.length > 0) {
        let obj: THREE.Object3D | null = dinoHits[0].object;
        while (obj && obj.parent && obj.parent !== this.scene) {
          obj = obj.parent;
        }
        const clickedDino = this.dinosaurs.find((d) => d.mesh === obj);
        if (clickedDino) {
          this.callbacks.onSelectDinoForShowcase(clickedDino.id, clickedDino.type);
          return;
        }
      }

      if (this.gateSignage) {
        const gateHits = this.raycaster.intersectObject(this.gateSignage.gateGroup, true);
        if (gateHits.length > 0) {
          this.callbacks.onOpenGateSettings?.();
          return;
        }
      }

      // 點擊恐龍競技場設施時直接開啟 3D 對決模擬面板
      const arenaMeshes: THREE.Object3D[] = [];
      for (let x = 0; x < GRID_SIZE; x++) {
        for (let z = 0; z < GRID_SIZE; z++) {
          const c = this.grid[x][z];
          if (c && c.type === 'facility' && c.facilityKey === 'arena') {
            arenaMeshes.push(c.mesh);
          }
        }
      }
      if (arenaMeshes.length > 0) {
        const arenaHits = this.raycaster.intersectObjects(arenaMeshes, true);
        if (arenaHits.length > 0) {
          this.callbacks.onOpenArena?.();
          return;
        }
      }

      this.updatePointerHover(e.clientX, e.clientY);
      if (this.hoveredCell) {
        const dino = this.findDinoAtCell(this.hoveredCell.gx, this.hoveredCell.gz);
        if (dino) {
          this.callbacks.onSelectDinoForShowcase(dino.id, dino.type);
        }
      }
      return;
    }

    this.updatePointerHover(e.clientX, e.clientY);
    if (this.hoveredCell) {
      this.handleGridClick(this.hoveredCell.gx, this.hoveredCell.gz);
    }
  };

  private updateNDC(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
  }

  private raycastCellAtPointer(clientX: number, clientY: number): { gx: number; gz: number } | null {
    this.updateNDC(clientX, clientY);
    this.raycaster.setFromCamera(this.pointerNDC, this.camera);

    // 拆除模式下優先偵測場上立體設施（如護理站、服務站屋頂）與柵欄，確保點擊建築本體即可命中該格
    if (this.activeTool === 'demolish') {
      const structureMeshes: THREE.Object3D[] = [];
      for (let x = 0; x < GRID_SIZE; x++) {
        for (let z = 0; z < GRID_SIZE; z++) {
          const cell = this.grid[x][z];
          if (cell) structureMeshes.push(cell.mesh);
        }
      }
      if (structureMeshes.length > 0) {
        const structHits = this.raycaster.intersectObjects(structureMeshes, true);
        if (structHits.length > 0) {
          let cur: THREE.Object3D | null = structHits[0].object;
          while (cur) {
            const coords = cur.userData?.cellCoords as { gx: number; gz: number } | undefined;
            if (coords) return coords;
            if (typeof cur.userData?.gx === 'number' && typeof cur.userData?.gz === 'number') {
              return { gx: cur.userData.gx, gz: cur.userData.gz };
            }
            cur = cur.parent;
          }
        }
      }
    }

    const hits = this.raycaster.intersectObjects(this.grassTileMeshes, false);
    if (hits.length === 0) return null;
    const { gx, gz } = hits[0].object.userData as { gx: number; gz: number };
    return { gx, gz };
  }

  private updatePointerHover(clientX: number, clientY: number): void {
    const cell = this.raycastCellAtPointer(clientX, clientY);
    if (!cell) {
      this.hoverIndicator.visible = false;
      this.hoveredCell = null;
      return;
    }

    const { gx, gz } = cell;
    this.hoveredCell = { gx, gz };

    if (this.activeTool === 'inspect') {
      this.hoverIndicator.visible = false;
      return;
    }

    const worldPos = gridToWorld(gx, gz);
    this.hoverIndicator.position.set(worldPos.x, 0.08, worldPos.z);
    this.hoverIndicator.visible = true;

    const mat = this.hoverIndicator.material as THREE.MeshBasicMaterial;
    if (this.activeTool === 'demolish') {
      const hasObj = this.grid[gx][gz] !== null || this.findDinoAtCell(gx, gz) !== null;
      mat.color.setHex(hasObj ? 0xf59e0b : 0x64748b);
    } else if (this.activeTool === 'dino') {
      const ok =
        this.canBuildAtCell(gx, gz) &&
        this.checkDinoEnclosureCompatibility(gx, gz, this.selectedDinoType).ok;
      mat.color.setHex(ok ? 0x10b981 : 0xef4444);
    } else {
      mat.color.setHex(this.canBuildAtCell(gx, gz) ? 0x10b981 : 0xef4444);
    }
  }

  // ===========================================================================
  // Enclosure Region & Coexistence Rules (區域共處規定)
  // ===========================================================================
  private getRegionCells(startGx: number, startGz: number): Set<string> {
    const region = new Set<string>();
    if (this.grid[startGx]?.[startGz]?.type === 'fence') return region;

    const queue: [number, number][] = [[startGx, startGz]];
    region.add(`${startGx},${startGz}`);
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    while (queue.length > 0) {
      const [cx, cz] = queue.shift()!;
      for (const [dx, dz] of dirs) {
        const nx = cx + dx;
        const nz = cz + dz;
        if (nx < 0 || nx >= GRID_SIZE || nz < 0 || nz >= GRID_SIZE) continue;
        const key = `${nx},${nz}`;
        if (region.has(key)) continue;
        const cell = this.grid[nx][nz];
        if (cell && cell.type === 'fence') continue;
        region.add(key);
        queue.push([nx, nz]);
      }
    }
    return region;
  }

  /**
   * 恐龍區域規定：
   * - 不同肉食恐龍品種不可放在同一區域（例如暴龍不可與迅猛龍或棘龍同區）。
   * - 同品種肉食恐龍可以同區；肉食恐龍可以與草食及飛行恐龍放在同一區域。
   */
  private checkDinoEnclosureCompatibility(
    gx: number,
    gz: number,
    newDinoType: number
  ): { ok: boolean; reason?: string } {
    const newCfg = DINO_SPECIES[newDinoType];
    if (!newCfg) return { ok: false, reason: '未知恐龍品種' };
    if (newCfg.diet !== '肉食') {
      // 草食與飛行恐龍可與任何恐龍（包括肉食）共處
      return { ok: true };
    }

    const region = this.getRegionCells(gx, gz);
    for (const d of this.dinosaurs) {
      const key = `${d.gx},${d.gz}`;
      if (!region.has(key)) continue;
      if (d.config.diet === '肉食' && d.type !== newDinoType) {
        return {
          ok: false,
          reason: `區域規定衝突：${newCfg.name}不可與「${d.config.name}」放在同一區域！請用高壓柵欄隔開。`,
        };
      }
    }
    return { ok: true };
  }

  private checkFenceDemolishSafety(gx: number, gz: number): { ok: boolean; reason?: string } {
    const saved = this.grid[gx][gz];
    this.grid[gx][gz] = null;
    const mergedRegion = this.getRegionCells(gx, gz);
    this.grid[gx][gz] = saved;

    const carnivoreTypes = new Set<string>();
    for (const d of this.dinosaurs) {
      if (mergedRegion.has(`${d.gx},${d.gz}`) && d.config.diet === '肉食') {
        carnivoreTypes.add(d.config.name);
      }
    }
    if (carnivoreTypes.size > 1) {
      return {
        ok: false,
        reason: `無法拆除！移除此柵欄會使「${Array.from(carnivoreTypes).join(' 與 ')}」混入同一區域。`,
      };
    }
    return { ok: true };
  }

  private findDinoAtCell(gx: number, gz: number): DinoEntity | null {
    return (
      this.dinosaurs.find(
        (d) => (d.gx === gx && d.gz === gz) || (d.targetGx === gx && d.targetGz === gz)
      ) || null
    );
  }

  private canBuildAtCell(gx: number, gz: number): boolean {
    if (isEntranceCell(gx, gz)) return false;
    if (this.grid[gx][gz] !== null) return false;
    if (this.findDinoAtCell(gx, gz) !== null) return false;
    return true;
  }

  private handleGridClick(gx: number, gz: number): void {
    const tool = this.activeTool;

    if (tool === 'demolish') {
      const cellObj = this.grid[gx][gz];
      if (cellObj) {
        if (cellObj.type === 'fence') {
          const safety = this.checkFenceDemolishSafety(gx, gz);
          if (!safety.ok) {
            this.callbacks.onToast(safety.reason!, 'error');
            return;
          }
          this.scene.remove(cellObj.mesh);
          this.grid[gx][gz] = null;
          refreshFenceAndNeighbors(this.grid, gx, gz, this.fenceTier);
          const refund = Math.floor(FENCE_COST * 0.5);
          this.money += refund;
          this.callbacks.onToast(`已拆除高壓柵欄，退還 $${refund}`, 'info');
        } else if (cellObj.type === 'facility' && cellObj.facilityKey) {
          const fCfg = FACILITY_CONFIGS[cellObj.facilityKey];
          this.scene.remove(cellObj.mesh);
          if (cellObj.facilityKey === 'waveexhibit') {
            this.wavePools = this.wavePools.filter((p) => p !== cellObj.mesh);
          }
          this.grid[gx][gz] = null;
          const refund = Math.floor(fCfg.cost * 0.5);
          this.money += refund;
          this.callbacks.onToast(`已拆除 ${fCfg.name}，退還 $${refund}`, 'info');
        }
        this.recalcMetrics();
        this.emitSnapshot();
        return;
      }

      const dino = this.findDinoAtCell(gx, gz);
      if (dino) {
        this.disposeDinoMixer(dino);
        this.scene.remove(dino.mesh);
        this.dinosaurs = this.dinosaurs.filter((d) => d.id !== dino.id);
        const refund = Math.floor(dino.config.cost * 0.5);
        this.money += refund;
        this.callbacks.onToast(`已回收 ${dino.config.name}，退還 $${refund}`, 'info');
        this.recalcMetrics();
        this.emitSnapshot();
        return;
      }

      this.callbacks.onToast('此格沒有可拆除的設施或恐龍', 'warn');
      return;
    }

    if (isEntranceCell(gx, gz)) {
      this.callbacks.onToast('大門迎賓通道不可建造！', 'warn');
      return;
    }

    if (!this.canBuildAtCell(gx, gz)) {
      this.callbacks.onToast('此格已有柵欄、設施或恐龍，請選擇其他空草地！', 'warn');
      return;
    }

    if (tool === 'fence') {
      if (this.money < FENCE_COST) {
        this.callbacks.onToast(`資金不足！建造高壓柵欄需要 $${FENCE_COST}`, 'error');
        return;
      }
      this.money -= FENCE_COST;
      const mesh = createFenceMesh(this.fenceTier);
      mesh.position.copy(gridToWorld(gx, gz));
      mesh.userData.gx = gx;
      mesh.userData.gz = gz;
      mesh.traverse((child) => {
        child.userData.cellCoords = { gx, gz };
      });
      this.scene.add(mesh);
      this.grid[gx][gz] = { type: 'fence', mesh, gx, gz };
      refreshFenceAndNeighbors(this.grid, gx, gz, this.fenceTier);
      this.recalcMetrics();
      this.emitSnapshot();
      return;
    }

    if (tool === 'facility') {
      const fCfg = FACILITY_CONFIGS[this.selectedFacilityKey];
      if (!fCfg) return;
      if (this.money < fCfg.cost) {
        this.callbacks.onToast(`資金不足！建造 ${fCfg.name} 需要 $${fCfg.cost}`, 'error');
        return;
      }
      this.money -= fCfg.cost;
      const mesh = this.createFacilityMesh(fCfg.key, gx, gz);
      this.scene.add(mesh);
      this.grid[gx][gz] = { type: 'facility', facilityKey: fCfg.key, mesh, gx, gz };
      if (fCfg.key === 'waveexhibit') {
        this.wavePools.push(mesh);
      }
      this.callbacks.onToast(
        fCfg.key === 'arena'
          ? '已建造「恐龍競技場」！在觀察模式下點擊競技場即可舉辦 3D 對決。'
          : `已建造「${fCfg.name}」！`,
        'success'
      );
      this.recalcMetrics();
      this.emitSnapshot();
      return;
    }

    if (tool === 'dino') {
      if (!this.unlockedSpeciesIds.has(this.selectedDinoType)) {
        const lockedCfg = DINO_SPECIES[this.selectedDinoType];
        this.callbacks.onToast(
          `「${lockedCfg?.name || '此物種'}」尚未解密！請先至研究實驗室解鎖基因。`,
          'warn'
        );
        return;
      }

      const compat = this.checkDinoEnclosureCompatibility(gx, gz, this.selectedDinoType);
      if (!compat.ok) {
        this.callbacks.onToast(compat.reason!, 'error');
        return;
      }

      const cfg = DINO_SPECIES[this.selectedDinoType];
      if (!cfg) return;
      if (this.money < cfg.cost) {
        this.callbacks.onToast(`資金不足！培育 ${cfg.name} 需要 $${cfg.cost}`, 'error');
        return;
      }

      this.money -= cfg.cost;
      const { rootGroup: dinoMesh, bodyRig, animParts } = createDinosaurShell(cfg.id);
      const pos = gridToWorld(gx, gz);
      dinoMesh.position.copy(pos);
      dinoMesh.rotation.y = (Math.random() - 0.5) * Math.PI * 2;
      this.scene.add(dinoMesh);

      const entity: DinoEntity = {
        id: this.nextId++,
        type: cfg.id,
        config: cfg,
        mesh: dinoMesh,
        gx,
        gz,
        targetGx: gx,
        targetGz: gz,
        targetWorld: pos.clone(),
        isMoving: false,
        idleTimer: 0.6 + Math.random() * 1.6,
        animState: 'idle',
        eatingTimer: 0,
        grazeCooldown: 5 + Math.random() * 8,
        animPhase: Math.random() * Math.PI * 2,
        speed:
          cfg.id === 6 || cfg.id === 5
            ? 2.6
            : cfg.id === 12
              ? 2.35
              : cfg.id === 2
                ? 1.15
                : 1.7,
        satiety: 90,
        popularity: cfg.basePopularity,
        performanceScore: 92,
        performanceStatus: '活力十足·精彩展示',
        totalViews: 0,
        totalRevenue: 0,
        growth: 80,
        arenaWins: 0,
        activeAction: null,
        stepPhase: 0,
        vocalCooldown: 2.5 + Math.random() * 5,
      };
      this.updateDinoPerformance(entity);
      this.dinosaurs.push(entity);
      this.loadDinosaurModel(entity, bodyRig, animParts);
      this.soundEffects.playDinoCall(cfg.id, 'spawn', pos, dinoMesh, {
        distanceToCamera: this.camera.position.distanceTo(pos),
        moveSpeed: 0,
        maxSpeed: entity.speed,
      });

      this.callbacks.onToast(`成功安置 ${cfg.name}！點擊可開啟 3D 展示台`, 'success');
      this.recalcMetrics();
      this.emitSnapshot();
    }
  }

  // ===========================================================================
  // AI Updates: Dinosaurs, Visitors, Staff, Litter, Finance
  // ===========================================================================
  private isCellBlockedForDino(gx: number, gz: number, dinoType: number): boolean {
    if (gx < 0 || gx >= GRID_SIZE || gz < 0 || gz >= GRID_SIZE) return true;
    if (isEntranceCell(gx, gz)) return true;
    const cell = this.grid[gx][gz];
    if (!cell) return false;
    if (cell.type === 'facility') {
      // 滄龍與棘龍可自由游入「水波展區」
      if (cell.facilityKey === 'waveexhibit' && (dinoType === 11 || dinoType === 9)) return false;
      return true;
    }
    if (cell.type === 'fence' && dinoType !== 5) return true;
    return false;
  }

  private updateDinoPerformance(dino: DinoEntity): void {
    const sat = dino.satiety;
    if (sat >= 75) {
      dino.performanceScore = Math.round(88 + (sat - 75) * 0.48);
      dino.performanceStatus = dino.config.diet === '飛行' ? '高空盤旋·振翅展演' : '精力充沛·最佳表現';
    } else if (sat >= 45) {
      dino.performanceScore = Math.round(68 + (sat - 45) * 0.65);
      dino.performanceStatus = '穩定巡遊·狀態良好';
    } else if (sat >= 20) {
      dino.performanceScore = Math.round(42 + (sat - 20) * 1.0);
      dino.performanceStatus = '飢餓焦躁·急需飼料';
    } else {
      dino.performanceScore = 25;
      dino.performanceStatus = '體力透支·表現低迷';
    }

    const viewBonus = Math.min(12, dino.totalViews * 0.4) + Math.min(8, dino.arenaWins * 3);
    const satPenalty = sat < 35 ? -15 : 0;
    const geneBonus = this.unlockedTechs.has('gene_attraction_boost') ? 10 : 0;
    dino.popularity = Math.max(
      20,
      Math.min(100, Math.round(dino.config.basePopularity + viewBonus + satPenalty + geneBonus))
    );
  }

  // ===========================================================================
  // Dinosaur GLTF Model Loader & Skeletal AnimationMixer Synchronization
  // ===========================================================================
  private getCachedDinoGltf(url: string): Promise<GLTF> {
    let pending = this.dinoGltfCache.get(url);
    if (!pending) {
      pending = new Promise<GLTF>((resolve, reject) => {
        this.dinoGltfLoader.load(url, resolve, undefined, reject);
      });
      this.dinoGltfCache.set(url, pending);
    }
    return pending;
  }

  private loadDinosaurModel(entity: DinoEntity, bodyRig: THREE.Group, animParts: DinoAnimParts): void {
    const gltfUrl = GLTF_MODEL_PATHS[entity.type] || GLTF_MODEL_PATHS[1];

    this.getCachedDinoGltf(gltfUrl)
      .then((gltf) => {
        // 若非同步載入完成前恐龍已被回收或引擎已釋放，直接中止避免洩漏資源
        if (this.disposed || !this.dinosaurs.includes(entity)) return;

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

        const yawOffset = MODEL_YAW_OFFSET[entity.type] ?? 0;
        const modelWrapper = new THREE.Group();
        model.rotation.y = yawOffset;
        modelWrapper.add(model);

        const box = new THREE.Box3().setFromObject(modelWrapper);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const targetExtent = TARGET_MODEL_EXTENT[entity.type] ?? 1.85;
        const scale = targetExtent / maxDim;

        modelWrapper.scale.setScalar(scale);
        modelWrapper.position.x = -center.x * scale;
        modelWrapper.position.z =
          Math.abs(center.z) > size.z * 0.38 ? -center.z * scale * 0.5 : 0;

        if (entity.type === 5 || entity.type === 11) {
          modelWrapper.position.y = -center.y * scale;
        } else {
          modelWrapper.position.y = -box.min.y * scale;
        }
        bodyRig.add(modelWrapper);

        bindGltfAnimParts(model, animParts);

        if (gltf.animations && gltf.animations.length > 0) {
          const mixer = new THREE.AnimationMixer(model);
          const animActions = extractDinoAnimationActions(mixer, gltf.animations);

          entity.mixer = mixer;
          entity.animActions = animActions;
          entity.activeAction = null;
          entity.mesh.userData.mixer = mixer;
          entity.mesh.userData.animActions = animActions;

          // 立即同步為恐龍當下所處狀態（walking / eating / idle）
          const currentState: DinoAnimState =
            entity.eatingTimer > 0 ? 'eating' : entity.isMoving ? 'walking' : 'idle';
          this.setDinoAnimState(entity, currentState, 0.15, true);
        }
      })
      .catch((err) => {
        console.error(`ParkEngine 載入恐龍模型 ${gltfUrl} 失敗：`, err);
      });
  }

  private disposeDinoMixer(dino: DinoEntity): void {
    if (!dino.mixer) return;
    dino.mixer.stopAllAction();
    dino.mixer.uncacheRoot(dino.mixer.getRoot());
    dino.mixer = undefined;
    dino.animActions = undefined;
    dino.activeAction = null;
  }

  private setDinoAnimState(
    dino: DinoEntity,
    state: DinoAnimState,
    fadeDuration = 0.28,
    force = false
  ): void {
    dino.animState = state;
    dino.mesh.userData.animState = state;

    if (!dino.animActions) return;

    const nextAction =
      dino.animActions[state] ||
      dino.animActions.idle ||
      dino.animActions.walking ||
      dino.animActions.eating;
    if (!nextAction) return;

    const desiredTimeScale = state === 'walking' && dino.satiety < 25 ? 0.65 : 1;

    if (!force && dino.activeAction === nextAction && nextAction.isRunning()) {
      if (Math.abs(nextAction.timeScale - desiredTimeScale) > 0.01) {
        nextAction.setEffectiveTimeScale(desiredTimeScale);
      }
      return;
    }

    nextAction.enabled = true;
    nextAction.reset();
    nextAction.setEffectiveTimeScale(desiredTimeScale);
    nextAction.setEffectiveWeight(1);
    nextAction.play();

    if (dino.activeAction && dino.activeAction !== nextAction) {
      dino.activeAction.enabled = true;
      dino.activeAction.crossFadeTo(nextAction, fadeDuration, true);
    } else {
      nextAction.fadeIn(fadeDuration);
    }

    dino.activeAction = nextAction;
  }

  private syncDinoAnimation(dino: DinoEntity, dt: number): void {
    const desiredState: DinoAnimState =
      dino.eatingTimer > 0 ? 'eating' : dino.isMoving ? 'walking' : 'idle';
    const fadeDuration =
      desiredState === 'eating' ? 0.22 : desiredState === 'walking' ? 0.25 : 0.3;

    this.setDinoAnimState(dino, desiredState, fadeDuration);

    if (dino.mixer) {
      dino.mixer.update(dt);
      return;
    }

    // 若 GLTF 模型尚未載入完成或無內建骨骼動畫，使用關節程式備援動畫
    const parts = dino.mesh.userData.animParts as DinoAnimParts | undefined;
    if (!parts) return;

    if (dino.mesh.userData.isFlying) {
      parts.bodyRig.position.y = 1.65 + Math.sin(dino.animPhase * 1.1) * 0.14;
      if (parts.wings.length === 2) {
        const flap = Math.sin(dino.animPhase * 1.6) * 0.45;
        parts.wings[0].rotation.z = flap;
        parts.wings[1].rotation.z = -flap;
      }
    } else if (dino.mesh.userData.isAquatic) {
      parts.bodyRig.position.y = 0.42 + Math.sin(dino.animPhase * 0.9) * 0.06;
      if (parts.flippers.length === 4) {
        const paddle = Math.sin(dino.animPhase * 1.2) * 0.25;
        parts.flippers[0].rotation.z = -0.18 + paddle;
        parts.flippers[1].rotation.z = 0.18 - paddle;
        parts.flippers[2].rotation.z = -0.15 - paddle;
        parts.flippers[3].rotation.z = 0.15 + paddle;
      }
      if (parts.tailMesh) {
        parts.tailMesh.rotation.y = Math.sin(dino.animPhase * 1.3) * 0.28;
      }
    } else if (parts.legs.length >= 2) {
      const swing = dino.isMoving ? Math.sin(dino.animPhase) * 0.42 : 0;
      parts.legs.forEach((leg, idx) => {
        const dir = idx % 2 === 0 ? 1 : -1;
        leg.rotation.x = THREE.MathUtils.lerp(leg.rotation.x, swing * dir, dt * 10);
      });
      if (parts.tailMesh) {
        parts.tailMesh.rotation.y = Math.sin(dino.animPhase * 0.6) * 0.14;
      }
      if (parts.headGroup && dino.animState === 'eating') {
        parts.headGroup.rotation.x = 0.35 + Math.sin(dino.animPhase * 1.8) * 0.15;
      } else if (parts.headGroup) {
        parts.headGroup.rotation.x = THREE.MathUtils.lerp(parts.headGroup.rotation.x, 0, dt * 8);
      }
      parts.bodyRig.position.y = dino.isMoving ? Math.abs(Math.sin(dino.animPhase)) * 0.04 : 0;
    } else if (parts.bodyRig) {
      if (dino.isMoving) {
        parts.bodyRig.position.y = Math.abs(Math.sin(dino.animPhase)) * 0.08;
        parts.bodyRig.rotation.z = Math.sin(dino.animPhase) * 0.04;
        parts.bodyRig.rotation.x = Math.sin(dino.animPhase * 2) * 0.025;
      } else {
        parts.bodyRig.position.y = Math.sin(dino.animPhase * 0.7) * 0.02;
        parts.bodyRig.rotation.z = THREE.MathUtils.lerp(parts.bodyRig.rotation.z, 0, dt * 6);
        parts.bodyRig.rotation.x = THREE.MathUtils.lerp(parts.bodyRig.rotation.x, 0, dt * 6);
      }
    }
  }

  private triggerDinoEating(dino: DinoEntity, duration = 2.6): void {
    dino.isMoving = false;
    dino.eatingTimer = Math.max(dino.eatingTimer, duration);
    dino.grazeCooldown = 8 + Math.random() * 10;
    this.setDinoAnimState(dino, 'eating', 0.22);
    this.soundEffects.playDinoCall(dino.type, 'eating', dino.mesh.position, dino.mesh, {
      distanceToCamera: this.camera.position.distanceTo(dino.mesh.position),
      moveSpeed: 0,
      maxSpeed: dino.speed,
    });
  }

  private updateDinosaurs(dt: number): void {
    const hungerRate = this.unlockedTechs.has('staff_keeper_boost') ? 0.41 : 0.55;
    for (const dino of this.dinosaurs) {
      dino.animPhase += dt * (dino.isMoving ? 8.5 : dino.animState === 'eating' ? 5.2 : 3.0);
      dino.satiety = Math.max(5, dino.satiety - dt * hungerRate);
      if (dino.growth < 100) {
        dino.growth = Math.min(100, dino.growth + dt * 3.5);
      }
      this.updateDinoPerformance(dino);

      const camDist = this.camera.position.distanceTo(dino.mesh.position);
      const speedFactor = dino.satiety < 25 ? 0.55 : 1;
      const currentMoveSpeed = dino.isMoving ? dino.speed * speedFactor : 0;

      // 恐龍 3D 空間隨機咆哮／鳴叫觸發（依攝影機距離與移動速度動態調整音高與音量）
      dino.vocalCooldown = (dino.vocalCooldown ?? 6) - dt;
      if (dino.vocalCooldown <= 0) {
        const isHungry = dino.satiety < 35;
        dino.vocalCooldown = isHungry ? 4.8 + Math.random() * 6 : 8.5 + Math.random() * 12;
        const vocalCtx = isHungry
          ? 'hungry'
          : dino.eatingTimer > 0
            ? 'eating'
            : dino.isMoving
              ? 'walking'
              : 'idle';
        this.soundEffects.playDinoCall(dino.type, vocalCtx, dino.mesh.position, dino.mesh, {
          distanceToCamera: camDist,
          moveSpeed: currentMoveSpeed,
          maxSpeed: dino.speed,
        });
      }

      // 進食狀態計時與平滑切回 idle
      if (dino.eatingTimer > 0) {
        dino.eatingTimer -= dt;
        if (dino.eatingTimer <= 0) {
          dino.eatingTimer = 0;
          dino.idleTimer = 0.8 + Math.random() * 1.4;
        }
        this.syncDinoAnimation(dino, dt);
        continue;
      }

      if (dino.isMoving) {
        _vec3A.subVectors(dino.targetWorld, dino.mesh.position);
        _vec3A.y = 0;
        const dist = _vec3A.length();

        if (dist < 0.06) {
          dino.mesh.position.x = dino.targetWorld.x;
          dino.mesh.position.z = dino.targetWorld.z;
          dino.gx = dino.targetGx;
          dino.gz = dino.targetGz;
          dino.isMoving = false;
          dino.idleTimer = 1.2 + Math.random() * 2.6;
        } else {
          _vec3A.normalize();
          // 修正轉向與移動朝向偏差：先以最短角度差平滑轉正車頭方向（+Z），對齊後再前進，消除橫移或倒退現象
          const targetAngle = Math.atan2(_vec3A.x, _vec3A.z);
          const diff = Math.atan2(
            Math.sin(targetAngle - dino.mesh.rotation.y),
            Math.cos(targetAngle - dino.mesh.rotation.y)
          );
          const turnRate = dino.mesh.userData.isFlying ? 7.5 : 10.5;
          const turnAlpha = 1 - Math.exp(-turnRate * dt);
          const nextYaw = dino.mesh.rotation.y + diff * turnAlpha;
          dino.mesh.rotation.y = Math.atan2(Math.sin(nextYaw), Math.cos(nextYaw));

          const alignFactor =
            Math.abs(diff) < Math.PI * 0.42 ? Math.max(0.18, Math.cos(diff)) : 0;
          const instantSpeed = dino.speed * speedFactor * alignFactor;
          const step = Math.min(dist, instantSpeed * dt);
          if (step > 0) {
            dino.mesh.position.addScaledVector(_vec3A, step);

            // 隨恐龍移動步頻觸發 3D 空間腳步／振翅／撥水聲（音高與音量隨攝影機距離及即時速度變化）
            if (alignFactor > 0.25) {
              const prevStepPhase = dino.stepPhase ?? 0;
              const strideRate = dino.type === 2 ? 1.55 : dino.type === 6 || dino.type === 12 ? 2.45 : 2.05;
              const nextStepPhase = prevStepPhase + dt * instantSpeed * strideRate;
              dino.stepPhase = nextStepPhase;
              if (Math.floor(nextStepPhase) > Math.floor(prevStepPhase)) {
                this.soundEffects.playDinoFootstep(dino.type, dino.mesh.position, dino.mesh, {
                  distanceToCamera: camDist,
                  moveSpeed: instantSpeed,
                  maxSpeed: dino.speed,
                });
              }
            }
          }
        }
      } else {
        dino.grazeCooldown -= dt;
        if (dino.grazeCooldown <= 0 && !dino.mesh.userData.isFlying) {
          this.triggerDinoEating(dino, 2.0 + Math.random() * 0.9);
          this.syncDinoAnimation(dino, dt);
          continue;
        }

        dino.idleTimer -= dt;
        if (dino.idleTimer <= 0) {
          const dirs = [
            { dx: 1, dz: 0 },
            { dx: -1, dz: 0 },
            { dx: 0, dz: 1 },
            { dx: 0, dz: -1 },
          ];
          const candidates = dirs
            .map((d) => ({ nx: dino.gx + d.dx, nz: dino.gz + d.dz }))
            .filter(({ nx, nz }) => !this.isCellBlockedForDino(nx, nz, dino.type));

          if (candidates.length > 0) {
            const pick = candidates[Math.floor(Math.random() * candidates.length)];
            dino.targetGx = pick.nx;
            dino.targetGz = pick.nz;
            dino.targetWorld = gridToWorld(pick.nx, pick.nz);
            dino.isMoving = true;
          } else {
            dino.idleTimer = 1.4;
          }
        }
      }

      // 統一於狀態轉換結束後同步 GLTF AnimationMixer 與狀態（walking / idle / eating）
      this.syncDinoAnimation(dino, dt);
    }
  }

  private findPathBFS(
    startGx: number,
    startGz: number,
    goalCheckFn: (gx: number, gz: number) => boolean
  ): THREE.Vector3[] | null {
    const queue: { gx: number; gz: number }[] = [{ gx: startGx, gz: startGz }];
    const visited = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(false));
    const parent: ({ gx: number; gz: number } | null)[][] = Array.from({ length: GRID_SIZE }, () =>
      Array(GRID_SIZE).fill(null)
    );
    visited[startGx][startGz] = true;

    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];

    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (goalCheckFn(cur.gx, cur.gz)) {
        const path: THREE.Vector3[] = [];
        let trace: { gx: number; gz: number } | null = cur;
        while (trace && !(trace.gx === startGx && trace.gz === startGz)) {
          path.unshift(gridToWorld(trace.gx, trace.gz));
          trace = parent[trace.gx][trace.gz];
        }
        return path;
      }

      for (const [dx, dz] of dirs) {
        const nx = cur.gx + dx;
        const nz = cur.gz + dz;
        if (nx < 0 || nx >= GRID_SIZE || nz < 0 || nz >= GRID_SIZE) continue;
        if (visited[nx][nz]) continue;
        const cell = this.grid[nx][nz];
        if (cell !== null) continue; // 柵欄與建築不可直接穿過
        visited[nx][nz] = true;
        parent[nx][nz] = cur;
        queue.push({ gx: nx, gz: nz });
      }
    }
    return null;
  }

  private getBuiltFacilities(): { gx: number; gz: number; key: FacilityKey }[] {
    const list: { gx: number; gz: number; key: FacilityKey }[] = [];
    for (let gx = 0; gx < GRID_SIZE; gx++) {
      for (let gz = 0; gz < GRID_SIZE; gz++) {
        const c = this.grid[gx][gz];
        if (c && c.type === 'facility' && c.facilityKey) {
          list.push({ gx, gz, key: c.facilityKey });
        }
      }
    }
    return list;
  }

  private spawnVisitor(): void {
    const mesh = createVisitorMesh();
    const entry = ENTRANCE_CELLS[Math.floor(Math.random() * ENTRANCE_CELLS.length)];
    const entryWorld = gridToWorld(entry.gx, entry.gz);
    mesh.position.set(entryWorld.x + (Math.random() - 0.5) * 0.6, 0, 17.4);
    this.scene.add(mesh);

    this.visitors.push(
      new Visitor({
        id: this.nextId++,
        mesh,
        entryWorld,
      })
    );
  }

  private assignVisitorNextStep(v: Visitor): void {
    const curGrid = worldToGrid(v.mesh.position.x, v.mesh.position.z) || { gx: 7, gz: 15 };

    // 1. 先檢查遊客是否想去商店、護理站、服務站、水波展區或公共設施
    const facilities = this.getBuiltFacilities();
    if (facilities.length > 0 && v.viewsLeft > 0) {
      let desiredKeys: FacilityKey[] = [];
      if (v.fatigue > 62) desiredKeys = ['nursing'];
      else if (v.toilet > 60) desiredKeys = ['restroom'];
      else if (v.thirst > 58) desiredKeys = ['drink', 'water'];
      else if (v.hunger > 58) desiredKeys = ['hotdog', 'icecream'];
      else if (!v.guided && facilities.some((f) => f.key === 'service') && Math.random() < 0.5) {
        desiredKeys = ['service'];
      } else if (v.desireGift && v.viewsLeft === 1) {
        desiredKeys = ['gift'];
      } else if (facilities.some((f) => f.key === 'waveexhibit') && Math.random() < 0.25) {
        desiredKeys = ['waveexhibit'];
      }

      if (desiredKeys.length > 0) {
        const candidates = facilities.filter((f) => desiredKeys.includes(f.key));
        if (candidates.length > 0) {
          const targetF = candidates[Math.floor(Math.random() * candidates.length)];
          const path = this.findPathBFS(
            curGrid.gx,
            curGrid.gz,
            (x, z) => Math.abs(x - targetF.gx) + Math.abs(z - targetF.gz) === 1
          );
          if (path && path.length > 0) {
            v.state = 'seeking_facility';
            v.targetFacility = targetF;
            v.path = path;
            return;
          }
        }
      }
    }

    // 2. 若沒有恐龍（且也不去水波展區）或已逛完，離開公園
    if (this.dinosaurs.length === 0 || v.viewsLeft <= 0) {
      v.state = 'leaving';
      const exitCell = ENTRANCE_CELLS[0];
      const path =
        this.findPathBFS(curGrid.gx, curGrid.gz, (x, z) => x === exitCell.gx && z === exitCell.gz) ||
        [];
      path.push(new THREE.Vector3(0, 0, 17.6));
      v.path = path;
      return;
    }

    // 3. 加權挑選高人氣恐龍去觀賞
    const dino = this.dinosaurs[Math.floor(Math.random() * this.dinosaurs.length)];
    v.targetDinoId = dino.id;
    const path = this.findPathBFS(curGrid.gx, curGrid.gz, (x, z) => {
      const d = Math.hypot(x - dino.gx, z - dino.gz);
      return d >= 1.0 && d <= 2.9;
    });

    if (path && path.length > 0) {
      v.path = path;
      v.state = 'walking';
    } else {
      v.viewsLeft = 0;
      v.state = 'leaving';
      v.path = [new THREE.Vector3(0, 0, 17.6)];
    }
  }

  private maybeDropLitter(gx: number, gz: number): void {
    if (isEntranceCell(gx, gz)) return;
    if (this.litter.length >= 16) return;
    if (this.litter.some((l) => l.gx === gx && l.gz === gz)) return;

    // 附近 3.5 格內有垃圾桶則大幅降低亂丟垃圾機率
    const facilities = this.getBuiltFacilities();
    const hasBinNearby = facilities.some(
      (f) => f.key === 'trashbin' && Math.hypot(f.gx - gx, f.gz - gz) <= 3.8
    );
    const chance = hasBinNearby ? 0.04 : 0.24;
    if (Math.random() > chance) return;

    const mesh = createLitterMesh();
    const pos = gridToWorld(gx, gz);
    mesh.position.set(pos.x + (Math.random() - 0.5) * 0.5, 0, pos.z + (Math.random() - 0.5) * 0.5);
    this.scene.add(mesh);
    this.litter.push({ id: this.nextId++, gx, gz, mesh });
  }

  private updateVisitors(dt: number): void {
    const fairPrice = this.getFairTicketPrice();
    const feedback = this.getTicketFeedback(fairPrice);

    let targetCap =
      this.dinosaurs.length === 0
        ? 2
        : Math.min(MAX_VISITORS, 4 + this.dinosaurs.length * 2 + this.getShopCount());

    let spawnInterval = VISITOR_SPAWN_INTERVAL;
    if (feedback === 'cheap') {
      targetCap = Math.min(MAX_VISITORS + 4, targetCap + 4);
      spawnInterval = VISITOR_SPAWN_INTERVAL * 0.78;
    } else if (feedback === 'expensive') {
      const ratio = this.ticketPrice / Math.max(1, fairPrice);
      targetCap = Math.max(1, Math.round(targetCap * Math.max(0.25, 1 / ratio)));
      spawnInterval = VISITOR_SPAWN_INTERVAL * Math.min(2.8, Math.pow(ratio, 1.3));
    }

    // 天氣對訪客數量的影響：下雨時大幅減少訪客上限與入園頻率；大霧時微幅減少
    if (this.currentWeather === 'rainy') {
      targetCap = Math.max(1, Math.round(targetCap * 0.42));
      spawnInterval *= 2.35;
    } else if (this.currentWeather === 'foggy') {
      targetCap = Math.max(1, Math.round(targetCap * 0.82));
      spawnInterval *= 1.25;
    }

    this.visitorSpawnTimer -= dt;
    if (this.visitorSpawnTimer <= 0) {
      this.visitorSpawnTimer = spawnInterval;
      if (this.visitors.length < targetCap) {
        this.spawnVisitor();
      }
    }

    for (let i = this.visitors.length - 1; i >= 0; i--) {
      const v = this.visitors[i];
      v.updateNeeds(dt);
      v.updateWalkMotion();

      if (v.state === 'viewing' || v.state === 'using_facility') {
        v.waitTimer -= dt;
        v.mesh.position.y =
          v.state === 'viewing' ? Math.abs(Math.sin(v.animPhase * 0.6)) * 0.12 : 0;

        if (v.state === 'viewing') {
          const targetDino = this.dinosaurs.find((d) => d.id === v.targetDinoId);
          if (targetDino) {
            v.mesh.rotation.y = Math.atan2(
              targetDino.mesh.position.x - v.mesh.position.x,
              targetDino.mesh.position.z - v.mesh.position.z
            );
          }
        }

        if (v.waitTimer <= 0) {
          v.mesh.position.y = 0;
          if (v.state === 'viewing') {
            v.viewsLeft -= 1;
            const g = worldToGrid(v.mesh.position.x, v.mesh.position.z);
            if (g) this.maybeDropLitter(g.gx, g.gz);
          }
          this.assignVisitorNextStep(v);
        }
        continue;
      }

      if (v.path.length > 0) {
        const nextPt = v.path[0];
        _vec3B.subVectors(nextPt, v.mesh.position);
        _vec3B.y = 0;
        const dist = _vec3B.length();
        if (dist < 0.1) {
          v.mesh.position.x = nextPt.x;
          v.mesh.position.z = nextPt.z;
          v.path.shift();
        } else {
          _vec3B.normalize();
          v.mesh.position.addScaledVector(_vec3B, Math.min(dist, v.speed * dt));
          v.mesh.rotation.y = Math.atan2(_vec3B.x, _vec3B.z);
        }
      } else {
        if (v.state === 'entering') {
          this.money += this.ticketPrice;
          this.currentFinance.gateRevenue += this.ticketPrice;
          this.recordRevenue(this.ticketPrice);
          this.spawnPopup(v.mesh.position, `+$${this.ticketPrice} 入園門票`, 'ticket');
          this.assignVisitorNextStep(v);
        } else if (v.state === 'walking') {
          v.state = 'viewing';
          v.waitTimer = 1.9 + Math.random() * 1.2;
          const dino = this.dinosaurs.find((d) => d.id === v.targetDinoId);
          if (dino) {
            const outcome = v.interactWithDinosaur(dino, this.satisfaction);
            const geneIncomeBonus = this.unlockedTechs.has('gene_attraction_boost')
              ? Math.round(outcome.earned * 0.15)
              : 0;
            const finalEarned = outcome.earned + geneIncomeBonus;
            if (geneIncomeBonus > 0) {
              dino.totalRevenue += geneIncomeBonus;
            }
            this.money += finalEarned;
            this.currentFinance.ticketRevenue += finalEarned;
            this.recordRevenue(finalEarned);
            this.emitVisitorInteraction({
              type: 'dino_observe',
              visitor: v,
              dino,
              popularity: dino.popularity,
              performanceScore: dino.performanceScore,
              reaction: outcome.reaction,
              isHighPopularity: outcome.isHighPopularity,
              worldPos: v.mesh.position,
            });
            this.spawnPopup(
              v.mesh.position,
              outcome.exclaimPopup
                ? `+$${outcome.earned} ${outcome.exclaimPopup}`
                : `+$${outcome.earned}`,
              'ticket'
            );
          }
        } else if (v.state === 'seeking_facility' && v.targetFacility) {
          const facilityWorld = gridToWorld(v.targetFacility.gx, v.targetFacility.gz);
          const fCfg = FACILITY_CONFIGS[v.targetFacility.key];
          if (fCfg) {
            const outcome = v.interactWithFacility(fCfg, facilityWorld);
            if (outcome.revenue > 0) {
              this.money += outcome.revenue;
              this.currentFinance.shopRevenue += outcome.revenue;
              this.recordRevenue(outcome.revenue);
            }
            if (outcome.isShopPurchase) {
              this.emitVisitorInteraction({
                type: 'shop_purchase',
                visitor: v,
                facilityKey: fCfg.key,
                facilityName: fCfg.name,
                revenue: outcome.revenue,
                worldPos: v.mesh.position,
              });
            } else {
              this.emitVisitorInteraction({
                type: 'facility_visit',
                visitor: v,
                facilityKey: fCfg.key,
                facilityName: fCfg.name,
                worldPos: v.mesh.position,
              });
            }
            for (const pop of outcome.popups) {
              this.spawnPopup(v.mesh.position, pop.text, pop.variant);
            }
          } else {
            v.state = 'using_facility';
            v.waitTimer = 1.3;
            v.targetFacility = null;
          }
        } else if (v.state === 'leaving') {
          this.scene.remove(v.mesh);
          this.visitors.splice(i, 1);
        }
      }
    }
  }

  private updateStaff(dt: number): void {
    for (const s of this.staff) {
      s.animPhase += dt * 9;
      const legs = s.mesh.userData.legs as THREE.Object3D[] | undefined;
      const arms = s.mesh.userData.arms as THREE.Object3D[] | undefined;
      const swing = s.path.length > 0 ? Math.sin(s.animPhase) * 0.45 : 0;
      if (legs && legs.length === 2) {
        legs[0].rotation.x = swing;
        legs[1].rotation.x = -swing;
      }
      if (arms && arms.length === 2) {
        arms[0].rotation.x = -swing * 0.55;
        arms[1].rotation.x = swing * 0.4;
      }

      if (s.path.length > 0) {
        const nextPt = s.path[0];
        _vec3B.subVectors(nextPt, s.mesh.position);
        _vec3B.y = 0;
        const dist = _vec3B.length();
        if (dist < 0.1) {
          s.mesh.position.x = nextPt.x;
          s.mesh.position.z = nextPt.z;
          const g = worldToGrid(s.mesh.position.x, s.mesh.position.z);
          if (g) {
            s.gx = g.gx;
            s.gz = g.gz;
          }
          s.path.shift();
        } else {
          _vec3B.normalize();
          s.mesh.position.addScaledVector(_vec3B, Math.min(dist, s.speed * dt));
          s.mesh.rotation.y = Math.atan2(_vec3B.x, _vec3B.z);
        }
        continue;
      }

      s.workTimer -= dt;
      if (s.workTimer > 0) continue;

      const curGrid = worldToGrid(s.mesh.position.x, s.mesh.position.z) || { gx: 7, gz: 15 };

      if (s.role === 'cleaner') {
        // 清理抵達的垃圾
        if (s.targetLitterId !== null) {
          const lIdx = this.litter.findIndex((l) => l.id === s.targetLitterId);
          if (lIdx !== -1) {
            this.scene.remove(this.litter[lIdx].mesh);
            this.litter.splice(lIdx, 1);
          }
          s.targetLitterId = null;
        }
        if (this.litter.length > 0) {
          const target = this.litter[0];
          const path = this.findPathBFS(curGrid.gx, curGrid.gz, (x, z) => x === target.gx && z === target.gz);
          if (path) {
            s.targetLitterId = target.id;
            s.path = path;
            s.workTimer = this.unlockedTechs.has('staff_cleaner_boost') ? 0.25 : 0.6;
            continue;
          }
        }
      } else if (s.role === 'keeper') {
        // 餵食飢餓恐龍
        if (s.targetDinoId !== null) {
          const dino = this.dinosaurs.find((d) => d.id === s.targetDinoId);
          const feedUsed = this.unlockedTechs.has('staff_keeper_boost') ? 5 : 10;
          if (dino && dino.satiety < 85) {
            if (this.feedStock < feedUsed && this.autoBuyFeed && this.money >= FEED_PACK_COST) {
              this.money -= FEED_PACK_COST;
              this.feedStock += FEED_PACK_AMOUNT;
              this.currentFinance.feedCost += FEED_PACK_COST;
            }
            if (this.feedStock >= feedUsed) {
              this.feedStock -= feedUsed;
              dino.satiety = 100;
              dino.growth = Math.min(100, dino.growth + 25);
              this.triggerDinoEating(dino, 2.8);
              this.updateDinoPerformance(dino);
              this.spawnPopup(dino.mesh.position, '🥩 飼養員已投餵', 'shop');
            }
          }
          s.targetDinoId = null;
        }
        const hungry = this.dinosaurs
          .filter((d) => d.satiety < 65)
          .sort((a, b) => a.satiety - b.satiety)[0];
        if (hungry) {
          const path = this.findPathBFS(
            curGrid.gx,
            curGrid.gz,
            (x, z) => Math.hypot(x - hungry.gx, z - hungry.gz) <= 2.6
          );
          if (path) {
            s.targetDinoId = hungry.id;
            s.path = path;
            s.workTimer = this.unlockedTechs.has('staff_keeper_boost') ? 0.55 : 1.0;
            continue;
          }
        }
      }

      // 隨機巡邏
      const rx = Math.floor(Math.random() * GRID_SIZE);
      const rz = Math.floor(Math.random() * GRID_SIZE);
      const patrolPath = this.findPathBFS(curGrid.gx, curGrid.gz, (x, z) => x === rx && z === rz);
      s.path = patrolPath || [];
      s.workTimer = 1.4;
    }
  }

  private getShopCount(): number {
    let count = 0;
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        const c = this.grid[x][z];
        if (c && c.type === 'facility' && c.facilityKey && FACILITY_CONFIGS[c.facilityKey].category === 'shop') {
          count++;
        }
      }
    }
    return count;
  }

  private getFairTicketPrice(): number {
    const uniqueSpecies = new Set(this.dinosaurs.map((d) => d.type)).size;
    const shopCount = this.getShopCount();
    return Math.round(40 + uniqueSpecies * 10 + this.dinosaurs.length * 4 + shopCount * 3);
  }

  private getTicketFeedback(fairPrice: number): 'cheap' | 'fair' | 'expensive' {
    if (this.ticketPrice <= fairPrice * 0.85) return 'cheap';
    if (this.ticketPrice <= fairPrice * 1.15) return 'fair';
    return 'expensive';
  }

  private getTicketSatisfactionDelta(): number {
    const fairPrice = this.getFairTicketPrice();
    const feedback = this.getTicketFeedback(fairPrice);
    if (feedback === 'cheap') return 6;
    if (feedback === 'fair') return 0;
    const ratio = this.ticketPrice / Math.max(1, fairPrice);
    return -Math.min(28, Math.round((ratio - 1.15) * 28));
  }

  private recalcMetrics(): void {
    const counts: Record<FacilityKey, number> = {
      drink: 0,
      icecream: 0,
      hotdog: 0,
      gift: 0,
      restroom: 0,
      water: 0,
      trashbin: 0,
      nursing: 0,
      service: 0,
      waveexhibit: 0,
      arena: 0,
    };
    let fenceCount = 0;
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        const c = this.grid[x][z];
        if (!c) continue;
        if (c.type === 'fence') fenceCount++;
        if (c.type === 'facility' && c.facilityKey) counts[c.facilityKey]++;
      }
    }

    // 整潔度
    this.cleanlinessRating = Math.max(20, Math.min(100, 100 - this.litter.length * 7 + counts.trashbin * 4));

    // 安全度 (柵欄等級 + 保全人員 + 護理站急救保障)
    const carnivoreCount = this.dinosaurs.filter((d) => d.config.diet === '肉食').length;
    const securityCount = this.staff.filter((s) => s.role === 'security').length;
    const secPower = this.unlockedTechs.has('staff_security_boost') ? 22 : 12;
    const fenceCap = this.fenceTier === 3 ? 36 : this.fenceTier === 2 ? 28 : 20;
    const fencePerUnit = this.fenceTier === 3 ? 2.4 : this.fenceTier === 2 ? 2.0 : 1.5;
    let safety =
      70 +
      Math.min(fenceCap, fenceCount * fencePerUnit) +
      securityCount * secPower +
      Math.min(16, counts.nursing * 8);
    if (carnivoreCount > 0 && fenceCount < 4) {
      if (this.fenceTier === 1) safety -= 28;
      else if (this.fenceTier === 2) safety -= 12;
    }
    this.safetyRating = Math.max(20, Math.min(100, Math.round(safety)));

    const ticketDelta = this.getTicketSatisfactionDelta();
    const fenceSatBonus = this.fenceTier === 3 ? 6 : this.fenceTier === 2 ? 2 : 0;

    // 遊客滿意度 = 恐龍多樣性與表現 + 商店與公共設施覆蓋（含護理站、服務站、水波展區、競技場）+ 安全與整潔 + 門票性價比
    if (this.dinosaurs.length === 0) {
      this.satisfaction = Math.max(
        15,
        Math.min(
          100,
          Math.round(
            45 +
              this.cleanlinessRating * 0.15 +
              (counts.service > 0 ? 5 : 0) +
              (counts.nursing > 0 ? 4 : 0) +
              (counts.arena > 0 ? 4 : 0) +
              Math.min(8, counts.waveexhibit * 3) +
              this.arenaPopularityBonus +
              fenceSatBonus +
              ticketDelta
          )
        )
      );
      return;
    }

    const uniqueSpecies = new Set(this.dinosaurs.map((d) => d.type)).size;
    const avgPerf =
      this.dinosaurs.reduce((acc, d) => acc + d.performanceScore, 0) / this.dinosaurs.length;

    const totalSpeciesCount = Object.keys(DINO_SPECIES).length;
    const speciesBonus = (uniqueSpecies / totalSpeciesCount) * 26;
    const perfBonus = (avgPerf / 100) * 18;
    const shopBonus = Math.min(12, (counts.drink + counts.icecream + counts.hotdog + counts.gift) * 3);
    const utilityBonus =
      (counts.restroom > 0 ? 6 : -6) +
      (counts.water > 0 ? 5 : -3) +
      (counts.trashbin > 0 ? 3 : 0) +
      (counts.nursing > 0 ? 6 : 0) +
      (counts.service > 0 ? 6 : 0) +
      (counts.arena > 0 ? 5 : 0) +
      Math.min(10, counts.waveexhibit * 4);

    const weatherSatDelta =
      this.currentWeather === 'sunny' ? 2 : this.currentWeather === 'foggy' ? -2 : -8;

    const raw =
      26 +
      speciesBonus +
      perfBonus +
      shopBonus +
      utilityBonus +
      (this.safetyRating - 60) * 0.25 +
      (this.cleanlinessRating - 60) * 0.2 +
      this.arenaPopularityBonus +
      fenceSatBonus +
      ticketDelta +
      weatherSatDelta;

    this.satisfaction = Math.max(15, Math.min(100, Math.round(raw)));
  }

  private recordRevenue(amount: number): void {
    if (amount <= 0) return;
    this.cumulativeRevenue += amount;
    this.intervalRevenue += amount;
  }

  private recordAnalyticsSample(): void {
    this.analyticsHistory.push({
      index: this.analyticsIndex++,
      timeLabel: this.formatClockLabel(this.dayProgress),
      visitorCount: this.visitors.length,
      totalRevenue: this.cumulativeRevenue,
      periodRevenue: this.intervalRevenue,
      satisfaction: this.satisfaction,
      weather: this.currentWeather,
    });
    this.intervalRevenue = 0;
    if (this.analyticsHistory.length > 60) {
      this.analyticsHistory.shift();
    }
  }

  private settleFinancialCycle(): void {
    let staffWages = 0;
    for (const s of this.staff) staffWages += STAFF_CONFIGS[s.role].wagePerCycle;

    let facilityUpkeep = 0;
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        const c = this.grid[x][z];
        if (c && c.type === 'facility' && c.facilityKey) {
          facilityUpkeep += FACILITY_CONFIGS[c.facilityKey].upkeep;
        }
      }
    }

    let dinoUpkeep = 0;
    for (const d of this.dinosaurs) dinoUpkeep += d.config.upkeep;

    const totalExpenses = staffWages + facilityUpkeep + dinoUpkeep;
    this.money -= totalExpenses;

    this.currentFinance.staffWages = staffWages;
    this.currentFinance.facilityUpkeep = facilityUpkeep;
    this.currentFinance.dinoUpkeep = dinoUpkeep;

    const totalRev =
      this.currentFinance.gateRevenue +
      this.currentFinance.ticketRevenue +
      this.currentFinance.shopRevenue;
    const net = totalRev - totalExpenses - this.currentFinance.feedCost;

    this.lastFinance = { ...this.currentFinance };
    this.currentFinance = emptyFinance();

    const sign = net >= 0 ? '+' : '';
    this.callbacks.onToast(
      `週期結算：營收 $${totalRev}｜營運支出 $${totalExpenses}｜淨利 ${sign}$${net}`,
      net >= 0 ? 'success' : 'warn'
    );
  }

  // ===========================================================================
  // Floating 2D Popups Projection & Snapshot
  // ===========================================================================
  private spawnPopup(worldPos: THREE.Vector3, text: string, variant: 'ticket' | 'shop'): void {
    const pos = worldPos.clone();
    pos.y += 1.45;
    this.popups.push({
      id: this.nextId++,
      worldPos: pos,
      text,
      variant,
      age: 0,
      duration: 1.5,
    });
  }

  private updatePopups(dt: number): void {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;

    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.age += dt;
      if (p.age >= p.duration) {
        this.popups.splice(i, 1);
        continue;
      }
      if (p.age === dt || p.age === 0) {
        const proj = p.worldPos.clone().project(this.camera);
        if (proj.z <= 1) {
          const sx = (proj.x * 0.5 + 0.5) * w;
          const sy = (-proj.y * 0.5 + 0.5) * h;
          this.callbacks.onFloatingText(sx, sy, p.text, p.variant);
        }
      }
    }
  }

  private emitSnapshot(): void {
    const facilityCounts: Record<FacilityKey, number> = {
      drink: 0,
      icecream: 0,
      hotdog: 0,
      gift: 0,
      restroom: 0,
      water: 0,
      trashbin: 0,
      nursing: 0,
      service: 0,
      waveexhibit: 0,
      arena: 0,
    };
    let fenceCount = 0;
    for (let x = 0; x < GRID_SIZE; x++) {
      for (let z = 0; z < GRID_SIZE; z++) {
        const c = this.grid[x][z];
        if (!c) continue;
        if (c.type === 'fence') fenceCount++;
        if (c.type === 'facility' && c.facilityKey) facilityCounts[c.facilityKey]++;
      }
    }

    const staffCounts: Record<StaffRole, number> = {
      cleaner: this.staff.filter((s) => s.role === 'cleaner').length,
      keeper: this.staff.filter((s) => s.role === 'keeper').length,
      security: this.staff.filter((s) => s.role === 'security').length,
    };

    const snap: GameSnapshot = {
      money: this.money,
      dinoCount: this.dinosaurs.length,
      uniqueSpeciesCount: new Set(this.dinosaurs.map((d) => d.type)).size,
      visitorCount: this.visitors.length,
      satisfaction: this.satisfaction,
      safetyRating: this.safetyRating,
      cleanlinessRating: this.cleanlinessRating,
      feedStock: this.feedStock,
      autoBuyFeed: this.autoBuyFeed,
      litterCount: this.litter.length,
      fenceCount,
      facilityCounts,
      staffCounts,
      cycleTimeLeft: Math.ceil(this.cycleTimer),
      currentCycleFinance: { ...this.currentFinance },
      lastCycleFinance: { ...this.lastFinance },
      dinosaurs: this.dinosaurs.map((d) => ({
        id: d.id,
        type: d.type,
        name: d.config.name,
        en: d.config.en,
        diet: d.config.diet,
        hex: d.config.hex,
        satiety: Math.round(d.satiety),
        popularity: d.popularity,
        performanceScore: d.performanceScore,
        performanceStatus: d.performanceStatus,
        totalViews: d.totalViews,
        totalRevenue: d.totalRevenue,
        growth: Math.round(d.growth),
        arenaWins: d.arenaWins,
        gx: d.gx,
        gz: d.gz,
      })),
      activeTool: this.activeTool,
      selectedDinoType: this.selectedDinoType,
      selectedFacilityKey: this.selectedFacilityKey,
      timeMode: this.timeMode,
      dayCycleDuration: this.dayCycleDuration,
      dayProgress: this.dayProgress,
      dayPhase: this.getDayPhase(this.dayProgress),
      clockLabel: this.formatClockLabel(this.dayProgress),
      parkName: this.parkName,
      ticketPrice: this.ticketPrice,
      fairTicketPrice: this.getFairTicketPrice(),
      ticketFeedback: this.getTicketFeedback(this.getFairTicketPrice()),
      soundMuted: this.soundEffects.isMuted(),
      soundVolume: Math.round(this.soundEffects.getVolume() * 100),
      weatherMode: this.weatherMode,
      currentWeather: this.currentWeather,
      weatherTimeLeft: Math.max(0, Math.ceil(this.weatherTimer)),
      cumulativeRevenue: this.cumulativeRevenue,
      analyticsHistory: this.analyticsHistory.slice(),
      unlockedTechs: Array.from(this.unlockedTechs),
      unlockedSpeciesIds: Array.from(this.unlockedSpeciesIds),
      fenceTier: this.fenceTier,
      cameraMode: this.cameraMode,
      arenaPopularityBonus: this.arenaPopularityBonus,
    };

    this.callbacks.onSnapshot(snap);
  }

  // ===========================================================================
  // Main Loop with Software WebGL Pacing
  // ===========================================================================
  private afterDraw(cb: () => void): void {
    try {
      const gl = this.renderer.getContext() as WebGL2RenderingContext;
      if (gl && typeof gl.fenceSync === 'function') {
        const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
        gl.flush();
        const poll = () => {
          if (this.disposed) return;
          const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
          if (state === gl.UNSIGNALED) {
            this.frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            this.frameId = window.setTimeout(cb, 80);
          }
        };
        this.frameId = window.setTimeout(poll, 5);
        return;
      }
    } catch {
      // fallback
    }
    this.frameId = window.setTimeout(cb, 80);
  }

  private startLoop(): void {
    const tick = () => {
      if (this.disposed) return;
      const now = performance.now();
      const dt = Math.min(0.05, (now - this.lastTime) / 1000);
      this.lastTime = now;

      if (this.cameraMode === 'first_person') {
        this.updateFirstPersonCamera(dt);
      } else {
        this.controls.update();
      }
      this.camera.updateMatrixWorld();
      this.soundEffects.updateListener(this.camera);
      this.updateDayNight(dt);
      this.updateWeather(dt);
      this.updateWaterWaves(dt);
      this.updateDinosaurs(dt);
      this.updateVisitors(dt);
      this.updateStaff(dt);
      this.updatePopups(dt);

      this.satisfactionTimer += dt;
      if (this.satisfactionTimer >= 1.5) {
        this.satisfactionTimer = 0;
        this.recalcMetrics();
      }

      this.analyticsTimer += dt;
      if (this.analyticsTimer >= 4.0) {
        this.analyticsTimer = 0;
        this.recordAnalyticsSample();
      }

      this.cycleTimer -= dt;
      if (this.cycleTimer <= 0) {
        this.cycleTimer = CYCLE_DURATION;
        this.settleFinancialCycle();
        this.recalcMetrics();
      }

      this.uiEmitTimer += dt;
      if (this.uiEmitTimer >= 0.35) {
        this.uiEmitTimer = 0;
        this.emitSnapshot();
      }

      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.frameId = window.setTimeout(tick, 16);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }
}
