import * as THREE from 'three';
import { WeatherType } from './types';

export interface WeatherLightingMods {
  sunMultiplier: number;
  ambientMultiplier: number;
  hemiMultiplier: number;
  starSuppression: number;
  sunVisible: boolean;
}

const _mistTint = new THREE.Color();
const _rainTint = new THREE.Color(0x526378);
const _fogTint = new THREE.Color(0xcbd5e1);

/**
 * Three.js 天氣粒子系統：支援「晴天（暖金光塵）」、「雨天（斜風細雨＋地面水花）」、「大霧（低空流動濃霧＋能見度衰減）」
 * 並以零外部資源相依的 CanvasTexture 與預先配置的 BufferGeometry 進行平滑切換與零 GC 更新。
 */
export class WeatherSystem {
  private group = new THREE.Group();

  // Rain particles
  private rainCount = 1100;
  private rainPositions: Float32Array;
  private rainSpeeds: Float32Array;
  private rainMaterial: THREE.PointsMaterial;
  private rainPoints: THREE.Points;
  private rainTexture: THREE.CanvasTexture;

  // Ground rain splash mist particles
  private splashCount = 260;
  private splashPositions: Float32Array;
  private splashPhases: Float32Array;
  private splashMaterial: THREE.PointsMaterial;
  private splashPoints: THREE.Points;

  // Fog cloud particles
  private fogCount = 150;
  private fogPositions: Float32Array;
  private fogVelocities: Float32Array;
  private fogMaterial: THREE.PointsMaterial;
  private fogPoints: THREE.Points;
  private fogTexture: THREE.CanvasTexture;

  // Sunny floating pollen / sunbeam motes
  private sunMoteCount = 140;
  private sunMotePositions: Float32Array;
  private sunMotePhases: Float32Array;
  private sunMoteMaterial: THREE.PointsMaterial;
  private sunMotePoints: THREE.Points;
  private sunMoteTexture: THREE.CanvasTexture;

  private rainStrength = 0;
  private fogStrength = 0;
  private sunnyStrength = 1;

