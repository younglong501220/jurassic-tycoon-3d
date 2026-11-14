import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Award, Play, RotateCcw, Swords, Trophy, X } from 'lucide-react';
import { createDinosaur, setDinosaurAnimationState } from '../game/dinosaurFactory';
import { DinoSnapshot, GameSnapshot } from '../game/types';

interface ArenaModalProps {
  open: boolean;
  snapshot: GameSnapshot;
  onClose: () => void;
  onCompleteBattle: (
    dinoAId: number,
    dinoBId: number,
    winnerId: number
  ) => { prize: number; popularityGain: number; winnerName: string } | null;
  onPlayImpact?: (heavy?: boolean) => void;
  onPlayRoar?: (speciesType: number) => void;
  onBuildArena?: () => void;
}

interface BattleLogEntry {
  id: number;
  text: string;
  tone: 'hit' | 'crit' | 'win';
}

function getDinoCombatStats(d: DinoSnapshot) {
  const dietBonus = d.diet === '肉食' ? 24 : d.diet === '飛行' ? 10 : 14;
  const maxHp = Math.round(140 + d.popularity * 1.15 + d.arenaWins * 12);
  const attack = Math.round(16 + dietBonus + (d.performanceScore / 100) * 14 + d.arenaWins * 3);
  return { maxHp, attack };
}

