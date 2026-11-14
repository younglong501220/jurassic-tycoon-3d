import * as THREE from 'three';
import { FacilityKey } from './types';

const _camPos = new THREE.Vector3();
const _camForward = new THREE.Vector3();
const _camUp = new THREE.Vector3();

interface ActiveSpatialEmitter {
  panner: PannerNode;
  trackObj?: THREE.Object3D;
  expiresAt: number;
}

export type VisitorExclaimKind = 'awe' | 'delight' | 'mild';
export type DinoVocalContext = 'idle' | 'walking' | 'eating' | 'hungry' | 'spawn';

export interface SpatialMotionMetrics {
  distanceToCamera?: number;
  moveSpeed?: number;
  maxSpeed?: number;
}

/**
 * 100% 程式化 Web Audio API 3D 空間音效合成器（零外部音訊檔案相依）
 * 支援：
 * - AudioListener 與 PannerNode 3D 空間定位與動態追蹤
 * - 依恐龍與攝影機距離及移動速度動態調整音高（Pitch）、音量（Gain）與高頻衰減
 * - 恐龍品種吠叫／咆哮（依狀態與食性區分音色）與移動腳步／振翅／水花聲
 * - 恐龍餵食音效
 * - 遊客商店購買與高人氣恐龍驚喜／愉悅音效
 */
export class ParkSoundEffects {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private muted = false;
  private volume = 0.75; // 0..1
  private activeEmitters: ActiveSpatialEmitter[] = [];

  private lastFeedAt = 0;
  private lastShopAt = 0;
  private lastFootstepAt = 0;
  private lastVocalAt = 0;
  private lastExclaimAt = 0;