  constructor(scene: THREE.Scene, isSoftwareGl: boolean) {
    if (isSoftwareGl) {
      this.rainCount = 450;
      this.splashCount = 90;
      this.fogCount = 70;
      this.sunMoteCount = 60;
    }

    this.rainTexture = this.createRainStreakTexture();
    this.fogTexture = this.createSoftPuffTexture('rgba(226, 232, 240, 0.72)', 'rgba(203, 213, 225, 0)');
    this.sunMoteTexture = this.createSoftPuffTexture('rgba(254, 243, 199, 0.9)', 'rgba(253, 224, 71, 0)');

    // 1. Rain Streak Points
    this.rainPositions = new Float32Array(this.rainCount * 3);
    this.rainSpeeds = new Float32Array(this.rainCount);
    for (let i = 0; i < this.rainCount; i++) {
      this.rainPositions[i * 3] = (Math.random() - 0.5) * 48;
      this.rainPositions[i * 3 + 1] = Math.random() * 24 + 0.5;
      this.rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 48;
      this.rainSpeeds[i] = 20 + Math.random() * 10;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(this.rainPositions, 3));
    this.rainMaterial = new THREE.PointsMaterial({
      color: 0xdbeafe,
      map: this.rainTexture,
      size: 0.72,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.NormalBlending,
      fog: false,
    });
    this.rainPoints = new THREE.Points(rainGeo, this.rainMaterial);
    this.rainPoints.visible = false;
    this.rainPoints.frustumCulled = false;
    this.group.add(this.rainPoints);

    // 2. Rain Ground Splash / Drizzle Mist
    this.splashPositions = new Float32Array(this.splashCount * 3);
    this.splashPhases = new Float32Array(this.splashCount);
    for (let i = 0; i < this.splashCount; i++) {
      this.splashPositions[i * 3] = (Math.random() - 0.5) * 34;
      this.splashPositions[i * 3 + 1] = 0.12 + Math.random() * 0.4;
      this.splashPositions[i * 3 + 2] = (Math.random() - 0.5) * 34;
      this.splashPhases[i] = Math.random();
    }
    const splashGeo = new THREE.BufferGeometry();
    splashGeo.setAttribute('position', new THREE.BufferAttribute(this.splashPositions, 3));
    this.splashMaterial = new THREE.PointsMaterial({
      color: 0xe0f2fe,
      map: this.fogTexture,
      size: 0.65,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    this.splashPoints = new THREE.Points(splashGeo, this.splashMaterial);
    this.splashPoints.visible = false;
    this.splashPoints.frustumCulled = false;
    this.group.add(this.splashPoints);

    // 3. Drifting Dense Fog Clouds
    this.fogPositions = new Float32Array(this.fogCount * 3);
    this.fogVelocities = new Float32Array(this.fogCount * 2);
    for (let i = 0; i < this.fogCount; i++) {
      this.fogPositions[i * 3] = (Math.random() - 0.5) * 50;
      this.fogPositions[i * 3 + 1] = 0.9 + Math.random() * 4.4;
      this.fogPositions[i * 3 + 2] = (Math.random() - 0.5) * 50;
      this.fogVelocities[i * 2] = (Math.random() * 0.8 + 0.35) * (Math.random() < 0.5 ? 1 : -1);
      this.fogVelocities[i * 2 + 1] = (Math.random() - 0.5) * 0.45;
    }
    const fogGeo = new THREE.BufferGeometry();
    fogGeo.setAttribute('position', new THREE.BufferAttribute(this.fogPositions, 3));
    this.fogMaterial = new THREE.PointsMaterial({
      color: 0xe2e8f0,
      map: this.fogTexture,
      size: 10.5,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      fog: false,
    });
    this.fogPoints = new THREE.Points(fogGeo, this.fogMaterial);
    this.fogPoints.visible = false;
    this.fogPoints.frustumCulled = false;
    this.group.add(this.fogPoints);

    // 4. Sunny Floating Motes
    this.sunMotePositions = new Float32Array(this.sunMoteCount * 3);
    this.sunMotePhases = new Float32Array(this.sunMoteCount);
    for (let i = 0; i < this.sunMoteCount; i++) {
      this.sunMotePositions[i * 3] = (Math.random() - 0.5) * 34;
      this.sunMotePositions[i * 3 + 1] = 0.8 + Math.random() * 8.0;
      this.sunMotePositions[i * 3 + 2] = (Math.random() - 0.5) * 34;
      this.sunMotePhases[i] = Math.random() * Math.PI * 2;
    }
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(this.sunMotePositions, 3));
    this.sunMoteMaterial = new THREE.PointsMaterial({
      color: 0xfef3c7,
      map: this.sunMoteTexture,
      size: 0.42,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.sunMotePoints = new THREE.Points(moteGeo, this.sunMoteMaterial);
    this.sunMotePoints.frustumCulled = false;
    this.group.add(this.sunMotePoints);

    scene.add(this.group);
  }

  private createRainStreakTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createLinearGradient(8, 0, 8, 64);
    grad.addColorStop(0, 'rgba(224, 242, 254, 0)');
    grad.addColorStop(0.25, 'rgba(224, 242, 254, 0.78)');
    grad.addColorStop(0.85, 'rgba(186, 230, 253, 0.92)');
    grad.addColorStop(1, 'rgba(224, 242, 254, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(6, 2, 4, 60);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private createSoftPuffTexture(innerColor: string, outerColor: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, innerColor);
    grad.addColorStop(0.45, innerColor);
    grad.addColorStop(1, outerColor);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 64, 64);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  public update(
    dt: number,
    weather: WeatherType,
    scene: THREE.Scene,
    skyBaseColor: THREE.Color
  ): WeatherLightingMods {
    const blendRate = dt > 0 ? 1 - Math.exp(-dt * 1.35) : 1;
    const targetRain = weather === 'rainy' ? 1 : 0;
    const targetFog = weather === 'foggy' ? 1 : 0;
    const targetSunny = weather === 'sunny' ? 1 : 0;

    this.rainStrength = THREE.MathUtils.lerp(this.rainStrength, targetRain, blendRate);
    this.fogStrength = THREE.MathUtils.lerp(this.fogStrength, targetFog, blendRate);
    this.sunnyStrength = THREE.MathUtils.lerp(this.sunnyStrength, targetSunny, blendRate);

    // Animate Rain Particles
    if (this.rainStrength > 0.015) {
      this.rainPoints.visible = true;
      this.splashPoints.visible = true;
      this.rainMaterial.opacity = this.rainStrength * 0.78;
      this.splashMaterial.opacity = this.rainStrength * 0.42;

      const rainAttr = this.rainPoints.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < this.rainCount; i++) {
        const idx = i * 3;
        this.rainPositions[idx] -= 2.8 * dt;
        this.rainPositions[idx + 1] -= this.rainSpeeds[i] * dt;
        this.rainPositions[idx + 2] += 1.4 * dt;
        if (this.rainPositions[idx + 1] <= 0.05) {
          this.rainPositions[idx] = (Math.random() - 0.5) * 48;
          this.rainPositions[idx + 1] = 21 + Math.random() * 5;
          this.rainPositions[idx + 2] = (Math.random() - 0.5) * 48;
        }
      }
      rainAttr.needsUpdate = true;

      const splashAttr = this.splashPoints.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < this.splashCount; i++) {
        this.splashPhases[i] += dt * 3.4;
        if (this.splashPhases[i] >= 1) {
          this.splashPhases[i] = 0;
          this.splashPositions[i * 3] = (Math.random() - 0.5) * 34;
          this.splashPositions[i * 3 + 2] = (Math.random() - 0.5) * 34;
        }
        this.splashPositions[i * 3 + 1] = 0.08 + Math.sin(this.splashPhases[i] * Math.PI) * 0.55;
      }
      splashAttr.needsUpdate = true;
    } else {
      this.rainPoints.visible = false;
      this.splashPoints.visible = false;
    }

    // Animate Fog Particles
    if (this.fogStrength > 0.015) {
      this.fogPoints.visible = true;
      this.fogMaterial.opacity = this.fogStrength * 0.34;
      const fogAttr = this.fogPoints.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < this.fogCount; i++) {
        const idx = i * 3;
        this.fogPositions[idx] += this.fogVelocities[i * 2] * dt;
        this.fogPositions[idx + 2] += this.fogVelocities[i * 2 + 1] * dt;
        if (this.fogPositions[idx] > 26) this.fogPositions[idx] = -26;
        else if (this.fogPositions[idx] < -26) this.fogPositions[idx] = 26;
        if (this.fogPositions[idx + 2] > 26) this.fogPositions[idx + 2] = -26;
        else if (this.fogPositions[idx + 2] < -26) this.fogPositions[idx + 2] = 26;
      }
      fogAttr.needsUpdate = true;
    } else {
      this.fogPoints.visible = false;
    }

    // Animate Sunny Particles (golden motes)
    if (this.sunnyStrength > 0.02) {
      this.sunMotePoints.visible = true;
      this.sunMoteMaterial.opacity = this.sunnyStrength * 0.45;
      const moteAttr = this.sunMotePoints.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < this.sunMoteCount; i++) {
        const idx = i * 3;
        this.sunMotePhases[i] += dt * 1.1;
        this.sunMotePositions[idx] += Math.sin(this.sunMotePhases[i]) * 0.35 * dt;
        this.sunMotePositions[idx + 1] += 0.32 * dt;
        this.sunMotePositions[idx + 2] += Math.cos(this.sunMotePhases[i] * 0.8) * 0.28 * dt;
        if (this.sunMotePositions[idx + 1] > 9.2) {
          this.sunMotePositions[idx] = (Math.random() - 0.5) * 34;
          this.sunMotePositions[idx + 1] = 0.6;
          this.sunMotePositions[idx + 2] = (Math.random() - 0.5) * 34;
        }
      }
      moteAttr.needsUpdate = true;
    } else {
      this.sunMotePoints.visible = false;
    }