export const ArenaModal: React.FC<ArenaModalProps> = ({
  open,
  snapshot,
  onClose,
  onCompleteBattle,
  onPlayImpact,
  onPlayRoar,
  onBuildArena,
}) => {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const impactCallbackRef = useRef(onPlayImpact);
  const roarCallbackRef = useRef(onPlayRoar);
  const completeCallbackRef = useRef(onCompleteBattle);
  impactCallbackRef.current = onPlayImpact;
  roarCallbackRef.current = onPlayRoar;
  completeCallbackRef.current = onCompleteBattle;

  const grownDinos = useMemo(
    () => snapshot.dinosaurs.filter((d) => d.growth >= 100),
    [snapshot.dinosaurs]
  );
  const growingDinos = useMemo(
    () => snapshot.dinosaurs.filter((d) => d.growth < 100),
    [snapshot.dinosaurs]
  );

  const [dinoAId, setDinoAId] = useState<number | null>(null);
  const [dinoBId, setDinoBId] = useState<number | null>(null);
  const [battlePhase, setBattlePhase] = useState<'select' | 'fighting' | 'finished'>('select');
  const [hpA, setHpA] = useState(100);
  const [hpB, setHpB] = useState(100);
  const [maxHpA, setMaxHpA] = useState(100);
  const [maxHpB, setMaxHpB] = useState(100);
  const [battleLogs, setBattleLogs] = useState<BattleLogEntry[]>([]);
  const [resultInfo, setResultInfo] = useState<{
    winnerId: number;
    winnerName: string;
    prize: number;
    popularityGain: number;
  } | null>(null);

  // Sync default fighter picks when modal opens or dinosaurs change
  useEffect(() => {
    if (!open) return;
    if (grownDinos.length >= 1 && (!dinoAId || !grownDinos.some((d) => d.id === dinoAId))) {
      setDinoAId(grownDinos[0].id);
    }
    if (grownDinos.length >= 2) {
      const validB = dinoBId && dinoBId !== dinoAId && grownDinos.some((d) => d.id === dinoBId);
      if (!validB) {
        const second = grownDinos.find((d) => d.id !== (dinoAId ?? grownDinos[0].id));
        setDinoBId(second ? second.id : null);
      }
    } else {
      setDinoBId(null);
    }
  }, [open, grownDinos, dinoAId, dinoBId]);

  const fighterA = useMemo(
    () => grownDinos.find((d) => d.id === dinoAId) || null,
    [grownDinos, dinoAId]
  );
  const fighterB = useMemo(
    () => grownDinos.find((d) => d.id === dinoBId) || null,
    [grownDinos, dinoBId]
  );

  const fighterAType = fighterA?.type ?? null;
  const fighterBType = fighterB?.type ?? null;
  const arenaBuiltCount = snapshot.facilityCounts.arena;

  // 3D Arena Stage & Duel Animation Loop
  useEffect(() => {
    if (!open || !stageRef.current || arenaBuiltCount === 0) return;
    const container = stageRef.current;
    const w = Math.max(container.clientWidth, 340);
    const h = Math.max(container.clientHeight, 260);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    const camera = new THREE.PerspectiveCamera(42, w / h, 0.1, 80);
    camera.position.set(0, 4.4, 7.2);
    camera.lookAt(0, 0.9, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Dramatic Arena Spotlights
    scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const keyLight = new THREE.DirectionalLight(0xfef3c7, 1.35);
    keyLight.position.set(5, 9, 6);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const redRim = new THREE.PointLight(0xef4444, 2.2, 16);
    redRim.position.set(-4.2, 3.2, 0);
    scene.add(redRim);

    const blueRim = new THREE.PointLight(0x38bdf8, 2.2, 16);
    blueRim.position.set(4.2, 3.2, 0);
    scene.add(blueRim);

    // Colosseum Arena Floor
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(3.8, 4.2, 0.35, 32),
      new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.75, metalness: 0.2 })
    );
    base.position.y = -0.18;
    base.receiveShadow = true;
    scene.add(base);

    const sand = new THREE.Mesh(
      new THREE.CylinderGeometry(3.15, 3.15, 0.08, 32),
      new THREE.MeshStandardMaterial({ color: 0xc2a370, roughness: 0.92 })
    );
    sand.position.y = 0.02;
    sand.receiveShadow = true;
    scene.add(sand);

    const centerRing = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.1, 32),
      new THREE.MeshBasicMaterial({ color: 0xdc2626, side: THREE.DoubleSide })
    );
    centerRing.rotation.x = -Math.PI / 2;
    centerRing.position.y = 0.07;
    scene.add(centerRing);

    // 4 Corner Stadium Pillars
    for (let i = 0; i < 4; i++) {
      const ang = (i * Math.PI) / 2 + Math.PI / 4;
      const px = Math.cos(ang) * 3.55;
      const pz = Math.sin(ang) * 3.55;
      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.14, 0.18, 2.8, 10),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5, metalness: 0.5 })
      );
      pillar.position.set(px, 1.4, pz);
      scene.add(pillar);

      const beacon = new THREE.Mesh(
        new THREE.BoxGeometry(0.32, 0.16, 0.32),
        new THREE.MeshStandardMaterial({
          color: 0xfef08a,
          emissive: 0xfacc15,
          emissiveIntensity: 0.9,
        })
      );
      beacon.position.set(px, 2.85, pz);
      scene.add(beacon);
    }

    // Impact Shockwave Ring
    const shockMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    const shockRing = new THREE.Mesh(new THREE.RingGeometry(0.25, 0.45, 24), shockMat);
    shockRing.rotation.x = -Math.PI / 2;
    shockRing.position.y = 0.12;
    scene.add(shockRing);

    let meshA: THREE.Group | null = null;
    let meshB: THREE.Group | null = null;
    if (fighterAType !== null) {
      meshA = createDinosaur(fighterAType);
      meshA.position.set(-1.75, 0.05, 0);
      meshA.rotation.y = Math.PI / 2;
      scene.add(meshA);
    }
    if (fighterBType !== null) {
      meshB = createDinosaur(fighterBType);
      meshB.position.set(1.75, 0.05, 0);
      meshB.rotation.y = -Math.PI / 2;
      scene.add(meshB);
    }

    // Battle Choreography State
    let fightElapsed = 0;
    let nextStrikeAt = 0.55;
    let turnA = true;
    let localHpA = fighterA ? getDinoCombatStats(fighterA).maxHp : 100;
    let localHpB = fighterB ? getDinoCombatStats(fighterB).maxHp : 100;
    const statsA = fighterA ? getDinoCombatStats(fighterA) : { maxHp: 100, attack: 20 };
    const statsB = fighterB ? getDinoCombatStats(fighterB) : { maxHp: 100, attack: 20 };
    let shockPhase = 0;
    let lungeTimerA = 0;
    let lungeTimerB = 0;
    let shakeTimer = 0;
    let battleSettled = false;

    if (battlePhase === 'fighting' && fighterA && fighterB) {
      setMaxHpA(statsA.maxHp);
      setMaxHpB(statsB.maxHp);
      setHpA(statsA.maxHp);
      setHpB(statsB.maxHp);
      if (meshA) setDinosaurAnimationState(meshA, 'walking', 0.15);
      if (meshB) setDinosaurAnimationState(meshB, 'walking', 0.15);
      roarCallbackRef.current?.(fighterA.type);
    }

    let frameId = 0;
    let last = performance.now();

    const tick = () => {
      frameId = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (meshA?.userData.mixer) {
        (meshA.userData.mixer as THREE.AnimationMixer).update(dt);
      }
      if (meshB?.userData.mixer) {
        (meshB.userData.mixer as THREE.AnimationMixer).update(dt);
      }

      if (battlePhase === 'fighting' && fighterA && fighterB && !battleSettled) {
        fightElapsed += dt;

        // Subtle dynamic battle camera orbit
        const camAngle = Math.sin(fightElapsed * 0.7) * 0.35;
        const shakeX = shakeTimer > 0 ? (Math.random() - 0.5) * 0.18 : 0;
        const shakeY = shakeTimer > 0 ? (Math.random() - 0.5) * 0.14 : 0;
        if (shakeTimer > 0) shakeTimer = Math.max(0, shakeTimer - dt);

        camera.position.set(
          Math.sin(camAngle) * 7.0 + shakeX,
          4.1 + shakeY,
          Math.cos(camAngle) * 7.0
        );
        camera.lookAt(0, 0.85, 0);

        if (fightElapsed >= nextStrikeAt) {
          nextStrikeAt = fightElapsed + 0.82;
          const attacker = turnA ? fighterA : fighterB;
          const defender = turnA ? fighterB : fighterA;
          const atkStat = turnA ? statsA.attack : statsB.attack;
          const isCrit = Math.random() < 0.28;
          const dmg = Math.round((atkStat + Math.random() * 14) * (isCrit ? 1.45 : 1.0));

          if (turnA) {
            lungeTimerA = 0.38;
            localHpB = Math.max(0, localHpB - dmg);
            setHpB(localHpB);
          } else {
            lungeTimerB = 0.38;
            localHpA = Math.max(0, localHpA - dmg);
            setHpA(localHpA);
          }

          shockPhase = 1.0;
          shakeTimer = isCrit ? 0.24 : 0.12;
          impactCallbackRef.current?.(isCrit);
          if (isCrit) {
            roarCallbackRef.current?.(attacker.type);
          }

          setBattleLogs((prev) => [
            {
              id: Date.now() + Math.random(),
              text: isCrit
                ? `💥 【${attacker.name}】發動暴擊猛撲，對【${defender.name}】造成 ${dmg} 點重創！`
                : `⚔️ 【${attacker.name}】衝撞攻擊，對【${defender.name}】造成 ${dmg} 點傷害`,
              tone: isCrit ? 'crit' : 'hit',
            },
            ...prev.slice(0, 6),
          ]);

          if (localHpA <= 0 || localHpB <= 0) {
            battleSettled = true;
            const winner = localHpB <= 0 ? fighterA : fighterB;
            if (meshA) {
              setDinosaurAnimationState(meshA, winner.id === fighterA.id ? 'eating' : 'idle', 0.2);
            }
            if (meshB) {
              setDinosaurAnimationState(meshB, winner.id === fighterB.id ? 'eating' : 'idle', 0.2);
            }
            const res = completeCallbackRef.current(fighterA.id, fighterB.id, winner.id);
            setBattleLogs((prev) => [
              {
                id: Date.now() + Math.random(),
                text: `🏆 【${winner.name}】獲得最終勝利！全場觀眾歡呼沸騰！`,
                tone: 'win',
              },
              ...prev.slice(0, 6),
            ]);
            setResultInfo({
              winnerId: winner.id,
              winnerName: winner.name,
              prize: res?.prize ?? 0,
              popularityGain: res?.popularityGain ?? 0,
            });
            setBattlePhase('finished');
          }

          turnA = !turnA;
        }
      } else {
        // Gentle showcase framing in select / finished phase
        const t = now * 0.0005;
        camera.position.set(Math.sin(t) * 1.1, 4.3, 7.2);
        camera.lookAt(0, 0.85, 0);
      }

      // Lunge motions for fighters
      if (lungeTimerA > 0) {
        lungeTimerA = Math.max(0, lungeTimerA - dt);
      }
      if (lungeTimerB > 0) {
        lungeTimerB = Math.max(0, lungeTimerB - dt);
      }
      if (meshA) {
        const offsetA = Math.sin((lungeTimerA / 0.38) * Math.PI) * 1.15;
        meshA.position.x = -1.75 + (lungeTimerA > 0 ? offsetA : 0);
      }
      if (meshB) {
        const offsetB = Math.sin((lungeTimerB / 0.38) * Math.PI) * 1.15;
        meshB.position.x = 1.75 - (lungeTimerB > 0 ? offsetB : 0);
      }

      // Shockwave ring expansion
      if (shockPhase > 0) {
        shockPhase = Math.max(0, shockPhase - dt * 2.8);
        const s = 1 + (1 - shockPhase) * 4.5;
        shockRing.scale.set(s, s, 1);
        shockMat.opacity = shockPhase * 0.85;
      } else {
        shockMat.opacity = 0;
      }

      renderer.render(scene, camera);
    };

    tick();

    return () => {
      cancelAnimationFrame(frameId);
      renderer.dispose();
    };
  }, [open, arenaBuiltCount, fighterAType, fighterBType, battlePhase]);

  if (!open) return null;

  const startDuel = () => {
    if (!fighterA || !fighterB || fighterA.id === fighterB.id) return;
    const statsA = getDinoCombatStats(fighterA);
    const statsB = getDinoCombatStats(fighterB);
    setMaxHpA(statsA.maxHp);
    setMaxHpB(statsB.maxHp);
    setHpA(statsA.maxHp);
    setHpB(statsB.maxHp);
    setResultInfo(null);
    setBattleLogs([
      {
        id: Date.now(),
        text: `🔥 【${fighterA.name}】VS【${fighterB.name}】3D 競技場對決正式開始！`,
        tone: 'hit',
      },
    ]);
    setBattlePhase('fighting');
  };

  const resetDuel = () => {
    setResultInfo(null);
    setBattleLogs([]);
    setBattlePhase('select');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
      onClick={onClose}
    >
      <div
        className="w-[min(980px,96vw)] max-h-[90vh] rounded-2xl bg-slate-900 border border-white/15 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-slate-950/60">
          <div>
            <h2 className="text-base font-extrabold text-white flex items-center gap-2">
              <Swords className="w-4 h-4 text-rose-400" />
              <span>恐龍競技場 · 3D 對決模擬中心</span>
            </h2>
            <p className="text-xs text-slate-400">
              派遣兩隻已成長恐龍（成長度 100%）上場對決，獲勝可提升園區人氣並贏得賽事獎金
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg bg-white/10 hover:bg-red-500/30 text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto custom-scroll flex flex-col gap-4">
          {arenaBuiltCount === 0 ? (
            <div className="rounded-xl bg-white/5 border border-white/10 p-8 text-center flex flex-col items-center gap-3">
              <Trophy className="w-10 h-10 text-amber-400" />
              <h3 className="text-base font-extrabold text-white">園區尚未建造「恐龍競技場」</h3>
              <p className="text-xs text-slate-300 max-w-md">
                請先於底部「公共設施與展區」選單中選擇並建造恐龍競技場（$1,800），即可派遣兩隻已成長恐龍舉辦 3D 對決賽事！
              </p>
              {onBuildArena && (
                <button
                  onClick={() => {
                    onBuildArena();
                    onClose();
                  }}
                  className="px-4 py-2 rounded-xl bg-amber-500/25 hover:bg-amber-500/40 border border-amber-400 text-amber-100 text-xs font-extrabold cursor-pointer"
                >
                  前往建造恐龍競技場 ($1,800)
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Fighter Selectors + VS Stage */}
              <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_260px] gap-4 items-stretch">
                {/* Fighter A Selector */}
                <div className="rounded-xl bg-slate-950/60 border border-rose-500/30 p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs font-extrabold text-rose-300 border-b border-white/10 pb-1.5">
                    <span>紅方出戰恐龍</span>
                    {fighterA && (
                      <span className="font-mono-num text-slate-300">
                        {fighterA.arenaWins} 勝
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto custom-scroll pr-1">
                    {grownDinos.length === 0 ? (
                      <div className="text-[11px] text-slate-400 py-4 text-center">
                        尚無已成長（100%）恐龍
                      </div>
                    ) : (
                      grownDinos.map((d) => {
                        const selected = d.id === dinoAId;
                        const disabled = battlePhase === 'fighting' || d.id === dinoBId;
                        return (
                          <button
                            key={d.id}
                            disabled={disabled}
                            onClick={() => setDinoAId(d.id)}
                            className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border text-left text-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                              selected
                                ? 'bg-rose-500/25 border-rose-400 text-white'
                                : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="w-3 h-3 rounded-sm shrink-0"
                                style={{ backgroundColor: d.hex }}
                              />
                              <span className="font-bold truncate">{d.name}</span>
                            </div>
                            <span className="text-[11px] font-mono-num text-amber-300 shrink-0">
                              人氣 {d.popularity}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* 3D Arena Stage */}
                <div className="flex flex-col gap-2.5">
                  {/* Top HP Bars */}
                  {fighterA && fighterB && (
                    <div className="grid grid-cols-2 gap-3 bg-slate-950/75 border border-white/10 rounded-xl px-3 py-2">
                      <div>
                        <div className="flex justify-between text-[11px] font-bold mb-1">
                          <span className="text-rose-300 truncate">{fighterA.name}</span>
                          <span className="font-mono-num text-slate-200">
                            {hpA} / {maxHpA}
                          </span>
                        </div>
                        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-rose-500 transition-all duration-200"
                            style={{ width: `${Math.max(0, (hpA / Math.max(1, maxHpA)) * 100)}%` }}
                          />
                        </div>
                      </div>
                      <div>
                        <div className="flex justify-between text-[11px] font-bold mb-1">
                          <span className="text-sky-300 truncate">{fighterB.name}</span>
                          <span className="font-mono-num text-slate-200">
                            {hpB} / {maxHpB}
                          </span>
                        </div>
                        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-sky-500 transition-all duration-200"
                            style={{ width: `${Math.max(0, (hpB / Math.max(1, maxHpB)) * 100)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="relative w-full h-64 rounded-2xl overflow-hidden border border-white/15 bg-slate-950">
                    <div ref={stageRef} className="w-full h-full" />
                    {resultInfo && battlePhase === 'finished' && (
                      <div className="absolute inset-x-4 bottom-3 rounded-xl bg-slate-950/90 border border-amber-400/60 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 shadow-xl">
                        <div className="flex items-center gap-2 text-xs font-extrabold text-amber-300">
                          <Award className="w-4 h-4 shrink-0" />
                          <span>冠軍：{resultInfo.winnerName}</span>
                        </div>
                        <div className="text-xs font-mono-num text-emerald-300 font-bold">
                          獎金 +${resultInfo.prize} · 人氣 +{resultInfo.popularityGain}%
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Start / Reset Controls */}
                  <div className="flex items-center justify-center gap-3">
                    {battlePhase === 'select' && (
                      <button
                        onClick={startDuel}
                        disabled={!fighterA || !fighterB || fighterA.id === fighterB.id}
                        className="flex items-center gap-2 px-5 py-2 rounded-xl bg-rose-500/25 hover:bg-rose-500/40 disabled:opacity-40 border border-rose-400 text-rose-100 text-xs font-extrabold cursor-pointer disabled:cursor-not-allowed"
                      >
                        <Play className="w-3.5 h-3.5" />
                        <span>
                          {grownDinos.length < 2
                            ? '需至少兩隻已成長（100%）恐龍方可開戰'
                            : '開始 3D 競技對決'}
                        </span>
                      </button>
                    )}

                    {battlePhase === 'fighting' && (
                      <div className="px-4 py-2 rounded-xl bg-amber-500/15 border border-amber-400/40 text-amber-200 text-xs font-bold">
                        3D 競技場激戰模擬進行中⋯
                      </div>
                    )}

                    {battlePhase === 'finished' && (
                      <button
                        onClick={resetDuel}
                        className="flex items-center gap-2 px-5 py-2 rounded-xl bg-sky-500/25 hover:bg-sky-500/40 border border-sky-400 text-sky-100 text-xs font-extrabold cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>再舉辦一場對決</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Fighter B Selector */}
                <div className="rounded-xl bg-slate-950/60 border border-sky-500/30 p-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-xs font-extrabold text-sky-300 border-b border-white/10 pb-1.5">
                    <span>藍方出戰恐龍</span>
                    {fighterB && (
                      <span className="font-mono-num text-slate-300">
                        {fighterB.arenaWins} 勝
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto custom-scroll pr-1">
                    {grownDinos.length === 0 ? (
                      <div className="text-[11px] text-slate-400 py-4 text-center">
                        尚無已成長（100%）恐龍
                      </div>
                    ) : (
                      grownDinos.map((d) => {
                        const selected = d.id === dinoBId;
                        const disabled = battlePhase === 'fighting' || d.id === dinoAId;
                        return (
                          <button
                            key={d.id}
                            disabled={disabled}
                            onClick={() => setDinoBId(d.id)}
                            className={`flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg border text-left text-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                              selected
                                ? 'bg-sky-500/25 border-sky-400 text-white'
                                : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <span
                                className="w-3 h-3 rounded-sm shrink-0"
                                style={{ backgroundColor: d.hex }}
                              />
                              <span className="font-bold truncate">{d.name}</span>
                            </div>
                            <span className="text-[11px] font-mono-num text-amber-300 shrink-0">
                              人氣 {d.popularity}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Growing Status Note + Live Combat Log */}
              {growingDinos.length > 0 && (
                <div className="text-xs text-amber-200 bg-amber-500/10 border border-amber-400/25 rounded-xl px-3.5 py-2 flex flex-wrap items-center justify-between gap-2">
                  <span>
                    成長中恐龍（達 100% 即可出戰競技場，餵食可立即加速成長 +25%）：
                  </span>
                  <span className="font-mono-num font-bold">
                    {growingDinos.map((g) => `${g.name} (${g.growth}%)`).join(' · ')}
                  </span>
                </div>
              )}

              {battleLogs.length > 0 && (
                <div className="rounded-xl bg-slate-950/60 border border-white/10 p-3 flex flex-col gap-1.5 max-h-32 overflow-y-auto custom-scroll">
                  {battleLogs.map((log) => (
                    <div
                      key={log.id}
                      className={`text-xs ${
                        log.tone === 'win'
                          ? 'text-amber-300 font-extrabold'
                          : log.tone === 'crit'
                            ? 'text-rose-300 font-bold'
                            : 'text-slate-300'
                      }`}
                    >
                      {log.text}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