  private getAudioContextCtor(): typeof AudioContext | null {
    if (typeof window === 'undefined') return null;
    const win = window as Window & {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    return globalThis.AudioContext || win.AudioContext || win.webkitAudioContext || null;
  }

  private ensureContext(): AudioContext | null {
    if (!this.ctx) {
      const Ctor = this.getAudioContextCtor();
      if (!Ctor) return null;
      try {
        this.ctx = new Ctor();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    return this.ctx;
  }

  private syncMasterGain(): void {
    if (!this.ctx || !this.masterGain) return;
    const target = this.muted ? 0 : this.volume;
    this.masterGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.02);
  }

  /**
   * 於使用者點擊／按鍵互動時解鎖瀏覽器 AudioContext
   */
  public unlock(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
  }

  public isMuted(): boolean {
    return this.muted || this.volume <= 0;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (!muted && this.volume <= 0) {
      this.volume = 0.75;
    }
    if (!muted) {
      this.unlock();
    }
    this.syncMasterGain();
  }

  public toggleMuted(): boolean {
    this.setMuted(!this.isMuted());
    return this.isMuted();
  }

  public getVolume(): number {
    return this.volume;
  }

  public setVolume(vol: number): void {
    const clamped = Math.max(0, Math.min(1, vol));
    this.volume = clamped;
    this.muted = clamped === 0;
    if (clamped > 0) {
      this.unlock();
    }
    this.syncMasterGain();
  }

  /**
   * 每幀同步 Three.js 相機座標與朝向至 Web Audio AudioListener，
   * 並更新尚在播放中的 3D 空間發聲節點位置（隨恐龍或遊客移動）。
   */
  public updateListener(camera: THREE.Camera): void {
    _camPos.setFromMatrixPosition(camera.matrixWorld);
    _camForward.set(0, 0, -1).applyQuaternion(camera.quaternion).normalize();
    _camUp.set(0, 1, 0).applyQuaternion(camera.quaternion).normalize();

    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;

    const listener = ctx.listener;
    const now = ctx.currentTime;

    if ('positionX' in listener && listener.positionX) {
      listener.positionX.setValueAtTime(_camPos.x, now);
      listener.positionY.setValueAtTime(_camPos.y, now);
      listener.positionZ.setValueAtTime(_camPos.z, now);
      listener.forwardX.setValueAtTime(_camForward.x, now);
      listener.forwardY.setValueAtTime(_camForward.y, now);
      listener.forwardZ.setValueAtTime(_camForward.z, now);
      listener.upX.setValueAtTime(_camUp.x, now);
      listener.upY.setValueAtTime(_camUp.y, now);
      listener.upZ.setValueAtTime(_camUp.z, now);
    } else if (typeof (listener as AudioListener).setPosition === 'function') {
      (listener as AudioListener).setPosition(_camPos.x, _camPos.y, _camPos.z);
      (listener as AudioListener).setOrientation(
        _camForward.x,
        _camForward.y,
        _camForward.z,
        _camUp.x,
        _camUp.y,
        _camUp.z
      );
    }

    const nowMs = performance.now();
    for (let i = this.activeEmitters.length - 1; i >= 0; i--) {
      const em = this.activeEmitters[i];
      if (nowMs >= em.expiresAt) {
        try {
          em.panner.disconnect();
        } catch {
          // ignore
        }
        this.activeEmitters.splice(i, 1);
        continue;
      }
      if (em.trackObj) {
        this.setPannerPosition(em.panner, em.trackObj.position, now);
      }
    }
  }

  private setPannerPosition(panner: PannerNode, pos: THREE.Vector3, time: number): void {
    if ('positionX' in panner && panner.positionX) {
      panner.positionX.setValueAtTime(pos.x, time);
      panner.positionY.setValueAtTime(pos.y, time);
      panner.positionZ.setValueAtTime(pos.z, time);
    } else if (typeof panner.setPosition === 'function') {
      panner.setPosition(pos.x, pos.y, pos.z);
    }
  }

  private isWithinHearingRange(worldPos?: THREE.Vector3, maxRange = 58): boolean {
    if (!worldPos) return true;
    // 若尚未更新 _camPos（例如首次互動），預設允許播放
    if (_camPos.lengthSq() < 0.001) return true;
    return _camPos.distanceTo(worldPos) <= maxRange;
  }

  private computeSpatialAcoustics(
    worldPos?: THREE.Vector3,
    metrics?: SpatialMotionMetrics
  ): { gainScale: number; pitchScale: number; filterScale: number } {
    const dist =
      metrics?.distanceToCamera ??
      (worldPos && _camPos.lengthSq() > 0.001 ? _camPos.distanceTo(worldPos) : 18);
    const distNorm = THREE.MathUtils.clamp((dist - 8) / 48, 0, 1);

    const maxSpd = metrics?.maxSpeed && metrics.maxSpeed > 0 ? metrics.maxSpeed : 2.6;
    const speedRatio =
      metrics?.moveSpeed !== undefined
        ? THREE.MathUtils.clamp(metrics.moveSpeed / maxSpd, 0, 1.35)
        : 0.35;

    // 距離越近音量越大，速度越快動能越強
    const distGain = THREE.MathUtils.lerp(1.22, 0.14, Math.pow(distNorm, 0.85));
    const speedGain = 0.72 + speedRatio * 0.55;
    const gainScale = THREE.MathUtils.clamp(distGain * speedGain, 0.08, 1.45);

    // 距離越近音色越明亮略高、距離越遠越低沉；移動越快音高略升
    const distPitch = THREE.MathUtils.lerp(1.07, 0.84, distNorm);
    const speedPitch = 0.9 + speedRatio * 0.24;
    const pitchScale = THREE.MathUtils.clamp(distPitch * speedPitch, 0.72, 1.34);

    // 遠距離大氣高頻衰減
    const filterScale = THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(1.18, 0.48, distNorm) * (0.9 + speedRatio * 0.2),
      0.38,
      1.35
    );

    return { gainScale, pitchScale, filterScale };
  }

  private createSpatialDestination(
    ctx: AudioContext,
    worldPos?: THREE.Vector3,
    trackObj?: THREE.Object3D,
    durationSec = 0.7,
    refDistance = 10,
    maxDistance = 68
  ): AudioNode {
    const masterOut: AudioNode = this.masterGain || ctx.destination;
    if (!worldPos || typeof ctx.createPanner !== 'function') {
      return masterOut;
    }

    const panner = ctx.createPanner();
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = refDistance;
    panner.maxDistance = maxDistance;
    panner.rolloffFactor = 1.1;
    panner.coneInnerAngle = 360;
    panner.coneOuterAngle = 360;

    this.setPannerPosition(panner, worldPos, ctx.currentTime);
    panner.connect(masterOut);

    this.activeEmitters.push({
      panner,
      trackObj,
      expiresAt: performance.now() + durationSec * 1000 + 120,
    });
    return panner;
  }

  /**
   * 恐龍吠叫／咆哮 3D 空間音效（依距離、移動速度、品種與狀態動態變化音高與音量）
   */
  public playDinoCall(
    dinoType: number,
    context: DinoVocalContext,
    worldPos?: THREE.Vector3,
    trackObj?: THREE.Object3D,
    metrics?: SpatialMotionMetrics
  ): void {
    if (this.muted) return;
    if (!this.isWithinHearingRange(worldPos, 56)) return;

    const nowMs = performance.now();
    if (context !== 'spawn' && nowMs - this.lastVocalAt < 420) return;
    this.lastVocalAt = nowMs;

    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;

    const t = ctx.currentTime;
    const isApex = dinoType === 1 || dinoType === 9 || dinoType === 12;
    const isRaptor = dinoType === 6;
    const isFlying = dinoType === 5;
    const isAquatic = dinoType === 11;
    const isCrested = dinoType === 8 || dinoType === 10;

    const { gainScale, pitchScale, filterScale } = this.computeSpatialAcoustics(worldPos, metrics);
    const hungryBoost = context === 'hungry' ? 1.16 : context === 'eating' ? 0.88 : 1.0;
    const pitchMul = hungryBoost * pitchScale;
    const dur = context === 'eating' ? 0.28 : isRaptor ? 0.34 : isFlying ? 0.42 : 0.58;
    const dest = this.createSpatialDestination(ctx, worldPos, trackObj, dur + 0.1, 12, 72);

    if (isRaptor) {
      // 迅猛龍：雙重短促尖銳吠鳴
      [0, 0.14].forEach((offset, idx) => {
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        osc.type = 'sawtooth';
        const f0 = (idx === 0 ? 480 : 540) * pitchMul;
        osc.frequency.setValueAtTime(f0, t + offset);
        osc.frequency.exponentialRampToValueAtTime(f0 * 0.56, t + offset + 0.11);

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(1100 * filterScale, t + offset);
        filter.Q.setValueAtTime(2.4, t + offset);

        gain.gain.setValueAtTime(0.001, t + offset);
        gain.gain.linearRampToValueAtTime(0.11 * gainScale, t + offset + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.12);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(dest);
        osc.start(t + offset);
        osc.stop(t + offset + 0.13);
      });
      return;
    }

    if (isFlying) {
      // 翼手龍：高空尖嘯啼鳴
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(980 * pitchMul, t);
      osc.frequency.exponentialRampToValueAtTime(610 * pitchMul, t + dur);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1400 * filterScale, t);
      filter.Q.setValueAtTime(2.0, t);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.085 * gainScale, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + dur + 0.02);
      return;
    }

