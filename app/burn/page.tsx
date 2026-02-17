'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface BurnCycle {
  id: number;
  created_at: string;
  fees_claimed_sol: number;
  claim_tx_sig: string | null;
  claim_source: string;
  tokens_bought: number;
  buy_price_sol: number | null;
  buy_tx_sig: string | null;
  tokens_burned: number;
  burn_tx_sig: string | null;
  status: string;
  error_message: string | null;
}

interface BurnStats {
  total_cycles: number;
  total_sol_claimed: number;
  total_tokens_burned: number;
  burned_24h: number;
  sol_claimed_24h: number;
}

interface PendingFees {
  bondingCurveFees: number;
  pumpSwapFees: number;
  totalPending: number;
  walletBalance: number;
  snapshotAt: string | null;
}

const SOLSCAN_TX = 'https://solscan.io/tx/';
const POLL_INTERVAL = 5000;

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toFixed(2);
}

function FireParticles() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
      {Array.from({ length: 30 }).map((_, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: `${Math.random() * 100}%`,
            bottom: '-10px',
            width: `${3 + Math.random() * 6}px`,
            height: `${3 + Math.random() * 6}px`,
            background: `radial-gradient(circle, ${
              ['#ff6b00', '#ff4500', '#ff0000', '#ffaa00'][Math.floor(Math.random() * 4)]
            }, transparent)`,
            animation: `fireRise ${4 + Math.random() * 6}s linear infinite`,
            animationDelay: `${Math.random() * 5}s`,
            opacity: 0.6 + Math.random() * 0.4,
          }}
        />
      ))}
    </div>
  );
}