    // Blend Scene Sky & Fog Distances
    _mistTint.copy(skyBaseColor);
    if (this.rainStrength > 0.01) {
      _mistTint.lerp(_rainTint, this.rainStrength * 0.58);
    }
    if (this.fogStrength > 0.01) {
      _mistTint.lerp(_fogTint, this.fogStrength * 0.72);
    }

    if (scene.background instanceof THREE.Color) {
      scene.background.copy(_mistTint);
    }
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(_mistTint);
      const near = 52 - this.rainStrength * 22 - this.fogStrength * 37;
      const far = 110 - this.rainStrength * 34 - this.fogStrength * 60;
      scene.fog.near = Math.max(10, near);
      scene.fog.far = Math.max(38, far);
    }

    return {
      sunMultiplier: 1 - this.rainStrength * 0.48 - this.fogStrength * 0.34,
      ambientMultiplier: 1 - this.rainStrength * 0.16 + this.fogStrength * 0.12,
      hemiMultiplier: 1 - this.rainStrength * 0.18 + this.fogStrength * 0.08,
      starSuppression: Math.max(this.rainStrength, this.fogStrength),
      sunVisible: this.rainStrength < 0.65 && this.fogStrength < 0.7,
    };
  }

  public dispose(): void {
    this.rainPoints.geometry.dispose();
    this.rainMaterial.dispose();
    this.rainTexture.dispose();

    this.splashPoints.geometry.dispose();
    this.splashMaterial.dispose();

    this.fogPoints.geometry.dispose();
    this.fogMaterial.dispose();
    this.fogTexture.dispose();

    this.sunMotePoints.geometry.dispose();
    this.sunMoteMaterial.dispose();
    this.sunMoteTexture.dispose();
  }
}
