import * as THREE from 'three';

export type DietType = '肉食' | '草食' | '飛行';

export interface DinoSpeciesConfig {
  id: number;
  name: string;
  en: string;
  cost: number;
  income: number;
  upkeep: number;
  diet: DietType;
  era: string;
  length: string;
  weight: string;
  basePopularity: number;
  color: number;
  accentColor: number;
  hex: string;
  intro: string;
  coexistTip: string;
}

export type FacilityCategory = 'shop' | 'utility';

export type FacilityKey =
  | 'drink'
  | 'icecream'
  | 'hotdog'
  | 'gift'
  | 'restroom'
  | 'water'
  | 'trashbin'
  | 'nursing'
  | 'service'
  | 'waveexhibit'
  | 'arena';

export interface FacilityConfig {
  key: FacilityKey;
  category: FacilityCategory;
  name: string;
  cost: number;
  upkeep: number;
  revenue: number;
  needType: 'thirst' | 'hunger' | 'souvenir' | 'toilet' | 'cleanliness' | 'medical' | 'service' | 'exhibit';
  colorHex: string;
  desc: string;
}

export type StaffRole = 'cleaner' | 'keeper' | 'security';

export interface StaffRoleConfig {
  role: StaffRole;
  name: string;
  hireCost: number;
  wagePerCycle: number;
  colorHex: string;
  shirtColor: number;
  desc: string;
}

export type ToolMode = 'inspect' | 'fence' | 'demolish' | 'dino' | 'facility';

export interface GridCellObject {
  type: 'fence' | 'facility';
  facilityKey?: FacilityKey;
  mesh: THREE.Group;
  gx: number;
  gz: number;
}

export interface GridCellSave {
  type: 'fence' | 'facility';
  facilityKey?: FacilityKey;
  gx: number;
  gz: number;
}

export type DinoAnimState = 'idle' | 'walking' | 'eating';

export type DinoAnimActions = Record<DinoAnimState, THREE.AnimationAction | null>;

export interface DinoEntity {
  id: number;
  type: number;
  config: DinoSpeciesConfig;
  mesh: THREE.Group;
  gx: number;
  gz: number;
  targetGx: number;
  targetGz: number;
  targetWorld: THREE.Vector3;
  isMoving: boolean;
  idleTimer: number;
  animState: DinoAnimState;
  eatingTimer: number;
  grazeCooldown: number;
  animPhase: number;
  speed: number;
  satiety: number; // 0-100
  popularity: number; // 0-100
  performanceScore: number; // 0-100
  performanceStatus: string;
  totalViews: number;
  totalRevenue: number;
  growth: number; // 0-100 (100 = 已成長可出戰競技場)
  arenaWins: number;
  mixer?: THREE.AnimationMixer;
  animActions?: DinoAnimActions;
  activeAction?: THREE.AnimationAction | null;
  stepPhase?: number;
  vocalCooldown?: number;
}

export interface VisitorEntity {
  id: number;
  mesh: THREE.Group;
  state: 'entering' | 'walking' | 'viewing' | 'seeking_facility' | 'using_facility' | 'leaving';
  path: THREE.Vector3[];
  targetDinoId: number | null;
  targetFacility: { gx: number; gz: number; key: FacilityKey } | null;
  waitTimer: number;
  viewsLeft: number;
  speed: number;
  animPhase: number;
  thirst: number;
  hunger: number;
  toilet: number;
  fatigue: number;
  guided: boolean;
  desireGift: boolean;
  excitement?: number;
}

export interface StaffEntity {
  id: number;
  role: StaffRole;
  mesh: THREE.Group;
  gx: number;
  gz: number;
  path: THREE.Vector3[];
  workTimer: number;
  targetLitterId: number | null;
  targetDinoId: number | null;
  speed: number;
  animPhase: number;
}

export interface LitterEntity {
  id: number;
  gx: number;
  gz: number;
  mesh: THREE.Group;
}

export interface FinancialSummary {
  gateRevenue: number;
  ticketRevenue: number;
  shopRevenue: number;
  staffWages: number;
  facilityUpkeep: number;
  dinoUpkeep: number;
  feedCost: number;
}

export interface DinoSnapshot {
  id: number;
  type: number;
  name: string;
  en: string;
  diet: DietType;
  hex: string;
  satiety: number;
  popularity: number;
  performanceScore: number;
  performanceStatus: string;
  totalViews: number;
  totalRevenue: number;
  growth: number;
  arenaWins: number;
  gx: number;
  gz: number;
}

export type TimeMode = 'auto' | 'morning' | 'afternoon' | 'dusk' | 'night';

export type DayPhase = 'morning' | 'afternoon' | 'dusk' | 'night';

export type WeatherType = 'sunny' | 'rainy' | 'foggy';

export type WeatherMode = 'auto' | WeatherType;

export type CameraMode = 'overview' | 'first_person';

export type TechBranch = 'species' | 'fence' | 'operations';

export type TechId =
  | 'species_fukuiraptor'
  | 'species_spinosaurus'
  | 'species_mosasaurus'
  | 'fence_titanium'
  | 'fence_plasma'
  | 'staff_cleaner_boost'
  | 'staff_keeper_boost'
  | 'staff_security_boost'
  | 'gene_attraction_boost';

export interface TechNodeConfig {
  id: TechId;
  branch: TechBranch;
  name: string;
  cost: number;
  prerequisite?: TechId;
  unlockSpeciesId?: number;
  desc: string;
  effectLabel: string;
}

export interface AnalyticsPoint {
  index: number;
  timeLabel: string;
  visitorCount: number;
  totalRevenue: number;
  periodRevenue: number;
  satisfaction: number;
  weather: WeatherType;
}

export interface GameSnapshot {
  money: number;
  dinoCount: number;
  uniqueSpeciesCount: number;
  visitorCount: number;
  satisfaction: number;
  safetyRating: number;
  cleanlinessRating: number;
  feedStock: number;
  autoBuyFeed: boolean;
  litterCount: number;
  fenceCount: number;
  facilityCounts: Record<FacilityKey, number>;
  staffCounts: Record<StaffRole, number>;
  cycleTimeLeft: number;
  currentCycleFinance: FinancialSummary;
  lastCycleFinance: FinancialSummary;
  dinosaurs: DinoSnapshot[];
  activeTool: ToolMode;
  selectedDinoType: number;
  selectedFacilityKey: FacilityKey;
  timeMode: TimeMode;
  dayCycleDuration: number;
  dayProgress: number;
  dayPhase: DayPhase;
  clockLabel: string;
  parkName: string;
  ticketPrice: number;
  fairTicketPrice: number;
  ticketFeedback: 'cheap' | 'fair' | 'expensive';
  soundMuted: boolean;
  soundVolume: number;
  weatherMode: WeatherMode;
  currentWeather: WeatherType;
  weatherTimeLeft: number;
  cumulativeRevenue: number;
  analyticsHistory: AnalyticsPoint[];
  unlockedTechs: TechId[];
  unlockedSpeciesIds: number[];
  fenceTier: 1 | 2 | 3;
  cameraMode: CameraMode;
  arenaPopularityBonus: number;
}
