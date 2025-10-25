import { Activity, RefreshCcw, Globe } from 'lucide-react';

function fmtLatency(ms) { if (ms == null) return '—'; return `${ms} ms`; }
function fmtAgo(ts) { if (!ts) return '—'; const s = Math.max(0, Math.floor((Date.now()-ts)/1000)); if (s<1) return 'now'; if (s<60) return `${s}s ago`; const m = Math.floor(s/60); return `${m}m ago`; }

export default function HeaderBar({ title, subtitle, wsStatus, latency, lastTick, onRefresh, loading, exchange, setExchange }) {
  const statusColor = wsStatus === 'open' ? 'text-emerald-400' : wsStatus === 'connecting' ? 'text-amber-300' : wsStatus === 'rest' ? 'text-blue-300' : 'text-rose-300';
  return (
    <div className="relative overflow-hidden border-b border-white/10 bg-gradient-to-b from-zinc-950 to-zinc-900/60">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-balance bg-gradient-to-b from-white via-white to-white/70 bg-clip-text text-2xl font-semibold text-transparent md:text-3xl">{title}</h1>
            <p className="mt-1 text-sm text-white/70">{subtitle}</p>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-white/60">
              <span className={`inline-flex items-center gap-1 rounded-md bg-white/5 px-2 py-1 ${statusColor}`}>
                <Activity size={14} /> {wsStatus==='rest' ? 'REST' : `WS ${wsStatus}`}
              </span>
              <span className="rounded-md bg-white/5 px-2 py-1">Latency: {fmtLatency(latency)}</span>
              <span className="rounded-md bg-white/5 px-2 py-1">Last tick: {fmtAgo(lastTick)}</span>
              <span className="inline-flex items-center gap-2 rounded-md bg-white/5 px-2 py-1">
                <Globe size={14} />
                <select value={exchange} onChange={(e)=>setExchange(e.target.value)} className="bg-transparent text-white outline-none">
                  <option value="BYBIT">Bybit</option>
                  <option value="BINANCE">Binance</option>
                </select>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onRefresh} disabled={loading} className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20 disabled:opacity-50">
              <RefreshCcw size={16} /> {loading ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
