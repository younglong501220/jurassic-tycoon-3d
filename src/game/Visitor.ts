import * as THREE from 'three';
import { VisitorExclaimKind } from './soundEffects';
import { DinoEntity, FacilityConfig, FacilityKey, VisitorEntity } from './types';

export interface VisitorInit {
  id: number;
  mesh: THREE.Group;
  entryWorld: THREE.Vector3;
}

export interface FacilityInteractionOutcome {
  revenue: number;
  isShopPurchase: boolean;
  popups: Array<{ text: string; variant: 'ticket' | 'shop' }>;
}

export interface DinoViewingOutcome {
  earned: number;
  reaction: VisitorExclaimKind;
  isHighPopularity: boolean;
  exclaimPopup: string | null;
}

export class Visitor implements VisitorEntity {
  public id: number;
  public mesh: THREE.Group;
  public state: VisitorEntity['state'];
  public path: THREE.Vector3[];
  public targetDinoId: number | null = null;
  public targetFacility: { gx: number; gz: number; key: FacilityKey } | null = null;
  public waitTimer = 0;
  public viewsLeft: number;
  public speed: number;
  public animPhase: number;
  public thirst: number;
  public hunger: number;
  public toilet: number;
  public fatigue: number;
  public guided = false;
  public desireGift: boolean;
  public excitement = 60;

  constructor(init: VisitorInit) {
    this.id = init.id;
    this.mesh = init.mesh;
    this.state = 'entering';
    this.path = [init.entryWorld.clone()];
    this.viewsLeft = 2 + Math.floor(Math.random() * 2);
    this.speed = 2.35 + Math.random() * 0.55;
    this.animPhase = Math.random() * Math.PI * 2;
    this.thirst = 25 + Math.random() * 35;
    this.hunger = 20 + Math.random() * 35;
    this.toilet = 15 + Math.random() * 35;
    this.fatigue = 10 + Math.random() * 25;
    this.desireGift = Math.random() < 0.55;
  }

  public updateNeeds(dt: number): void {
    this.animPhase += dt * 10;
    this.thirst = Math.min(100, this.thirst + dt * 2.2);
    this.hunger = Math.min(100, this.hunger + dt * 1.9);
    this.toilet = Math.min(100, this.toilet + dt * 1.8);
    this.fatigue = Math.min(100, this.fatigue + dt * 1.55);
  }

  public updateWalkMotion(): void {
    const legs = this.mesh.userData.legs as THREE.Object3D[] | undefined;
    const arms = this.mesh.userData.arms as THREE.Object3D[] | undefined;
    const isMoving = this.state !== 'viewing' && this.state !== 'using_facility';
    const swing = isMoving ? Math.sin(this.animPhase) * 0.48 : 0;

    if (legs && legs.length === 2) {
      legs[0].rotation.x = swing;
      legs[1].rotation.x = -swing;
    }
    if (arms && arms.length === 2) {
      arms[0].rotation.x = -swing * 0.68;
      arms[1].rotation.x = swing * 0.68;
    }
  }

  /**
   * 遊客抵達設施或商店時的互動邏輯：滿足需求並回傳消費結果供 ParkEngine 觸發購買事件
   */
  public interactWithFacility(
    fCfg: FacilityConfig,
    facilityWorld: THREE.Vector3
  ): FacilityInteractionOutcome {
    this.state = 'using_facility';
    this.waitTimer = 1.3;
    this.mesh.rotation.y = Math.atan2(
      facilityWorld.x - this.mesh.position.x,
      facilityWorld.z - this.mesh.position.z
    );

    const popups: Array<{ text: string; variant: 'ticket' | 'shop' }> = [];

    if (fCfg.needType === 'thirst') this.thirst = 0;
    if (fCfg.needType === 'hunger') this.hunger = 0;
    if (fCfg.needType === 'toilet') this.toilet = 0;
    if (fCfg.needType === 'souvenir') this.desireGift = false;
    if (fCfg.needType === 'medical') {
      this.fatigue = 0;
      popups.push({ text: '🩺 護理站照護', variant: 'shop' });
    }
    if (fCfg.needType === 'service') {
      this.guided = true;
      this.viewsLeft += 1;
    }

    if (fCfg.revenue > 0) {
      popups.push({ text: `+$${fCfg.revenue} ${fCfg.name}`, variant: 'shop' });
    }

    const isShopPurchase = fCfg.category === 'shop' || fCfg.revenue > 0;
    if (fCfg.category === 'shop') {
      this.excitement = Math.min(100, this.excitement + 10);
    } else if (fCfg.key === 'waveexhibit') {
      this.excitement = Math.min(100, this.excitement + 14);
    }

    this.targetFacility = null;
    return { revenue: fCfg.revenue, isShopPurchase, popups };
  }

  /**
   * 遊客觀賞恐龍時的互動邏輯：計算收益與驚喜／愉悅評價，由 ParkEngine 事件監聽器觸發對應音效
   */
  public interactWithDinosaur(
    dino: DinoEntity,
    parkSatisfaction: number
  ): DinoViewingOutcome {
    const satFactor = 0.72 + (parkSatisfaction / 100) * 0.52;
    const perfFactor = 0.55 + (dino.performanceScore / 100) * 0.65;
    const earned = Math.round(dino.config.income * satFactor * perfFactor);

    dino.totalViews += 1;
    dino.totalRevenue += earned;

    let reaction: VisitorExclaimKind = 'delight';
    let exclaimPopup: string | null = null;
    const isHighPopularity = dino.popularity >= 78 && dino.performanceScore >= 65;

    if (dino.performanceScore < 50) {
      reaction = 'mild';
      this.excitement = Math.max(25, this.excitement - 8);
    } else if (dino.popularity >= 84 && dino.performanceScore >= 75) {
      reaction = 'awe';
      this.excitement = Math.min(100, this.excitement + 16);
      if (Math.random() < 0.45) {
        exclaimPopup = dino.config.diet === '肉食' ? '🤩 太震撼了！' : '✨ 好壯觀！';
      }
    } else {
      reaction = 'delight';
      this.excitement = Math.min(100, this.excitement + 8);
      if (isHighPopularity && Math.random() < 0.35) {
        exclaimPopup = '😊 好精采！';
      }
    }

    return { earned, reaction, isHighPopularity, exclaimPopup };
  }
}
