import { useState, useMemo, useEffect } from 'react';
import { 
  Cpu, Database, TrendingUp, Swords, 
  CheckCircle2, AlertTriangle, ArrowRightLeft, BarChart3, Sparkles, Crosshair, FileText,
  Crown, Shield, Compass, Download, HelpCircle, Eye, X, RotateCw
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend 
} from 'recharts';
import { Seo } from '../components/Seo';
import { CardPreviewModal, type CardPreviewState } from '../components/CardPreviewModal';
import { ASPECT_CONFIG, SET_CONFIG } from '../lib/consts';
import {
  type Deck,
  createEmptyDeck,
  formatCardTypeLabel,
  formatDeckLines,
  getCardImageUrl,
  getLeaderBackImageUrl,
  parseMetaDeck,
  parseSWUDBDeck,
} from '../../lib/decks';
import {
  type AiCoachAnalysis,
  type DeckMetaInfo,
  analyzeDeck,
  buildHeuristicAnalysis,
  buildSideboardPlan,
  computeMetaTargetCurves,
  extractSwudbDeckId,
  findCardData,
} from '../../lib/deckGrader';

import cardCache from '../../data/card-cache.json';
import metaDecksCache from '../../data/meta-decks-v2.json';

function getAspectConfig(name: string) {
  const clean = name.trim();
  const matchedKey = Object.keys(ASPECT_CONFIG).find(
    k => k.toLowerCase() === clean.toLowerCase()
  );
  return matchedKey
    ? ASPECT_CONFIG[matchedKey]
    : {
        label: clean,
        badge: "bg-slate-900 text-slate-300 border-slate-700 shadow-slate-950/40",
        dot: "bg-cyan-400",
      };
}

function getSetConfig(name: string) {
  const clean = name.trim();
  const matchedKey = Object.keys(SET_CONFIG).find(
    k => k.toLowerCase() === clean.toLowerCase()
  );
  return matchedKey
    ? SET_CONFIG[matchedKey]
    : {
        label: clean,
        badge: "bg-slate-900 text-slate-300 border-slate-700 shadow-slate-950/40",
        dot: "bg-cyan-400",
      };
}

const STAR_WARS_LOADING_PHRASES = [
  "Consulting tactical battle droid databanks...",
  "Calibrating deflector shields for opening mulligan...",
  "Scanning Death Star thermal exhaust ports for curve weaknesses...",
  "Triangulating ground vs. space lane pressure...",
  "Translating Bothan reconnaissance telemetry...",
  "Negotiating with Porgs in the Millennium Falcon engine room...",
  "Rerouting auxiliary power to edge inference array...",
  "Simulating 14,000,605 tactical combat outcomes...",
  "Locking S-foils into attack position...",
  "Aligning Kyber crystals with leadership deployment turn...",
  "Calculating hyperdrive jump coordinates for initiative seize..."
];

