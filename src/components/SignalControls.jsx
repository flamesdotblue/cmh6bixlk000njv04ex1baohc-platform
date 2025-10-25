import { Play, Pause, RefreshCcw, Clock } from 'lucide-react';

const intervals = [
  { label: '5m', ms: 5 * 60 * 1000 },
  { label: '2m', ms: 2 * 60 * 1000 },
  { label: '1m', ms: 60 * 1000 },
];

export default function SignalControls({ running, onToggle, loading, onRefresh, nextRefreshIn, intervalMs, setIntervalMs }) {
  return (
    <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur md:flex-row md:items-center">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggle}
          className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${running ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30' : 'bg-zinc-700/50 text-zinc-200 hover:bg-zinc-700'}`}
        >
          {running ? <Pause size={16} /> : <Play size={16} />} {running ? 'Pause' : 'Run'}
        </button>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md bg-zinc-700/50 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-50"
        >
          <RefreshCcw size={16} /> Refresh
        </button>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs text-white/70">
          <Clock size={14} />
          <span>
            Next refresh: {nextRefreshIn != null ? `${nextRefreshIn}s` : '—'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-white/70">
          Interval:
          <div className="flex overflow-hidden rounded-md border border-white/10">
            {intervals.map((it) => (
              <button
                key={it.label}
                onClick={() => setIntervalMs(it.ms)}
                className={`px-3 py-1 text-xs ${intervalMs === it.ms ? 'bg-white/20 text-white' : 'bg-transparent text-white/70 hover:bg-white/10'}`}
              >
                {it.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