    if (isAquatic) {
      // 滄龍：深海共鳴低吼
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(108 * pitchMul, t);
      osc.frequency.exponentialRampToValueAtTime(52 * pitchScale, t + dur);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(320 * filterScale, t);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.16 * gainScale, t + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + dur + 0.02);
      return;
    }

    // 暴龍／棘龍／大型草食／冠龍類：共鳴咆哮或管狀共鳴鳴叫
    const osc = ctx.createOscillator();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = isApex ? 'sawtooth' : isCrested ? 'triangle' : 'sawtooth';
    const startFreq = (isApex ? 155 : isCrested ? 275 : 132) * pitchMul;
    const endFreq = (isApex ? 68 : isCrested ? 215 : 88) * pitchScale;

    osc.frequency.setValueAtTime(startFreq, t);
    if (isCrested) {
      osc.frequency.linearRampToValueAtTime(startFreq * 1.24, t + dur * 0.35);
    }
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);

    // 聲帶震顫調變
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime((isApex ? 26 : 14) * (0.9 + pitchScale * 0.1), t);
    lfoGain.gain.setValueAtTime(isApex ? 14 : 6, t);
    lfo.connect(lfoGain);
    lfoGain.connect(osc.frequency);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime((isApex ? 520 : isCrested ? 920 : 410) * filterScale, t);
    filter.frequency.exponentialRampToValueAtTime((isApex ? 220 : 340) * filterScale, t + dur);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime((isApex ? 0.13 : 0.1) * gainScale, t + 0.06);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    lfo.start(t);
    osc.start(t);
    lfo.stop(t + dur + 0.02);
    osc.stop(t + dur + 0.02);
  }

  /**
   * 恐龍移動腳步／拍翅／撥水 3D 空間音效（音高與音量隨攝影機距離與移動速度動態調整）
   */
  public playDinoFootstep(
    dinoType: number,
    worldPos: THREE.Vector3,
    trackObj?: THREE.Object3D,
    metrics?: SpatialMotionMetrics
  ): void {
    if (this.muted) return;
    if (!this.isWithinHearingRange(worldPos, 46)) return;

    const nowMs = performance.now();
    if (nowMs - this.lastFootstepAt < 135) return;
    this.lastFootstepAt = nowMs;

    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;

    const t = ctx.currentTime;
    const isHeavy =
      dinoType === 1 ||
      dinoType === 2 ||
      dinoType === 3 ||
      dinoType === 4 ||
      dinoType === 7 ||
      dinoType === 9;
    const isFlying = dinoType === 5;
    const isAquatic = dinoType === 11;

    const { gainScale, pitchScale, filterScale } = this.computeSpatialAcoustics(worldPos, metrics);
    const dest = this.createSpatialDestination(ctx, worldPos, trackObj, 0.22, 8, 50);

    if (isFlying) {
      // 翼手龍：輕微振翅氣流聲
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160 * pitchScale, t);
      osc.frequency.exponentialRampToValueAtTime(75 * pitchScale, t + 0.11);
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(340 * filterScale, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.04 * gainScale, t + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + 0.13);
      return;
    }

    if (isAquatic) {
      // 滄龍：水面撥水波紋聲
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(210 * pitchScale, t);
      osc.frequency.exponentialRampToValueAtTime(95 * pitchScale, t + 0.13);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(420 * filterScale, t);
      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.055 * gainScale, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + 0.15);
      return;
    }

    // 陸地恐龍沉重或輕快踏步聲
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sine';
    const fStart = (isHeavy ? 82 : 128) * pitchScale;
    const fEnd = (isHeavy ? 32 : 54) * pitchScale;
    const dur = isHeavy ? 0.13 : 0.085;

    osc.frequency.setValueAtTime(fStart, t);
    osc.frequency.exponentialRampToValueAtTime(fEnd, t + dur);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime((isHeavy ? 190 : 320) * filterScale, t);

    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime((isHeavy ? 0.12 : 0.065) * gainScale, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /**
   * 餵食恐龍觸發音效：兩聲低頻咬合啃食 + 溫潤上揚確認音
   */
  public playDinoFeed(
    dinoType?: number,
    worldPos?: THREE.Vector3,
    trackObj?: THREE.Object3D
  ): void {
    if (this.muted) return;
    const nowMs = performance.now();
    if (nowMs - this.lastFeedAt < 140) return;
    this.lastFeedAt = nowMs;

    const ctx = this.ensureContext();
    if (!ctx) return;

    const trigger = () => {
      if (this.muted || ctx.state !== 'running') return;
      const t = ctx.currentTime;
      const dest = this.createSpatialDestination(ctx, worldPos, trackObj, 0.55, 14, 75);

      const pitchMul =
        dinoType === 2 || dinoType === 9 || dinoType === 11
          ? 0.85
          : dinoType === 6 || dinoType === 10
            ? 1.18
            : 1.0;

      // 兩段咬合聲 (chomp-chomp)
      [0, 0.11].forEach((offset, idx) => {
        const osc = ctx.createOscillator();
        const filter = ctx.createBiquadFilter();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        const baseFreq = (idx === 0 ? 190 : 215) * pitchMul;
        osc.frequency.setValueAtTime(baseFreq, t + offset);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.48, t + offset + 0.085);

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(680, t + offset);

        gain.gain.setValueAtTime(0.001, t + offset);
        gain.gain.linearRampToValueAtTime(0.14, t + offset + 0.014);
        gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.095);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(dest);

        osc.start(t + offset);
        osc.stop(t + offset + 0.1);
      });

      // 愉悅滿足提示雙音 (C5 -> G5)
      [
        { offset: 0.21, freq: 523.25 },
        { offset: 0.3, freq: 783.99 },
      ].forEach(({ offset, freq }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + offset);

        gain.gain.setValueAtTime(0.001, t + offset);
        gain.gain.linearRampToValueAtTime(0.065, t + offset + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.18);

        osc.connect(gain);
        gain.connect(dest);

        osc.start(t + offset);
        osc.stop(t + offset + 0.19);
      });
    };

    if (ctx.state === 'suspended') {
      void ctx
        .resume()
        .then(trigger)
        .catch(() => {});
    } else {
      trigger();
    }
  }

  /**
   * 遊客與商店或設施互動（購買飲料／冰淇淋／熱狗／禮品，或體驗設施服務）觸發 3D 空間音效
   */
  public playShopInteraction(
    facilityKey: FacilityKey,
    worldPos?: THREE.Vector3,
    trackObj?: THREE.Object3D
  ): void {
    if (this.muted) return;
    if (!this.isWithinHearingRange(worldPos, 56)) return;

    const nowMs = performance.now();
    if (nowMs - this.lastShopAt < 200) return;

    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    this.lastShopAt = nowMs;

    const t = ctx.currentTime;
    const dest = this.createSpatialDestination(ctx, worldPos, trackObj, 0.45, 11, 64);

    let sequence: Array<{ offset: number; freq: number; dur: number; peak: number; wave?: OscillatorType }>;

    switch (facilityKey) {
      case 'gift':
        // 禮品店：華麗三連收銀鈴聲
        sequence = [
          { offset: 0, freq: 880, dur: 0.09, peak: 0.055, wave: 'triangle' },
          { offset: 0.065, freq: 1108.73, dur: 0.1, peak: 0.06, wave: 'triangle' },
          { offset: 0.13, freq: 1318.51, dur: 0.22, peak: 0.068, wave: 'sine' },
        ];
        break;
      case 'icecream':
        // 冰淇淋攤：輕快甜美鈴音
        sequence = [
          { offset: 0, freq: 1046.5, dur: 0.09, peak: 0.05, wave: 'sine' },
          { offset: 0.075, freq: 1318.51, dur: 0.11, peak: 0.055, wave: 'sine' },
          { offset: 0.15, freq: 1567.98, dur: 0.18, peak: 0.06, wave: 'sine' },
        ];
        break;
      case 'hotdog':
        // 熱狗攤：明快雙音收銀
        sequence = [
          { offset: 0, freq: 783.99, dur: 0.1, peak: 0.055, wave: 'triangle' },
          { offset: 0.08, freq: 1174.66, dur: 0.19, peak: 0.065, wave: 'triangle' },
        ];
        break;
      case 'drink':
        // 飲料攤：清脆氣泡雙音
        sequence = [
          { offset: 0, freq: 698.46, dur: 0.08, peak: 0.05, wave: 'sine' },
          { offset: 0.065, freq: 1046.5, dur: 0.17, peak: 0.06, wave: 'sine' },
        ];
        break;
      case 'waveexhibit':
        // 水波展區：清澈水韻共鳴和弦
        sequence = [
          { offset: 0, freq: 659.25, dur: 0.14, peak: 0.05, wave: 'sine' },
          { offset: 0.09, freq: 987.77, dur: 0.22, peak: 0.055, wave: 'sine' },
        ];
        break;
      default:
        // 服務站／護理站／公共設施：柔和提示音
        sequence = [
          { offset: 0, freq: 587.33, dur: 0.1, peak: 0.04, wave: 'sine' },
          { offset: 0.08, freq: 880, dur: 0.15, peak: 0.045, wave: 'sine' },
        ];
        break;
    }

    for (const n of sequence) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = n.wave || 'triangle';
      osc.frequency.setValueAtTime(n.freq, t + n.offset);

      gain.gain.setValueAtTime(0.001, t + n.offset);
      gain.gain.linearRampToValueAtTime(n.peak, t + n.offset + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, t + n.offset + n.dur);

      osc.connect(gain);
      gain.connect(dest);

      osc.start(t + n.offset);
      osc.stop(t + n.offset + n.dur + 0.01);
    }
  }

  /**
   * 遊客觀賞恐龍或大型展區時觸發的驚嘆／讚歎音效
   */
  public playVisitorExclaim(
    kind: VisitorExclaimKind,
    worldPos?: THREE.Vector3,
    trackObj?: THREE.Object3D
  ): void {
    if (this.muted) return;
    if (!this.isWithinHearingRange(worldPos, 54)) return;

    const nowMs = performance.now();
    if (nowMs - this.lastExclaimAt < 280) return;

    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    this.lastExclaimAt = nowMs;

    const t = ctx.currentTime;
    const dest = this.createSpatialDestination(ctx, worldPos, trackObj, 0.48, 10, 62);

    if (kind === 'awe') {
      // 驚嘆 "哇—！" 上揚再回落共振滑音 + 星光點綴音
      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(340, t);
      osc.frequency.exponentialRampToValueAtTime(620, t + 0.14);
      osc.frequency.exponentialRampToValueAtTime(495, t + 0.32);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(950, t);
      filter.Q.setValueAtTime(1.8, t);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.075, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.34);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + 0.36);

      // 輔助高音閃爍
      const bell = ctx.createOscillator();
      const bellGain = ctx.createGain();
      bell.type = 'sine';
      bell.frequency.setValueAtTime(1318.51, t + 0.08);
      bellGain.gain.setValueAtTime(0.001, t + 0.08);
      bellGain.gain.linearRampToValueAtTime(0.045, t + 0.1);
      bellGain.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      bell.connect(bellGain);
      bellGain.connect(dest);
      bell.start(t + 0.08);
      bell.stop(t + 0.3);
      return;
    }

    if (kind === 'delight') {
      // 欣喜讚賞雙音
      [
        { offset: 0, freq: 466.16 },
        { offset: 0.085, freq: 622.25 },
      ].forEach(({ offset, freq }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t + offset);
        gain.gain.setValueAtTime(0.001, t + offset);
        gain.gain.linearRampToValueAtTime(0.055, t + offset + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.16);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(t + offset);
        osc.stop(t + offset + 0.17);
      });
      return;
    }

    // 溫和反應（恐龍飢餓表現低迷時）
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(255, t + 0.18);
    gain.gain.setValueAtTime(0.001, t);
    gain.gain.linearRampToValueAtTime(0.04, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.19);
    osc.connect(gain);
    gain.connect(dest);
    osc.start(t);
    osc.stop(t + 0.21);
  }

  /**
   * 遊客模式快門拍照音效
   */
  public playCameraShutter(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const trigger = () => {
      if (this.muted || ctx.state !== 'running') return;
      const t = ctx.currentTime;
      const dest: AudioNode = this.masterGain || ctx.destination;

      // 短促機械快門雙擊聲
      [0, 0.055].forEach((offset, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(idx === 0 ? 1850 : 1220, t + offset);
        osc.frequency.exponentialRampToValueAtTime(idx === 0 ? 480 : 320, t + offset + 0.032);

        gain.gain.setValueAtTime(0.001, t + offset);
        gain.gain.linearRampToValueAtTime(idx === 0 ? 0.14 : 0.1, t + offset + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.001, t + offset + 0.036);

        osc.connect(gain);
        gain.connect(dest);
        osc.start(t + offset);
        osc.stop(t + offset + 0.042);
      });
    };

    if (ctx.state === 'suspended') {
      void ctx
        .resume()
        .then(trigger)
        .catch(() => {});
    } else {
      trigger();
    }
  }

  /**
   * 研究實驗室解鎖科技樹音效
   */
  public playTechUnlock(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const trigger = () => {
      if (this.muted || ctx.state !== 'running') return;
      const t = ctx.currentTime;
      const dest: AudioNode = this.masterGain || ctx.destination;
      const notes = [
        { offset: 0, freq: 523.25, dur: 0.14 },
        { offset: 0.075, freq: 659.25, dur: 0.15 },
        { offset: 0.15, freq: 783.99, dur: 0.18 },
        { offset: 0.23, freq: 1046.5, dur: 0.34 },
      ];
      for (const n of notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(n.freq, t + n.offset);
        gain.gain.setValueAtTime(0.001, t + n.offset);
        gain.gain.linearRampToValueAtTime(0.085, t + n.offset + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.001, t + n.offset + n.dur);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(t + n.offset);
        osc.stop(t + n.offset + n.dur + 0.02);
      }
    };

    if (ctx.state === 'suspended') {
      void ctx
        .resume()
        .then(trigger)
        .catch(() => {});
    } else {
      trigger();
    }
  }

  /**
   * 競技場恐龍對決撞擊／撕咬音效
   */
  public playArenaImpact(heavy = false): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const trigger = () => {
      if (this.muted || ctx.state !== 'running') return;
      const t = ctx.currentTime;
      const dest: AudioNode = this.masterGain || ctx.destination;

      const osc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(heavy ? 145 : 195, t);
      osc.frequency.exponentialRampToValueAtTime(heavy ? 36 : 52, t + (heavy ? 0.22 : 0.14));

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(heavy ? 520 : 680, t);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(heavy ? 0.18 : 0.12, t + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.001, t + (heavy ? 0.24 : 0.16));

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(dest);
      osc.start(t);
      osc.stop(t + 0.26);
    };

    if (ctx.state === 'suspended') {
      void ctx
        .resume()
        .then(trigger)
        .catch(() => {});
    } else {
      trigger();
    }
  }

  /**
   * 競技場勝利歡呼凱旋音效
   */
  public playArenaVictory(): void {
    if (this.muted) return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const trigger = () => {
      if (this.muted || ctx.state !== 'running') return;
      const t = ctx.currentTime;
      const dest: AudioNode = this.masterGain || ctx.destination;
      const fanfare = [
        { offset: 0, freq: 392.0, dur: 0.14 },
        { offset: 0.12, freq: 523.25, dur: 0.14 },
        { offset: 0.24, freq: 659.25, dur: 0.16 },
        { offset: 0.38, freq: 783.99, dur: 0.45 },
      ];
      for (const n of fanfare) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(n.freq, t + n.offset);
        gain.gain.setValueAtTime(0.001, t + n.offset);
        gain.gain.linearRampToValueAtTime(0.095, t + n.offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, t + n.offset + n.dur);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(t + n.offset);
        osc.stop(t + n.offset + n.dur + 0.02);
      }
    };

    if (ctx.state === 'suspended') {
      void ctx
        .resume()
        .then(trigger)
        .catch(() => {});
    } else {
      trigger();
    }
  }

  public dispose(): void {
    for (const em of this.activeEmitters) {
      try {
        em.panner.disconnect();
      } catch {
        // ignore
      }
    }
    this.activeEmitters.length = 0;
    if (this.masterGain) {
      try {
        this.masterGain.disconnect();
      } catch {
        // ignore
      }
      this.masterGain = null;
    }
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
    }
  }
}