export default function DeckGrader() {
  const [fetchStats] = useState({ 
    cached: Object.keys(cardCache || {}).length, 
    api: 0 
  });
  
  const metaDecks: Record<string, any> = metaDecksCache || {};
  const presetKeys = Object.keys(metaDecks);
  const defaultKey = presetKeys[0] || '';

  const resolvedCards: Record<string, any> = cardCache || {};

  const [selectedPreset, setSelectedPreset] = useState<string>(defaultKey);
  const [selectedMetaDeck, setSelectedMetaDeck] = useState<any>(() =>
    defaultKey ? metaDecks[defaultKey] ?? null : null
  );

  // Resolve the full Deck directly from selectedMetaDeck + cardCache JSON
  const currentDeck = useMemo<Deck>(() => {
    if (!selectedMetaDeck) {
      return createEmptyDeck();
    }
    return selectedMetaDeck._source === 'swudb'
      ? parseSWUDBDeck(selectedMetaDeck, resolvedCards)
      : parseMetaDeck(selectedMetaDeck, resolvedCards);
  }, [selectedMetaDeck, resolvedCards]);

  const deckMeta = useMemo<DeckMetaInfo>(
    () => ({
      name: selectedMetaDeck?.metadata?.name || selectedMetaDeck?.name || 'Custom Deck',
      author: selectedMetaDeck?.metadata?.author || selectedMetaDeck?.author || 'User',
      winRate: selectedMetaDeck?.metadata?.winRate,
    }),
    [selectedMetaDeck]
  );

  const deckDisplayText = useMemo(() => formatDeckLines(currentDeck), [currentDeck]);

  const [activeTab, setActiveTab] = useState<string>('overview');
  const [showTargetExplainer, setShowTargetExplainer] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<AiCoachAnalysis | null>(null);
  const [aiSource, setAiSource] = useState<'gemini' | 'heuristic' | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [loadingPhraseIdx, setLoadingPhraseIdx] = useState(0);

  useEffect(() => {
    if (!isAnalyzing) {
      setLoadingPhraseIdx(0);
      return;
    }
    const timer = setInterval(() => {
      setLoadingPhraseIdx(prev => (prev + 1) % STAR_WARS_LOADING_PHRASES.length);
    }, 1800);
    return () => clearInterval(timer);
  }, [isAnalyzing]);

  // SWUDB Import state
  const [importUrl, setImportUrl] = useState('');
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState('');

  // Card image hover/lightbox preview state
  const [previewCard, setPreviewCard] = useState<CardPreviewState | null>(null);
  const [galleryView, setGalleryView] = useState<'main' | 'side'>('main');

  const handleSelectPreset = (key: string) => {
    const preset = metaDecks[key];
    if (!preset) return;

    setSelectedPreset(key);
    setSelectedMetaDeck(preset);
    setImportError('');
  };

  /** Import a deck from SWUDB by URL or alphanumeric deck ID */
  const handleSwudbImport = async () => {
    if (!importUrl.trim()) return;
    setImportLoading(true);
    setImportError('');

    try {
      const deckId = extractSwudbDeckId(importUrl);

      const res = await fetch(`/api/swudb/${deckId}`);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to fetch from SWUDB (status ${res.status})`);
      }

      const data = await res.json();
      const previewParsed = parseSWUDBDeck(data, resolvedCards);

      if (previewParsed.main.length === 0) {
        throw new Error('No cards found in the imported deck payload.');
      }

      setSelectedPreset('');
      setSelectedMetaDeck({ ...data, _source: 'swudb' });
      setImportUrl('');
    } catch (err: any) {
      setImportError(err.message || 'Import failed');
    } finally {
      setImportLoading(false);
    }
  };

  // Leader resolution from currentDeck
  const leaderCard = currentDeck.leader;
  const leaderRawId = leaderCard.id || '';
  const leaderCardFromCache = findCardData(leaderRawId, resolvedCards);
  const [leaderRawTitle, leaderRawSub] = leaderCard.name.includes('|')
    ? leaderCard.name.split('|').map((s: string) => s.trim())
    : [leaderCard.name, ''];

  const leaderName = leaderCard.name || leaderCardFromCache?.name || leaderRawTitle || leaderRawId || 'Commander';
  const leaderSubtitle = leaderCard.subtitle || leaderCardFromCache?.subtitle || leaderRawSub || '';
  const leaderFrontUrl = getCardImageUrl(leaderCardFromCache, leaderCard);
  const leaderBackUrl = getLeaderBackImageUrl(leaderCardFromCache, leaderCard);

  // Base resolution from resolvedDeck / currentDeck
  const baseCard = currentDeck.base;
  const baseRawId = baseCard.id || '';
  const baseCardFromCache = findCardData(baseRawId, resolvedCards);
  const baseName = baseCard.name || baseCardFromCache?.name || baseRawId || 'Unassigned Base';
  const baseSubtitle = baseCard.subtitle || baseCardFromCache?.subtitle || '';
  const baseHp = baseCard.hp ?? baseCardFromCache?.hp ?? '30';
  const baseFrontUrl = getCardImageUrl(baseCardFromCache, baseCard);

  // Aspects from Leader & Base in resolvedDeck
  const allAspects = useMemo(() => {
    const fromLeader = leaderCard.aspects?.length ? leaderCard.aspects : (leaderCardFromCache?.aspects ?? []);
    const fromBase = baseCard.aspects?.length ? baseCard.aspects : (baseCardFromCache?.aspects ?? []);
    const combined = [...fromLeader, ...fromBase]
      .map((s) => String(s).trim())
      .filter(Boolean);
    return Array.from(new Set(combined));
  }, [leaderCard.aspects, baseCard.aspects, leaderCardFromCache, baseCardFromCache]);

  // Compute target curves dynamically from cached tournament meta decks
  const metaTargetData = useMemo(() => {
    return computeMetaTargetCurves(metaDecks, resolvedCards);
  }, [metaDecks, resolvedCards]);

  const analysis = useMemo(
    () =>
      analyzeDeck(
        currentDeck.main,
        allAspects,
        resolvedCards,
        metaTargetData,
        currentDeck.base
      ),
    [currentDeck.main, currentDeck.base, allAspects, resolvedCards, metaTargetData]
  );

  const resolvedSideCards = useMemo(
    () =>
      (currentDeck.side || []).map((card) => {
        const cached = findCardData(card.id || card.name, resolvedCards);
        return {
          ...card,
          name: card.name || cached?.name || card.id || 'Unknown Card',
          imageUrl: getCardImageUrl(cached, card),
        };
      }),
    [currentDeck.side, resolvedCards]
  );

  // Compute specific sideboard recommendations naming actual cards to add/remove
  const sideboardPlan = useMemo(
    () => buildSideboardPlan(analysis.parsedCards, resolvedSideCards),
    [analysis.parsedCards, resolvedSideCards]
  );

  // Execute AI Coach Analysis via Edge /api/coach with graceful heuristic fallback
  const runAiAnalysis = async () => {
    setIsAnalyzing(true);
    setActiveTab('ai');

    setTimeout(() => {
      document.getElementById('tabs-section')?.scrollIntoView({ behavior: 'smooth' });
    }, 50);

    const payload = {
      archetype: analysis.inferredArchetype,
      leader: leaderName + ' - ' + leaderSubtitle + " (" + leaderRawId + ")",
      base: baseName + ' - ' + baseSubtitle + " (" + baseRawId + ")",
      aspects: allAspects,
      totalCards: analysis.totalCards,
      avgUnitCost: analysis.avgUnitCost,
      groundRatio: analysis.groundRatio,
      spaceRatio: analysis.spaceRatio,
      curve: analysis.curve,
      deck: currentDeck,
    };

    try {
      const res = await fetch('/api/coach', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(150000),
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success && data.analysis && data.source === 'gemini') {
        setAiAnalysis(data.analysis);
        setAiSource('gemini');
        setAiError(null);
        setIsAnalyzing(false);
        return;
      } else if (data.error && data.configured) {
        setAiError(data.error);
      } else {
        setAiError(null);
      }
    } catch (err: any) {
      if (err?.name === 'TimeoutError') {
        setAiError("AI inference timed out after 15s — fell back to Edge Heuristic Engine");
      } else {
        setAiError(err?.message || "Could not reach edge /api/coach endpoint");
      }
    }

    // Heuristic Edge fallback when GEMINI_API_KEY is not configured
    setAiAnalysis(
      buildHeuristicAnalysis({
        analysis,
        leaderName,
        leaderSubtitle,
        baseName,
        allAspects,
        sideboardPlan,
      })
    );
    setAiSource('heuristic');
    setIsAnalyzing(false);
  };

  return (
    <>
      <Seo
        title="SWU Deck Grader | Murder of Porgs"
        description="Evaluate your Star Wars: Unlimited deck lists against top tournament archetypes."
        path="/deckgrader"
      />
      <div className="w-full max-w-7xl mx-auto space-y-8 text-left text-slate-100 selection:bg-cyan-500 selection:text-slate-950">
        
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
                className={`px-3.5 py-2 rounded-xl font-medium text-xs transition-all flex items-center gap-2 cursor-pointer ${
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
                <FileText className="w-4 h-4 text-cyan-400" /> Deck List
              </label>
              <span className="text-xs font-medium px-2 py-0.5 rounded bg-slate-950 text-slate-400 border border-slate-800">{analysis.totalCards} cards</span>
            </div>

            {/* SWUDB IMPORT BOX */}
            <div className="space-y-1.5">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={importUrl}
                  onChange={(e) => { setImportUrl(e.target.value); setImportError(''); }}
                  placeholder="Paste SWUDB URL (e.g. swudb.com/deck/view/...) or ID..."
                  className="flex-1 bg-slate-950/90 border border-slate-800/90 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500/50 placeholder:text-slate-600"
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSwudbImport(); }}
                />
                <button
                  onClick={handleSwudbImport}
                  disabled={importLoading || !importUrl.trim()}
                  className="px-3.5 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-40 text-slate-950 font-bold rounded-lg text-xs transition flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <Download size={13} className={importLoading ? "animate-spin" : ""} />
                  {importLoading ? "Loading..." : "Import"}
                </button>
              </div>
              {importError && (
                <p className="text-[11px] text-red-400 font-medium pl-1">{importError}</p>
              )}
            </div>

            <textarea
              value={deckDisplayText}
              readOnly
              rows={11}
              className="w-full bg-slate-950/90 border border-slate-800/90 rounded-xl p-3.5 text-xs font-mono text-slate-300 focus:outline-none resize-none shadow-inner cursor-default"
              placeholder="Select a meta preset or import a SWUDB deck above..."
            />
            <button 
              onClick={runAiAnalysis}
              disabled={isAnalyzing}
              className="w-full py-3 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 disabled:opacity-60 text-slate-950 font-bold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-cyan-950/30 transition-all text-xs tracking-wide cursor-pointer"
            >
              <Cpu size={16} className={isAnalyzing ? "animate-spin" : ""} />
              {isAnalyzing ? "Analyzing Deck Profile..." : "Run AI Edge Coach Analysis"}
            </button>
          </div>

          {/* RIGHT: GRADE, STATS & ARENA BREAKDOWN */}
          <div className="lg:col-span-2 space-y-6 flex flex-col justify-between">
            <div className="bg-slate-900/80 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div className="flex items-start md:items-center space-x-5">
                <div className={`w-20 h-20 rounded-2xl border-2 flex flex-col items-center justify-center font-black shadow-lg shrink-0 ${
                  analysis.grade === 'S' ? 'text-cyan-400 border-cyan-500/50 bg-cyan-950/40 shadow-cyan-950/50' :
                  analysis.grade === 'A' ? 'text-emerald-400 border-emerald-500/50 bg-emerald-950/30 shadow-emerald-950/50' :
                  'text-amber-400 border-amber-500/50 bg-amber-950/30 shadow-amber-950/50'
                }`}>
                  <span className="text-4xl tracking-tighter leading-none">{analysis.grade}</span>
                  <span className="text-[10px] opacity-80 uppercase tracking-widest mt-1">Grade</span>
                </div>

                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-100">{deckMeta.name || leaderName}</h2>
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800 font-semibold">
                      Inferred: {analysis.inferredArchetype}
                    </span>
                    {deckMeta.author && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-400 border border-slate-700/60 font-medium">
                        By {deckMeta.author}
                      </span>
                    )}
                  </div>

                  {/* LEADER & BASE DETAILS */}
                  <div className="space-y-1 text-xs">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 font-bold text-cyan-400">
                        <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        Leader:
                      </span>
                      <span className="font-bold text-slate-100">{leaderName}</span>
                      {leaderSubtitle && (
                        <span className="text-slate-400 italic">· {leaderSubtitle}</span>
                      )}
                      {leaderFrontUrl && (
                        <>
                          <button
                            onClick={() => setPreviewCard({
                              name: leaderName,
                              url: leaderFrontUrl,
                              orientation: 'horizontal',
                              backUrl: leaderBackUrl,
                              initialSide: 'front',
                            })}
                            className="text-[10px] text-cyan-400 hover:text-cyan-300 ml-1 inline-flex items-center gap-1 opacity-80 hover:opacity-100 cursor-pointer"
                          >
                            <Eye size={12} /> View Art
                          </button>
                          {leaderBackUrl && (
                            <button
                              onClick={() => setPreviewCard({
                                name: leaderName,
                                url: leaderFrontUrl,
                                orientation: 'horizontal',
                                backUrl: leaderBackUrl,
                                initialSide: 'back',
                              })}
                              className="text-[10px] text-amber-400 hover:text-amber-300 ml-1 inline-flex items-center gap-1 opacity-80 hover:opacity-100 cursor-pointer"
                            >
                              <RotateCw size={11} /> View Back
                            </button>
                          )}
                        </>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 font-bold text-cyan-400">
                        <Shield className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                        Base:
                      </span>
                      <span className="font-bold text-slate-100">{baseName}</span>
                      {baseSubtitle && (
                        <span className="text-slate-400 italic">· {baseSubtitle}</span>
                      )}
                      {baseHp && (
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-950 text-emerald-400 border border-slate-800 font-semibold">
                          {baseHp} HP
                        </span>
                      )}
                      {baseFrontUrl && (
                        <button
                          onClick={() => setPreviewCard({
                            name: baseName,
                            url: baseFrontUrl,
                            orientation: 'horizontal',
                          })}
                          className="text-[10px] text-cyan-400 hover:text-cyan-300 ml-1 inline-flex items-center gap-1 opacity-80 hover:opacity-100 cursor-pointer"
                        >
                          <Eye size={12} /> View Art
                        </button>
                      )}
                    </div>
                  </div>

                  {/* ASPECTS LIST */}
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      <Compass className="w-3 h-3 text-slate-400 shrink-0" />
                      Aspects:
                    </span>
                    {allAspects.length > 0 ? (
                      allAspects.map(aspect => {
                        const cfg = getAspectConfig(aspect);
                        return (
                          <span
                            key={aspect}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.badge} shadow-sm`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                            {cfg.label}
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-xs text-slate-500 italic">Unspecified</span>
                    )}
                  </div>

                  {/* SETS LIST */}
                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      <Compass className="w-3 h-3 text-slate-400 shrink-0" />
                      Sets:
                    </span>
                    {analysis.sets.size > 0 ? (
                      [...analysis.sets].map(set => {
                        const cfg = getSetConfig(set);
                        return (
                          <span
                            key={set}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.badge} shadow-sm`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                            {cfg.label}
                          </span>
                        );
                      })
                    ) : (
                      <span className="text-xs text-slate-500 italic">Unspecified</span>
                    )}
                  </div>

                  {/* STATS ROW */}
                  <div className="flex items-center space-x-5 pt-2 border-t border-slate-800/60">
                    <div className="text-xs text-slate-300">
                      Score: <span className="font-bold text-cyan-400 text-sm">{analysis.score}/100</span>
                    </div>
                    <div className="text-xs text-slate-300">
                      Avg Unit Cost: <span className="font-bold text-white text-sm">{analysis.avgUnitCost}</span>
                    </div>
                    <div className="text-xs text-slate-300">
                      Units: <span className="font-bold text-emerald-400 text-sm">{analysis.totalUnits}</span>
                    </div>
                    <div className="text-xs text-slate-300">
                      Out of Aspect: <span className="font-bold text-emerald-400 text-sm">{analysis.outOfAspect}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* ARENA SPLIT */}
              <div className="w-full md:w-64 bg-slate-950/90 border border-slate-800/90 rounded-xl p-4 space-y-2.5 shadow-inner shrink-0">
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

        {/* CARD GALLERY — Leader, Base, and Main/Sideboard cards with lazy art and lightbox click */}
        {(leaderFrontUrl || baseFrontUrl || analysis.parsedCards.length > 0 || resolvedSideCards.length > 0) && (() => {
          const activeGalleryView =
            galleryView === 'side' && resolvedSideCards.length > 0 ? 'side' : 'main';
          const galleryCards =
            activeGalleryView === 'side' ? resolvedSideCards : analysis.parsedCards;

          return (
            <section className="bg-slate-900/80 backdrop-blur-md border border-slate-800/80 rounded-2xl p-6 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex flex-wrap items-center gap-3">
                  <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-cyan-400" /> Deck Visual Gallery ({galleryCards.length} unique cards)
                  </h3>
                  {resolvedSideCards.length > 0 && (
                    <div className="inline-flex rounded-lg bg-slate-950 p-0.5 border border-slate-800 text-[11px] font-semibold">
                      <button
                        type="button"
                        onClick={() => setGalleryView('main')}
                        className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                          activeGalleryView === 'main'
                            ? 'bg-cyan-600 text-slate-950 font-bold shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Main Deck ({analysis.parsedCards.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setGalleryView('side')}
                        className={`px-2.5 py-1 rounded-md transition cursor-pointer ${
                          activeGalleryView === 'side'
                            ? 'bg-cyan-600 text-slate-950 font-bold shadow-sm'
                            : 'text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Sideboard ({resolvedSideCards.length})
                      </button>
                    </div>
                  )}
                </div>
                <span className="text-[11px] text-slate-400 italic">Click any card to preview full art</span>
              </div>

              {(leaderFrontUrl || baseFrontUrl) && (
                <div className="flex flex-wrap items-end gap-3 pb-4 border-b border-slate-800/80">
                  {leaderFrontUrl && (
                    <div
                      onClick={() =>
                        setPreviewCard({
                          name: leaderName,
                          url: leaderFrontUrl,
                          orientation: 'horizontal',
                          backUrl: leaderBackUrl,
                          initialSide: 'front',
                        })
                      }
                      className="group relative h-36 sm:h-44 aspect-[7/5] bg-slate-950/90 border border-slate-800/90 rounded-xl overflow-hidden hover:border-cyan-500/70 hover:scale-[1.02] transition-all cursor-pointer shadow-md"
                    >
                      <img
                        src={leaderFrontUrl}
                        alt={`${leaderName} (Leader Front)`}
                        loading="lazy"
                        className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent p-2.5 pt-6">
                        <p className="text-[11px] font-semibold text-slate-100 leading-tight truncate">{leaderName}</p>
                        <span className="text-[10px] font-semibold text-amber-400">Leader · Front</span>
                      </div>
                    </div>
                  )}

                  {leaderBackUrl && leaderFrontUrl && (
                    <div
                      onClick={() =>
                        setPreviewCard({
                          name: leaderName,
                          url: leaderFrontUrl,
                          orientation: 'horizontal',
                          backUrl: leaderBackUrl,
                          initialSide: 'back',
                        })
                      }
                      className="group relative h-36 sm:h-44 aspect-[5/7] bg-slate-950/90 border border-slate-800/90 rounded-xl overflow-hidden hover:border-amber-500/70 hover:scale-[1.02] transition-all cursor-pointer shadow-md"
                    >
                      <img
                        src={leaderBackUrl}
                        alt={`${leaderName} (Leader Back)`}
                        loading="lazy"
                        className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent p-2.5 pt-6">
                        <p className="text-[11px] font-semibold text-slate-100 leading-tight truncate">{leaderName}</p>
                        <span className="text-[10px] font-semibold text-amber-400">Leader · Back</span>
                      </div>
                    </div>
                  )}

                  {baseFrontUrl && (
                    <div
                      onClick={() =>
                        setPreviewCard({
                          name: baseName,
                          url: baseFrontUrl,
                          orientation: 'horizontal',
                        })
                      }
                      className="group relative h-36 sm:h-44 aspect-[7/5] bg-slate-950/90 border border-slate-800/90 rounded-xl overflow-hidden hover:border-cyan-500/70 hover:scale-[1.02] transition-all cursor-pointer shadow-md"
                    >
                      <img
                        src={baseFrontUrl}
                        alt={baseName}
                        loading="lazy"
                        className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                      />
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent p-2.5 pt-6">
                        <p className="text-[11px] font-semibold text-slate-100 leading-tight truncate">{baseName}</p>
                        <span className="text-[10px] font-semibold text-cyan-400">Base · {baseHp} HP</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {galleryCards.map((card, idx) => (
                  <div
                    key={`${activeGalleryView}-${card.id || card.name}-${idx}`}
                    onClick={() => card.imageUrl && setPreviewCard({ name: card.name, url: card.imageUrl })}
                    className="group relative bg-slate-950/90 border border-slate-800/90 rounded-xl overflow-hidden hover:border-cyan-500/70 hover:scale-[1.02] transition-all cursor-pointer shadow-md"
                  >
                    {card.imageUrl ? (
                      <img
                        src={card.imageUrl}
                        alt={card.name}
                        loading="lazy"
                        className="w-full aspect-[5/7] object-cover opacity-90 group-hover:opacity-100 transition-opacity"
                      />
                    ) : (
                      <div className="w-full aspect-[5/7] bg-slate-900 flex items-center justify-center p-2">
                        <span className="text-[10px] text-slate-400 text-center font-medium">{card.name}</span>
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-slate-950 via-slate-950/90 to-transparent p-2.5 pt-6">
                      <p className="text-[11px] font-semibold text-slate-100 leading-tight truncate">{card.name}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-[10px] text-slate-400">{formatCardTypeLabel(card.type)} · {card.cost}c</span>
                        <span className="text-[10px] font-bold text-cyan-400 bg-cyan-950/80 px-1.5 py-0.2 rounded border border-cyan-800/60">×{card.count}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })()}

        {/* DETAILED TABS SECTION */}
        <div id="tabs-section" className="bg-slate-900/80 backdrop-blur-md border border-slate-800/80 rounded-2xl overflow-hidden shadow-2xl">
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
                  className={`flex items-center space-x-2.5 px-6 py-4 text-xs font-semibold border-b-2 transition whitespace-nowrap cursor-pointer ${
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
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                        Resource Curve vs. Inferred Target ({analysis.inferredArchetype})
                      </h3>
                      <button 
                        onClick={() => setShowTargetExplainer(!showTargetExplainer)}
                        className="text-cyan-400 hover:text-cyan-300 transition cursor-pointer"
                        title="How are target numbers derived?"
                      >
                        <HelpCircle size={14} />
                      </button>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Comparing your actual distribution against {analysis.targetSource === 'meta' 
                        ? `averaged top-8 tournament meta (${analysis.sampleSize} cached decks)`
                        : 'standard 50-card competitive baseline model'}.
                    </p>
                  </div>
                  <div className="flex items-center space-x-5 text-xs bg-slate-950 px-4 py-2 rounded-xl border border-slate-800">
                    <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-cyan-500 rounded-sm shadow-sm" /><span className="text-slate-300 font-medium">Your Deck</span></div>
                    <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-slate-700 rounded-sm" /><span className="text-slate-400 font-medium">Inferred Target</span></div>
                  </div>
                </div>

                {/* TARGET NUMBERS EXPLAINER */}
                {showTargetExplainer && (
                  <div className="bg-slate-950/90 border border-cyan-800/50 rounded-xl p-4 text-xs space-y-2 text-slate-300">
                    <div className="flex justify-between items-center text-cyan-400 font-bold">
                      <span>How Inferred Target Numbers Work</span>
                      <button onClick={() => setShowTargetExplainer(false)} className="hover:text-cyan-200 cursor-pointer">
                        <X size={14} />
                      </button>
                    </div>
                    <p className="leading-relaxed">
                      Target curve numbers are computed dynamically by classifying cached top-8 tournament decklists from <code className="text-cyan-300">meta-decks.json</code> into archetypes based on their early game card count (1 & 2 drops) and average unit cost.
                    </p>
                    <p className="leading-relaxed text-slate-400">
                      When tournament lists are present, their cost distributions are averaged to establish a real-world meta baseline. If no matching archetype decks are in cache, the system falls back to standard 50-card competitive curve targets (e.g., Aggro Rush prioritizes 18+ 1-2 drops, Hard Control favors 12+ 5+ bombs).
                    </p>
                  </div>
                )}

                <div className="w-full h-72 pt-4 min-w-0">
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
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">Sideboard Swap Guide</h3>
                    <p className="text-xs text-slate-400 mt-0.5">Named card cuts and additions derived by cross-referencing your deck against tournament sideboards.</p>
                  </div>
                  {currentDeck.side && currentDeck.side.length > 0 && (
                    <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-950/60 text-emerald-400 border border-emerald-800/40 font-semibold">
                      {currentDeck.side.length} sideboard cards available
                    </span>
                  )}
                </div>
                <div className="divide-y divide-slate-800/80 border border-slate-800/80 rounded-2xl bg-slate-950/90 overflow-hidden shadow-md">
                  {sideboardPlan.map((plan, idx) => (
                    <div key={idx} className="p-4 md:p-5 space-y-3 text-xs">
                      <span className="font-bold text-cyan-400 text-sm">{plan.matchup}</span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="bg-red-950/30 border border-red-900/30 p-3.5 rounded-xl space-y-2">
                          <span className="text-red-400 font-semibold text-[10px] uppercase tracking-wider block">Cut Candidates (Out)</span>
                          {plan.outCards.length > 0 ? (
                            <ul className="space-y-1.5">
                              {plan.outCards.map((card, ci) => (
                                <li key={ci} className="flex items-center justify-between text-red-300">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold">-{card.count || 1}</span>
                                    <span className="font-medium">{card.name}</span>
                                    <span className="text-red-400/60 text-[10px]">({card.cost}c {formatCardTypeLabel(card.type)})</span>
                                  </div>
                                  {card.imageUrl && (
                                    <button
                                      onClick={() => setPreviewCard({ name: card.name, url: card.imageUrl! })}
                                      className="text-red-400 hover:text-red-300 text-[10px] cursor-pointer"
                                      title="View Card"
                                    >
                                      <Eye size={12} />
                                    </button>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-red-400/60 italic text-[11px]">No specific cuts identified</p>
                          )}
                        </div>
                        <div className="bg-emerald-950/30 border border-emerald-900/30 p-3.5 rounded-xl space-y-2">
                          <span className="text-emerald-400 font-semibold text-[10px] uppercase tracking-wider block">Add Candidates (In)</span>
                          {plan.inCards.length > 0 ? (
                            <ul className="space-y-1.5">
                              {plan.inCards.map((card, ci) => (
                                <li key={ci} className="flex items-center justify-between text-emerald-300">
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold">+{card.count || 1}</span>
                                    <span className="font-medium">{card.name?.split('|')[0]?.trim() || card.name}</span>
                                    <span className="text-emerald-400/60 text-[10px]">({card.cost}c {formatCardTypeLabel(card.type)})</span>
                                  </div>
                                  {card.imageUrl && (
                                    <button
                                      onClick={() => setPreviewCard({ name: card.name, url: card.imageUrl! })}
                                      className="text-emerald-400 hover:text-emerald-300 text-[10px] cursor-pointer"
                                      title="View Card"
                                    >
                                      <Eye size={12} />
                                    </button>
                                  )}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-emerald-400/60 italic text-[11px]">No matching sideboard cards in pool</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'ai' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center bg-slate-950/90 p-5 rounded-2xl border border-slate-800/90 shadow-md">
                  <div className="flex items-center gap-3">
                    <Sparkles className="w-4 h-4 text-cyan-400" />
                    <span className="text-xs font-bold text-slate-200 tracking-wide uppercase">AI Strategic Edge Coach</span>
                    {aiSource === 'gemini' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 font-semibold">
                        Powered by Gemini Edge LLM
                      </span>
                    )}
                    {aiSource === 'heuristic' && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800 font-semibold" title="Add GEMINI_API_KEY secret to enable live LLM">
                        Edge Heuristic Engine
                      </span>
                    )}
                  </div>
                  <button 
                    onClick={runAiAnalysis} 
                    disabled={isAnalyzing} 
                    className="bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 text-slate-950 font-bold px-3.5 py-2 rounded-xl text-xs transition shadow-md cursor-pointer flex items-center gap-1.5"
                  >
                    <Cpu size={14} className={isAnalyzing ? "animate-spin" : ""} />
                    {isAnalyzing ? "Analyzing..." : "Refresh Analysis"}
                  </button>
                </div>

                {aiError && (
                  <div className="bg-red-950/60 border border-red-800/80 rounded-xl p-3.5 text-xs text-red-200 flex items-start gap-2.5 shadow-md">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <span className="font-bold text-red-300 block">Gemini API Error (fell back to Edge Heuristics):</span>
                      <p className="text-[11px] text-red-200/90 leading-relaxed font-mono">{aiError}</p>
                    </div>
                  </div>
                )}
                {isAnalyzing ? (
                  <div className="bg-slate-950/90 p-8 rounded-2xl border border-slate-800/90 text-center space-y-3">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-cyan-400 border-t-transparent" />
                    <p className="text-xs text-slate-400">{STAR_WARS_LOADING_PHRASES[loadingPhraseIdx]}</p>
                  </div>
                ) : aiAnalysis ? (
                  <div className="bg-slate-950/90 p-6 rounded-2xl border border-slate-800/90 text-xs text-slate-300 space-y-4 leading-relaxed shadow-md">
                    <p className="font-semibold text-slate-100 text-sm leading-relaxed">{aiAnalysis.summary}</p>
                    
                    <div className="pt-3 border-t border-slate-800/80 space-y-2">
                      <h4 className="font-bold text-cyan-400 uppercase tracking-wider text-[11px]">Recommended Mulligan Priorities</h4>
                      <ul className="space-y-1.5">
                        {aiAnalysis.mulligan.map((m: string, i: number) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-cyan-400 font-bold">•</span>
                            <span>{m}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {aiAnalysis.tactics && (
                      <div className="pt-3 border-t border-slate-800/80 space-y-2">
                        <h4 className="font-bold text-amber-400 uppercase tracking-wider text-[11px]">Tactical Gameplay Advice</h4>
                        <ul className="space-y-1.5">
                          {aiAnalysis.tactics.map((t: string, i: number) => (
                            <li key={i} className="flex items-start gap-2">
                              <span className="text-amber-400 font-bold">•</span>
                              <span>{t}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {aiAnalysis.sideboardPlan && aiAnalysis.sideboardPlan.length > 0 && (
                      <div className="pt-3 border-t border-slate-800/80 space-y-2">
                        <h4 className="font-bold text-purple-400 uppercase tracking-wider text-[11px]">Sideboard Plan</h4>
                        <div className="space-y-2">
                          {aiAnalysis.sideboardPlan.map((p, i) => (
                            <div key={i} className="bg-slate-900/60 rounded-lg p-3 space-y-1">
                              <span className="font-bold text-slate-200">{p.matchup}</span>
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                                <span className="text-red-300">{p.out}</span>
                                <span className="text-emerald-300">{p.in}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {aiAnalysis.suggestedChanges && aiAnalysis.suggestedChanges.length > 0 && (
                      <div className="pt-3 border-t border-slate-800/80 space-y-2">
                        <h4 className="font-bold text-emerald-400 uppercase tracking-wider text-[11px]">Suggested Deck Changes</h4>
                        <div className="space-y-2">
                          {aiAnalysis.suggestedChanges.map((chg, i) => (
                            <div key={i} className="bg-slate-900/60 rounded-lg p-3 space-y-1.5">
                              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                                <span className="text-red-300">{chg.cut}</span>
                                <span className="text-slate-500">→</span>
                                <span className="text-emerald-300">{chg.add}</span>
                              </div>
                              <p className="text-[11px] text-slate-400">{chg.reason}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-slate-950/90 p-8 rounded-2xl border border-slate-800/90 text-center space-y-2">
                    <p className="text-xs text-slate-400">Click &quot;Run AI Edge Coach Analysis&quot; above to generate strategic advice for this deck.</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* CARD ART PREVIEW LIGHTBOX */}
        <CardPreviewModal
          preview={previewCard}
          onClose={() => setPreviewCard(null)}
        />
      </div>
    </>
  );
}