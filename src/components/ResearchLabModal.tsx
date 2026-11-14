import React from 'react';
import { ArrowLeft, CheckCircle2, Dna, FlaskConical, Lock, ShieldCheck, Users, X } from 'lucide-react';
import { DINO_SPECIES, TECH_TREE } from '../game/config';
import { GameSnapshot, TechBranch, TechId, TechNodeConfig } from '../game/types';

interface ResearchLabModalProps {
  open: boolean;
  snapshot: GameSnapshot;
  onClose: () => void;
  onBackToManagement?: () => void;
  onUnlockTech: (techId: TechId) => void;
}

const BRANCH_META: Record<
  TechBranch,
  { title: string; subtitle: string; icon: React.ComponentType<{ className?: string }>; accent: string }
> = {
  species: {
    title: '基因圖譜與新物種',
    subtitle: '投入利潤拼合高人氣史前巨獸 DNA，擴展園區培育陣容',
    icon: Dna,
    accent: 'text-emerald-300',
  },
  fence: {
    title: '高階高壓防護圍欄',
    subtitle: '全面升級圍欄材料與等離子力場，大幅提高園區安全評級',
    icon: ShieldCheck,
    accent: 'text-sky-300',
  },
  operations: {
    title: '員工與營運效率科技',
    subtitle: '強化清潔員、飼養員與保全作業效率，並放大門票與觀賞收益',
    icon: Users,
    accent: 'text-amber-300',
  },
};