export default function BurnPage() {
  const [cycles, setCycles] = useState<BurnCycle[]>([]);
  const [stats, setStats] = useState<BurnStats | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const prevCycleCount = useRef(0);
  const [flash, setFlash] = useState(false);
  const [pendingFees, setPendingFees] = useState<PendingFees | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/burn/history?limit=50');
      if (!res.ok) return;
      const data = await res.json();
      setCycles(data.cycles || []);
      setStats(data.stats || null);
      setPendingFees(data.pendingFees || null);
      setLastUpdate(new Date());

      // Flash effect when new complete cycle arrives
      const completeCount = (data.cycles || []).filter((c: BurnCycle) => c.status === 'complete').length;
      if (completeCount > prevCycleCount.current && prevCycleCount.current > 0) {
        setFlash(true);
        setTimeout(() => setFlash(false), 1000);
      }
      prevCycleCount.current = completeCount;
    } catch (e) {
      console.error('Failed to fetch burn data:', e);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchData();
    if (!isLive) return;
    const interval = setInterval(fetchData, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchData, isLive]);

  const statusColor = (status: string) => {
    switch (status) {
      case 'complete': return 'text-green-400';
      case 'error': return 'text-red-400';
      case 'skipped': return 'text-zinc-500';
      case 'claiming': case 'buying': case 'burning': return 'text-yellow-400 animate-pulse';
      default: return 'text-zinc-400';
    }
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case 'complete': return (
        <svg className="w-5 h-5 text-orange-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 23c-3.866 0-7-3.134-7-7 0-3.866 3.134-7 7-7s7 3.134 7 7c0 3.866-3.134 7-7 7zm0-12c-1.5 0-3 1.5-3 4 0 2.5 1.5 4 3 4s3-1.5 3-4c0-2.5-1.5-4-3-4zm-1-1V2.5c0-.5.5-1 1-1s1 .5 1 1V10h-2zm-4 1l-3-5c-.3-.4 0-1 .5-1s.8.2 1 .5l2.5 4.5h-1zm6 0l3-5c.3-.4 0-1-.5-1s-.8.2-1 .5L12 10h1z"/>
        </svg>
      );
      case 'error': return <span className="text-red-400 text-lg">✕</span>;
      case 'skipped': return <span className="text-zinc-500 text-lg">→</span>;
      case 'claiming': return <span className="text-yellow-400 text-lg animate-pulse">◎</span>;
      case 'buying': return <span className="text-blue-400 text-lg animate-pulse">◉</span>;
      case 'burning': return <span className="text-orange-400 text-lg animate-pulse">◉</span>;
      default: return <span className="text-zinc-500 text-lg">○</span>;
    }
  };

  const inProgress = cycles.find(c => ['claiming', 'buying', 'burning'].includes(c.status));

  return (
    <>
      <style jsx global>{`
        @keyframes fireRise {
          0% { transform: translateY(0) scale(1); opacity: 0.8; }
          50% { opacity: 0.4; }
          100% { transform: translateY(-100vh) scale(0); opacity: 0; }
        }
        @keyframes flashBorder {
          0% { border-color: rgb(249 115 22); box-shadow: 0 0 30px rgba(249, 115, 22, 0.3); }
          100% { border-color: rgb(39 39 42); box-shadow: none; }
        }
      `}</style>

      <div className="min-h-screen bg-black text-white">
        {/* Background */}
        <div
          className="fixed inset-0 z-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: 'url(/mooncrab.png)' }}
        />
        <div className="fixed inset-0 bg-black/75 z-0" />
        <FireParticles />

        <div className="relative z-10 max-w-5xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="text-center mb-10">
            <h1 className="text-5xl sm:text-6xl font-black tracking-tight mb-3 bg-gradient-to-r from-orange-400 via-red-500 to-orange-400 bg-clip-text text-transparent">
              BURNING CRABS
            </h1>
            <p className="text-zinc-500 text-base max-w-md mx-auto">
              Creator fees are claimed, used to buy the token, and burned. Every minute. Forever deflationary.
            </p>
            <div className="mt-4 flex items-center justify-center gap-3">
              <button
                onClick={() => setIsLive(!isLive)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-zinc-900 border border-zinc-800 hover:border-zinc-700 transition-colors text-sm"
              >
                <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-green-400 animate-pulse' : 'bg-zinc-600'}`} />
                {isLive ? 'LIVE' : 'PAUSED'}
              </button>
              {lastUpdate && (
                <span className="text-xs text-zinc-600">
                  updated {timeAgo(lastUpdate.toISOString())}
                </span>
              )}
            </div>
          </div>

          {/* Pending Creator Fees (from DB, snapshotted by cron) */}
          {pendingFees && (
            <div className="mb-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="bg-gradient-to-br from-emerald-950/40 to-zinc-900/40 border border-emerald-900/30 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <p className="text-[11px] text-emerald-400/80 uppercase tracking-wider font-medium">Pending Fees</p>
                </div>
                <p className="text-2xl font-bold font-mono text-emerald-400">
                  {pendingFees.totalPending.toFixed(6)}
                </p>
                <p className="text-[11px] text-zinc-600">
                  SOL ready to claim
                  {pendingFees.snapshotAt && (
                    <span className="ml-1 text-zinc-700">
                      &middot; {timeAgo(pendingFees.snapshotAt)}
                    </span>
                  )}
                </p>
              </div>
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4">
                <p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">Bonding Curve</p>
                <p className="text-xl font-bold font-mono text-zinc-300">
                  {pendingFees.bondingCurveFees.toFixed(6)}
                </p>
                <p className="text-[11px] text-zinc-600">SOL in vault</p>
              </div>
              <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4">
                <p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">PumpSwap AMM</p>
                <p className="text-xl font-bold font-mono text-zinc-300">
                  {pendingFees.pumpSwapFees.toFixed(6)}
                </p>
                <p className="text-[11px] text-zinc-600">WSOL in vault</p>
              </div>
            </div>
          )}

          {/* Active cycle indicator */}
          {inProgress && (
            <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-orange-950/30 to-red-950/30 border border-orange-900/30 text-center">
              <div className="flex items-center justify-center gap-3">
                <div className="w-3 h-3 rounded-full bg-orange-400 animate-pulse" />
                <span className="text-orange-300 font-semibold text-sm uppercase tracking-wider">
                  {inProgress.status === 'claiming' && 'Claiming creator fees...'}
                  {inProgress.status === 'buying' && 'Buying tokens with claimed SOL...'}
                  {inProgress.status === 'burning' && 'Burning tokens...'}
                </span>
              </div>
            </div>
          )}

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
              <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
                <p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">Total Burned</p>
                <p className="text-2xl font-bold font-mono text-orange-400">{formatNumber(Number(stats.total_tokens_burned))}</p>
                <p className="text-[11px] text-zinc-600">tokens</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
                <p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">SOL Claimed</p>
                <p className="text-2xl font-bold font-mono text-purple-400">{Number(stats.total_sol_claimed).toFixed(4)}</p>
                <p className="text-[11px] text-zinc-600">total</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
                <p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">Burned 24h</p>
                <p className="text-2xl font-bold font-mono text-red-400">{formatNumber(Number(stats.burned_24h))}</p>
                <p className="text-[11px] text-zinc-600">tokens</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-4">
                <p className="text-[11px] text-zinc-500 uppercase tracking-wider mb-1">Cycles</p>
                <p className="text-2xl font-bold font-mono text-green-400">{stats.total_cycles}</p>
                <p className="text-[11px] text-zinc-600">completed</p>
              </div>
            </div>
          )}

          {/* Burn Feed */}
          <div
            className="bg-zinc-900/95 border border-zinc-700 rounded-xl overflow-hidden backdrop-blur-sm"
            style={flash ? { animation: 'flashBorder 1s ease-out' } : undefined}
          >
            <div className="px-5 py-3 border-b border-zinc-700 flex items-center justify-between bg-zinc-800/50">
              <h2 className="text-sm font-semibold text-white">Burn Feed</h2>
              <span className="text-[10px] text-zinc-400 font-mono">polls every 5s</span>
            </div>

            <div className="divide-y divide-zinc-700/50 max-h-[600px] overflow-y-auto">
              {cycles.map((cycle) => (
                <div key={cycle.id} className="px-5 py-3.5 hover:bg-zinc-800/40 transition-colors">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {statusIcon(cycle.status)}
                        <span className={`text-xs font-mono font-bold ${statusColor(cycle.status)}`}>
                          {cycle.status.toUpperCase()}
                        </span>
                        <span className="text-[10px] text-zinc-500 font-mono">#{cycle.id}</span>
                      </div>

                      {cycle.status === 'complete' && (
                        <div className="flex flex-wrap gap-x-5 gap-y-0.5 text-sm mt-1">
                          <span className="text-zinc-300">
                            Claimed{' '}
                            <span className="text-purple-300 font-mono font-semibold">
                              {Number(cycle.fees_claimed_sol).toFixed(6)}
                            </span>{' '}
                            SOL
                          </span>
                          <span className="text-zinc-300">
                            Bought{' '}
                            <span className="text-blue-300 font-mono font-semibold">
                              {formatNumber(Number(cycle.tokens_bought))}
                            </span>
                          </span>
                          <span className="text-zinc-300">
                            Burned{' '}
                            <span className="text-orange-300 font-mono font-semibold">
                              {formatNumber(Number(cycle.tokens_burned))}
                            </span>
                          </span>
                        </div>
                      )}

                      {cycle.status === 'error' && cycle.error_message && (
                        <p className="text-xs text-red-300 truncate mt-0.5">{cycle.error_message}</p>
                      )}

                      {cycle.status === 'skipped' && cycle.error_message && (
                        <p className="text-xs text-zinc-400 truncate mt-0.5">{cycle.error_message}</p>
                      )}
                    </div>

                    <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
                      <p className="text-xs text-zinc-400">{timeAgo(cycle.created_at)}</p>
                      <div className="flex gap-1.5">
                        {cycle.claim_tx_sig && (
                          <a
                            href={`${SOLSCAN_TX}${cycle.claim_tx_sig}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] px-2 py-0.5 rounded bg-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-600 transition-colors font-mono"
                          >
                            CLAIM
                          </a>
                        )}
                        {cycle.buy_tx_sig && (
                          <a
                            href={`${SOLSCAN_TX}${cycle.buy_tx_sig}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] px-2 py-0.5 rounded bg-zinc-700 text-zinc-300 hover:text-white hover:bg-zinc-600 transition-colors font-mono"
                          >
                            BUY
                          </a>
                        )}
                        {cycle.burn_tx_sig && (
                          <a
                            href={`${SOLSCAN_TX}${cycle.burn_tx_sig}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] px-2 py-0.5 rounded bg-orange-900/70 text-orange-300 hover:text-orange-200 hover:bg-orange-800/70 transition-colors font-mono"
                          >
                            BURN
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}

              {cycles.length === 0 && (
                <div className="px-5 py-16 text-center">
                  <div className="text-4xl mb-3 opacity-30">🔥</div>
                  <p className="text-zinc-600 text-sm">No burn cycles yet</p>
                  <p className="text-zinc-700 text-xs mt-1">Waiting for cron to run...</p>
                </div>
              )}
            </div>
          </div>

          {/* Footer info */}
          <div className="mt-6 text-center text-[11px] text-zinc-700">
            <p>
              Every cycle: claim creator fees → buy token → burn tokens.
              Transactions verified on{' '}
              <a href="https://solscan.io" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-white">
                Solscan
              </a>
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
