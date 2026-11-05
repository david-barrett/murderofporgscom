import { useState, useMemo } from 'react';
import { 
  Cpu, Database, TrendingUp, Swords, Target, Layers, 
  CheckCircle2, AlertTriangle, ArrowRightLeft, BarChart3, Sparkles, Key, Crosshair, FileText, RefreshCw 
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend 
} from 'recharts';

import cardCache from '../../data/card-cache.json';
import metaDecksCache from '../../data/meta-decks.json';

export default function DeckGrader() {
  const [fetchStats] = useState({ 
    cached: Object.keys(cardCache || {}).length, 
    api: 0 
  });
  
  const metaDecks: Record<string, any> = metaDecksCache || {};
  const presetKeys = Object.keys(metaDecks);
  const defaultKey = presetKeys[0] || '';

  const [selectedPreset, setSelectedPreset] = useState<string>(defaultKey);
  const [rawDeckInput, setRawDeckInput] = useState<string>('');
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);

  const resolvedCards: Record<string, any> = cardCache || {};
  const currentDeckData = metaDecks[selectedPreset] || { 
    metadata: { name: "Custom Build", author: "User", winRate: "N/A" },
    leader: { id: "", count: 1 },
    base: { id: "", count: 1 },
    deck: [] 
  };

  const findCardData = (identifier: string) => {
    if (!identifier) return null;
    const cleanId = identifier.trim().toUpperCase();
    if (resolvedCards[cleanId]) return resolvedCards[cleanId];

    const found = Object.values(resolvedCards).find((v: any) => 
      v.name?.toUpperCase() === cleanId || 
      v.name?.toUpperCase().includes(cleanId) ||
      `${v.set}_${v.number}`.toUpperCase() === cleanId
    );
    return found || null;
  };

  const handleSelectPreset = (key: string) => {
    setSelectedPreset(key);
    const preset = metaDecks[key];
    if (preset && Array.isArray(preset.deck)) {
      const textList = preset.deck
        .map((item: any) => {
          const rawId = item.id || item.cardId || item.setNumber || item.name || '';
          const count = item.count || item.quantity || 1;
          const cardInfo = findCardData(rawId);
          const displayName = cardInfo?.name || rawId || "Unknown Card";
          return `${count}x ${displayName}`;
        })
        .join('\n');
      setRawDeckInput(textList);
    }
  };

  const analysis = useMemo(() => {
    const c: Record<string, number> = { '1': 0, '2': 0, '3': 0, '4': 0, '5': 0, '6+': 0 };
    let countTotal = 0;
    let costSum = 0;
    let unitCount = 0;
    let groundUnits = 0;
    let spaceUnits = 0;
    let events = 0;
    let upgrades = 0;
    const traitCounts: Record<string, number> = {};

    const lines = rawDeckInput.split('\n');
    lines.forEach(line => {
      const match = line.match(/^(\d+)x?\s+(.+)$/);
      if (match) {
        const qty = parseInt(match[1], 10) || 1;
        const queryTerm = match[2].trim();
        const cardData: any = findCardData(queryTerm);

        if (cardData) {
          const cost = cardData.cost ?? 2;
          const costKey = cost >= 6 ? '6+' : String(cost);
          c[costKey] = (c[costKey] || 0) + qty;
          countTotal += qty;

          const type = cardData.type || '';
          if (type === 'Unit' || type.toLowerCase() === 'unit') {
            unitCount += qty;
            costSum += cost * qty;
            const arena = cardData.arena || '';
            if (arena === 'Ground') groundUnits += qty;
            else if (arena === 'Space') spaceUnits += qty;
            else groundUnits += qty;
          } else if (type === 'Event' || type.toLowerCase() === 'event') {
            events += qty;
          } else if (type === 'Upgrade' || type.toLowerCase() === 'upgrade') {
            upgrades += qty;
          }

          cardData.traits?.forEach((t: string) => {
            traitCounts[t] = (traitCounts[t] || 0) + qty;
          });
        } else {
          c['2'] = (c['2'] || 0) + qty;
          countTotal += qty;
          unitCount += qty;
          costSum += 2 * qty;
          groundUnits += qty;
        }
      }
    });

    const avgUnitCost = unitCount > 0 ? (costSum / unitCount) : 2.5;
    const spaceRatio = unitCount > 0 ? Math.round((spaceUnits / unitCount) * 100) : 0;
    const groundRatio = unitCount > 0 ? Math.round((groundUnits / unitCount) * 100) : 0;

    let inferredArchetype = "Midrange / Tempo";
    let targetCurve: Record<string, number> = { '1': 4, '2': 7, '3': 8, '4': 6, '5': 3, '6+': 2 };

    if (avgUnitCost < 2.6) {
      inferredArchetype = "Aggro Rush";
      targetCurve = { '1': 8, '2': 10, '3': 6, '4': 3, '5': 1, '6+': 0 };
    } else if (avgUnitCost >= 3.6 || c['6+'] >= 5) {
      inferredArchetype = "Control / Ramp";
      targetCurve = { '1': 3, '2': 6, '3': 7, '4': 6, '5': 5, '6+': 6 };
    }

    const chartData = ['1', '2', '3', '4', '5', '6+'].map(cost => ({
      cost: `Cost ${cost}`,
      Actual: c[cost] || 0,
      'Inferred Target': targetCurve[cost] || 0
    }));

    let score = 92;
    const warnings: string[] = [];
    const bonuses: string[] = [];

    if (spaceUnits === 0 && unitCount > 0) {
      score -= 15;
      warnings.push("Zero Space Units! Opponent has free unhindered base attacks in space.");
    } else if (spaceRatio < 20 && unitCount > 0) {
      score -= 8;
      warnings.push(`Low space arena presence (${spaceRatio}% of units).`);
    } else {
      bonuses.push("Healthy Ground & Space Arena Split");
    }

    if (inferredArchetype === "Aggro Rush" && c['6+'] > 2) {
      score -= 10;
      warnings.push("Too many high-cost cards (>5 cost) for an aggressive curve profile.");
    }

    if (events > 14) {
      score -= 8;
      warnings.push("High event count may result in dead hands with no unit presence on board.");
    } else {
      bonuses.push("Strong Unit-to-Event Balance");
    }

    let grade = 'A';
    if (score >= 90) grade = 'S';
    else if (score >= 80) grade = 'A';
    else if (score >= 70) grade = 'B';
    else if (score >= 60) grade = 'C';
    else grade = 'F';

    return {
      curve: c,
      targetCurve,
      chartData,
      totalCards: countTotal,
      totalUnits: unitCount,
      groundUnits,
      spaceUnits,
      events,
      upgrades,
      spaceRatio,
      groundRatio,
      avgUnitCost: avgUnitCost.toFixed(2),
      inferredArchetype,
      score: Math.max(0, Math.min(100, score)),
      grade,
      warnings,
      bonuses
    };
  }, [rawDeckInput, resolvedCards]);

  const leaderRaw = currentDeckData.leader?.id || currentDeckData.leader?.cardId || '';
  const leaderInfo = findCardData(leaderRaw);
  const leaderName = leaderInfo?.name || leaderRaw || currentDeckData.metadata?.name || "Commander";

  const runAiAnalysis = () => {
    setAiAnalysis({
      summary: `Your deck layout indicates a ${analysis.inferredArchetype} profile led by ${leaderName}. Detected average unit cost of ${analysis.avgUnitCost} with a ${analysis.spaceRatio}% space allocation.`,
      mulligan: [
        "Priority 1: Secure early 1-2 cost units to contest initiative on turn 1.",
        "Priority 2: Hold targeted removal events if facing fast aggressive archetypes.",
        "Redraw: Pitch high-cost 5+ bombs if appearing in opening hand."
      ],
      sideboardPlan: [
        { matchup: "vs. Hyper Aggro", out: "-2 High-cost bombs", in: "+2 Cheap sentinels / base healing" },
        { matchup: "vs. Control", out: "-3 Low-impact defenders", in: "+3 Hand disruption / shield breakers" },
        { matchup: "vs. Midrange", out: "-1 Situational card", in: "+1 Targeted removal" }
      ]
    });
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-6 md:p-10 max-w-7xl mx-auto space-y-8 text-left selection:bg-cyan-500 selection:text-slate-950">
      
      {/* HEADER BAR */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/80 backdrop-blur-md p-6 rounded-2xl border border-slate-800/80 shadow-xl">
        <div className="flex items-center space-x-4">
          <div className="bg-gradient-to-br from-cyan-500 to-blue-600 p-3 rounded-xl shadow-lg shadow-cyan-500/20">
            <Crosshair className="w-6 h-6 text-slate-950 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-wider text-slate-100 flex items-center gap-3">
              SWU DECK GRADER 
              <span className="text-[10px] px-2.5 py-1 rounded-full bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 font-semibold tracking-wide">
                AUTOMATED ARCHETYPE INFERENCE
              </span>
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">Evaluate your Star Wars: Unlimited deck lists against top tournament archetypes.</p>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-gray-300 bg-slate-950/80 px-4 py-2.5 rounded-xl border border-slate-800/80 shadow-inner">
          <span className="flex items-center gap-2"><Database size={15} className="text-emerald-400" /> Cached Cards: <span className="font-bold text-white">{fetchStats.cached}</span></span>
          <button 
            onClick={() => setShowKeyModal(true)}
            className="flex items-center space-x-1.5 text-cyan-400 hover:text-cyan-300 border-l border-slate-800 pl-3 transition font-medium"
          >
            <Key className="w-3.5 h-3.5" />
            <span>Architecture</span>
          </button>
        </div>
      </header>

      {/* PRESET SELECTORS */}
      <section className="space-y-3 bg-slate-900/50 backdrop-blur-sm p-5 rounded-2xl border border-slate-800/70 shadow-sm">
        <label className="text-xs font-semibold text-slate-300 flex items-center gap-2 uppercase tracking-wider">
          <Swords size={15} className="text-amber-400" /> Loaded Meta Archetypes (from Cache):
        </label>
        <div className="flex flex-wrap gap-2.5">
          {presetKeys.length > 0 ? presetKeys.map((key) => (
            <button
              key={key}
              onClick={() => handleSelectPreset(key)}
              className={`px-3.5 py-2 rounded-xl font-medium text-xs transition-all flex items-center gap-2 ${
                selectedPreset === key 
                  ? 'bg-cyan-600 text-slate-950 font-bold shadow-lg shadow-cyan-950/50 ring-2 ring-cyan-400/50 scale-[1.02]' 
                  : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 border border-slate-700/60 hover:border-slate-600'
              }`}
            >
              {metaDecks[key].metadata?.name || key}
            </button>
          )) : (
            <p className="text-xs text-gray-500 italic">No cached meta decks found.</p>
          )}
        </div>
      </section>

      {/* TOP DECK SCORE OVERVIEW & INFERRED ARCHETYPE BANNER */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* LEFT: DECKLIST INPUT AREA */}
        <div className="bg-slate-900/80 backdrop-blur-md p-6 rounded-2xl border border-slate-800/80 flex flex-col space-y-4 shadow-xl">
          <div className="flex justify-between items-center">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-cyan-400" /> Deck List Input
            </label>
            <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">{analysis.totalCards} cards</span>
          </div>
          <textarea
            value={rawDeckInput}
            onChange={(e) => setRawDeckInput(e.target.value)}
            rows={11}
            className="w-full bg-slate-950/90 border border-slate-800/90 rounded-xl p-3.5 text-xs font-mono text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 resize-none shadow-inner"
            placeholder="Select a meta deck above or paste cards..."
          />
          <button 
            onClick={runAiAnalysis}
            className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/30 transition-all text-xs tracking-wide"
          >
            <Cpu size={16} /> Run AI Edge Coach Analysis
          </button>
        </div>

        {/* RIGHT: GRADE, STATS & ARENA BREAKDOWN */}
        <div className="lg:col-span-2 space-y-6 flex flex-col justify-between">
          <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center space-x-6">
              <div className={`w-20 h-20 rounded-2xl border-2 flex flex-col items-center justify-center font-black shadow-lg ${
                analysis.grade === 'S' ? 'text-cyan-400 border-cyan-500/50 bg-cyan-950/40 shadow-cyan-950/50' :
                analysis.grade === 'A' ? 'text-emerald-400 border-emerald-500/50 bg-emerald-950/30 shadow-emerald-950/50' :
                'text-amber-400 border-amber-500/50 bg-amber-950/30 shadow-amber-950/50'
              }`}>
                <span className="text-4xl tracking-tighter leading-none">{analysis.grade}</span>
                <span className="text-[10px] opacity-80 uppercase tracking-widest mt-1">Grade</span>
              </div>

              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-bold text-slate-100">{currentDeckData.metadata?.name || leaderName}</h2>
                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800 font-semibold">
                    Inferred: {analysis.inferredArchetype}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">Leader: {leaderName}</p>
                
                <div className="flex items-center space-x-5 mt-4">
                  <div className="text-xs text-slate-300">
                    Score: <span className="font-bold text-cyan-400 text-sm">{analysis.score}/100</span>
                  </div>
                  <div className="text-xs text-slate-300">
                    Avg Unit Cost: <span className="font-bold text-white text-sm">{analysis.avgUnitCost}</span>
                  </div>
                  <div className="text-xs text-slate-300">
                    Units: <span className="font-bold text-emerald-400 text-sm">{analysis.totalUnits}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ARENA SPLIT */}
            <div className="w-full md:w-64 bg-slate-950/90 border border-slate-800/90 rounded-xl p-4 space-y-2.5 shadow-inner">
              <div className="flex justify-between text-xs font-semibold">
                <span className="text-cyan-400">Ground ({analysis.groundUnits})</span>
                <span className="text-purple-400">Space ({analysis.spaceUnits})</span>
              </div>
              <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden flex p-0.5 bg-slate-900">
                <div style={{ width: `${analysis.groundRatio}%` }} className="bg-cyan-500 h-full rounded-l-full transition-all duration-500" />
                <div style={{ width: `${analysis.spaceRatio}%` }} className="bg-purple-500 h-full rounded-r-full transition-all duration-500" />
              </div>
              <div className="flex justify-between text-[11px] text-slate-400 font-medium">
                <span>{analysis.groundRatio}% Ground</span>
                <span>{analysis.spaceRatio}% Space</span>
              </div>
            </div>
          </div>

          {/* WARNINGS & BONUSES GRID */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800/80 rounded-2xl p-5 space-y-2.5 shadow-lg">
              <h3 className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Tactical Strengths
              </h3>
              <ul className="space-y-1.5">
                {analysis.bonuses.map((b, i) => (
                  <li key={i} className="text-xs text-slate-300 flex items-start gap-2">
                    <span className="text-emerald-500 font-bold">•</span> <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800/80 rounded-2xl p-5 space-y-2.5 shadow-lg">
              <h3 className="text-xs font-semibold text-amber-400 uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" /> Inference Warnings
              </h3>
              {analysis.warnings.length === 0 ? (
                <p className="text-xs text-emerald-400 italic">No curve anomalies detected for this archetype.</p>
              ) : (
                <ul className="space-y-1.5">
                  {analysis.warnings.map((w, i) => (
                    <li key={i} className="text-xs text-slate-300 flex items-start gap-2">
                      <span className="text-amber-500 font-bold">•</span> <span>{w}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* DETAILED TABS SECTION */}
      <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl">
        <div className="flex border-b border-slate-800/80 bg-slate-950/80 overflow-x-auto">
          {[
            { id: 'overview', label: 'Curve Visualizer', icon: BarChart3 },
            { id: 'matchup', label: 'Meta Matchup Strategy', icon: TrendingUp },
            { id: 'sideboard', label: 'Sideboard Swap Guide', icon: ArrowRightLeft },
            { id: 'ai', label: 'AI Tactical Coach', icon: Sparkles }
          ].map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2.5 px-6 py-4 text-xs font-semibold border-b-2 transition whitespace-nowrap ${
                  activeTab === tab.id
                    ? 'border-cyan-500 text-cyan-400 bg-slate-900/90 shadow-sm'
                    : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-950/50'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <div className="p-6 md:p-8">
          {activeTab === 'overview' && (
            <div className="space-y-5">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Resource Curve vs. Inferred Target ({analysis.inferredArchetype})</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Comparing your actual deck distribution against the automatically inferred competitive model.</p>
                </div>
                <div className="flex items-center space-x-5 text-xs bg-slate-950 px-4 py-2 rounded-xl border border-slate-800">
                  <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-cyan-500 rounded-sm shadow-sm" /><span className="text-slate-300 font-medium">Your Deck</span></div>
                  <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-slate-700 rounded-sm" /><span className="text-slate-400 font-medium">Inferred Target</span></div>
                </div>
              </div>
              <div className="w-full h-72 pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analysis.chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis dataKey="cost" stroke="#64748b" tick={{ fontSize: 11 }} />
                    <YAxis stroke="#64748b" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ backgroundColor: '#020617', borderColor: '#334155', color: '#f8fafc', fontSize: '12px', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.5)' }} />
                    <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
                    <Bar dataKey="Actual" fill="#06b6d4" name="Your Deck" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="Inferred Target" fill="#334155" name="Inferred Target" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {activeTab === 'matchup' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-slate-950/90 border border-slate-800/90 rounded-2xl p-5 space-y-2.5 shadow-md">
                <h4 className="text-xs font-bold text-red-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></span> vs. Hyper Aggro
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">Prioritize early ground sentinels and instant removal events to survive the opening blitz.</p>
              </div>
              <div className="bg-slate-950/90 border border-slate-800/90 rounded-2xl p-5 space-y-2.5 shadow-md">
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span> vs. Midrange Value
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">Contest leadership deployment turns using action-compression events to seize tempo.</p>
              </div>
              <div className="bg-slate-950/90 border border-slate-800/90 rounded-2xl p-5 space-y-2.5 shadow-md">
                <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400"></span> vs. Hard Control
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">Apply dual-arena pressure without over-extending into mass board wipe events.</p>
              </div>
            </div>
          )}

          {activeTab === 'sideboard' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Sideboard Swap Guide</h3>
              <div className="divide-y divide-slate-800/80 border border-slate-800/80 rounded-2xl bg-slate-950/90 overflow-hidden shadow-md">
                {[
                  { matchup: "vs. Hyper Aggro", out: "-2 High-cost bombs", in: "+2 Cheap sentinels / base healing" },
                  { matchup: "vs. Control", out: "-3 Low-impact defenders", in: "+3 Hand disruption / shield breakers" },
                  { matchup: "vs. Midrange", out: "-1 Situational card", in: "+1 Targeted removal" }
                ].map((plan, idx) => (
                  <div key={idx} className="p-4 md:p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 text-xs">
                    <span className="font-bold text-cyan-400 w-36">{plan.matchup}</span>
                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
                      <div className="bg-red-950/30 border border-red-900/30 p-2.5 rounded-xl text-red-300 font-medium">Out: {plan.out}</div>
                      <div className="bg-emerald-950/30 border border-emerald-900/30 p-2.5 rounded-xl text-emerald-300 font-medium">In: {plan.in}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'ai' && (
            <div className="space-y-4">
              <div className="flex justify-between items-center bg-slate-950/90 p-5 rounded-2xl border border-slate-800/90 shadow-md">
                <span className="text-xs font-bold text-slate-200 tracking-wide uppercase">AI Strategic Edge Coach</span>
                <button onClick={runAiAnalysis} className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-3.5 py-2 rounded-xl text-xs transition shadow-md">Refresh Analysis</button>
              </div>
              {aiAnalysis && (
                <div className="bg-slate-950/90 p-6 rounded-2xl border border-slate-800/90 text-xs text-slate-300 space-y-4 leading-relaxed shadow-md">
                  <p className="font-semibold text-slate-100 text-sm">{aiAnalysis.summary}</p>
                  <ul className="space-y-2 pt-2 border-t border-slate-800/80">
                    {aiAnalysis.mulligan.map((m: string, i: number) => <li key={i} className="flex items-start gap-2"><span className="text-cyan-400 font-bold">•</span> <span>{m}</span></li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* CLOUDFLARE MODAL */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl animate-in fade-in zoom-in duration-200">
            <h3 className="text-sm font-bold text-slate-100 tracking-wide">Cloudflare Pages Security Architecture</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              API keys are safely stored as Cloudflare environment secrets (<code className="bg-slate-950 px-1.5 py-0.5 rounded text-cyan-400 font-mono">env.GEMINI_API_KEY</code>) and accessed via serverless edge functions at <code className="bg-slate-950 px-1.5 py-0.5 rounded text-cyan-400 font-mono">/api/grade</code>.
            </p>
            <div className="flex justify-end pt-2">
              <button onClick={() => setShowKeyModal(false)} className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold px-4 py-2 rounded-xl text-xs transition shadow-lg">Close</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}