export const ResearchLabModal: React.FC<ResearchLabModalProps> = ({
  open,
  snapshot,
  onClose,
  onBackToManagement,
  onUnlockTech,
}) => {
  if (!open) return null;

  const unlockedSet = new Set(snapshot.unlockedTechs);
  const branches: TechBranch[] = ['species', 'fence', 'operations'];

  const renderNodeCard = (node: TechNodeConfig) => {
    const isUnlocked = unlockedSet.has(node.id);
    const prereqNode = node.prerequisite
      ? TECH_TREE.find((t) => t.id === node.prerequisite) || null
      : null;
    const prereqMet = !node.prerequisite || unlockedSet.has(node.prerequisite);
    const canAfford = snapshot.money >= node.cost;
    const speciesCfg = node.unlockSpeciesId ? DINO_SPECIES[node.unlockSpeciesId] : null;

    return (
      <div
        key={node.id}
        className={`rounded-xl border p-3.5 flex flex-col justify-between gap-3 transition-colors ${
          isUnlocked
            ? 'bg-emerald-950/35 border-emerald-400/45'
            : prereqMet
              ? 'bg-slate-950/60 border-white/15'
              : 'bg-slate-950/35 border-white/10 opacity-75'
        }`}
      >
        <div className="flex flex-col gap-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {speciesCfg && (
                <span
                  className="w-3.5 h-3.5 rounded-sm shrink-0 border border-white/30"
                  style={{ backgroundColor: speciesCfg.hex }}
                />
              )}
              <h4 className="text-xs font-extrabold text-white truncate">{node.name}</h4>
            </div>
            {isUnlocked ? (
              <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-300 shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>已研發</span>
              </span>
            ) : (
              <span className="text-xs font-extrabold font-mono-num text-yellow-300 shrink-0">
                ${node.cost.toLocaleString()}
              </span>
            )}
          </div>

          <p className="text-[11px] leading-relaxed text-slate-300">{node.desc}</p>

          <div className="text-[11px] font-semibold text-sky-300 bg-sky-500/10 border border-sky-400/20 rounded-lg px-2.5 py-1.5">
            效果：{node.effectLabel}
          </div>

          {prereqNode && !isUnlocked && (
            <div
              className={`flex items-center gap-1.5 text-[11px] ${
                prereqMet ? 'text-emerald-300' : 'text-amber-300'
              }`}
            >
              <Lock className="w-3 h-3 shrink-0" />
              <span>
                前置研究：{prereqNode.name}（{prereqMet ? '已達成' : '未完成'}）
              </span>
            </div>
          )}
        </div>

        <button
          onClick={() => onUnlockTech(node.id)}
          disabled={isUnlocked || !prereqMet || !canAfford}
          className={`w-full py-2 px-3 rounded-lg text-xs font-extrabold border transition-colors cursor-pointer disabled:cursor-not-allowed ${
            isUnlocked
              ? 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200 opacity-80'
              : !prereqMet
                ? 'bg-white/5 border-white/10 text-slate-500'
                : !canAfford
                  ? 'bg-red-500/15 border-red-400/30 text-red-300 opacity-80'
                  : 'bg-amber-500/25 hover:bg-amber-500/40 border-amber-400 text-amber-100'
          }`}
        >
          {isUnlocked
            ? '已完成研究'
            : !prereqMet
              ? '需先完成前置研究'
              : !canAfford
                ? `資金不足（需 $${node.cost.toLocaleString()}）`
                : `投入 $${node.cost.toLocaleString()} 解鎖`}
        </button>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
      onClick={onClose}
    >
      <div
        className="w-[min(1040px,96vw)] max-h-[89vh] rounded-2xl bg-slate-900 border border-white/15 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-white/10 bg-slate-950/60">
          <div className="flex items-center gap-3">
            {onBackToManagement && (
              <button
                onClick={onBackToManagement}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-slate-200 text-xs font-bold cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>返回管理</span>
              </button>
            )}
            <div>
              <h2 className="text-base font-extrabold text-white flex items-center gap-2">
                <FlaskConical className="w-4 h-4 text-emerald-300" />
                <span>基因研究實驗室與園區科技樹</span>
              </h2>
              <p className="text-xs text-slate-400">
                消耗營運累積利潤，解鎖稀有恐龍、高壓等離子圍欄與員工效率升級
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-4 text-xs bg-slate-900/90 border border-white/10 rounded-xl px-3.5 py-1.5">
              <div>
                <span className="text-slate-400 mr-1.5">可用資金</span>
                <span className="font-extrabold font-mono-num text-yellow-300">
                  ${snapshot.money.toLocaleString()}
                </span>
              </div>
              <span className="text-white/15">|</span>
              <div>
                <span className="text-slate-400 mr-1.5">累積創收</span>
                <span className="font-bold font-mono-num text-emerald-300">
                  ${snapshot.cumulativeRevenue.toLocaleString()}
                </span>
              </div>
              <span className="text-white/15">|</span>
              <div>
                <span className="text-slate-400 mr-1.5">已解鎖</span>
                <span className="font-bold font-mono-num text-sky-300">
                  {snapshot.unlockedTechs.length} / {TECH_TREE.length}
                </span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-red-500/30 text-slate-200 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto custom-scroll flex flex-col gap-5">
          {/* Current Active Buffs Summary Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
            <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
              <div className="text-[11px] text-slate-400">已解密恐龍物種</div>
              <div className="text-sm font-extrabold text-emerald-300 font-mono-num">
                {snapshot.unlockedSpeciesIds.length} / {Object.keys(DINO_SPECIES).length} 種
              </div>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
              <div className="text-[11px] text-slate-400">目前圍欄規格</div>
              <div className="text-sm font-extrabold text-sky-300 font-mono-num">
                Lv.{snapshot.fenceTier}{' '}
                {snapshot.fenceTier === 3 ? '等離子力場' : snapshot.fenceTier === 2 ? '鈦合金高壓' : '標準電網'}
              </div>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
              <div className="text-[11px] text-slate-400">清潔與飼養效率</div>
              <div className="text-sm font-extrabold text-amber-300">
                {unlockedSet.has('staff_cleaner_boost') || unlockedSet.has('staff_keeper_boost')
                  ? '已科技強化'
                  : '標準作業'}
              </div>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2.5">
              <div className="text-[11px] text-slate-400">安全評級加成</div>
              <div className="text-sm font-extrabold text-indigo-300 font-mono-num">
                目前安全 {snapshot.safetyRating}%
              </div>
            </div>
          </div>

          {/* 3 Tech Tree Branches */}
          {branches.map((branch) => {
            const meta = BRANCH_META[branch];
            const Icon = meta.icon;
            const nodes = TECH_TREE.filter((t) => t.branch === branch);
            return (
              <section
                key={branch}
                className="rounded-xl bg-white/5 border border-white/10 p-4 flex flex-col gap-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${meta.accent}`} />
                    <h3 className={`text-sm font-extrabold ${meta.accent}`}>{meta.title}</h3>
                  </div>
                  <span className="text-[11px] text-slate-400">{meta.subtitle}</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {nodes.map((node) => renderNodeCard(node))}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
};
