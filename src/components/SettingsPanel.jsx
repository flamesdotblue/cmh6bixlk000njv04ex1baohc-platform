import { Play, Pause, SlidersHorizontal, Bell, BellOff, Gauge, Radio } from 'lucide-react';

const intervals = [ { label: '1m', v: '1' }, { label: '3m', v: '3' }, { label: '5m', v: '5' }, { label: '15m', v: '15' } ];
const presets = [ { key: 'scalps', label: 'Scalps' }, { key: 'momentum', label: 'Momentum' }, { key: 'meanrev', label: 'Mean Reversion' } ];

export default function SettingsPanel({ running, setRunning, intervalSel, setIntervalSel, settings, setSettings, onRefresh, loading }) {
  const set = (key, value) => setSettings((s) => ({ ...s, [key]: value }));
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-white/90"><SlidersHorizontal size={16} /> Controls</div>
        <div className="flex items-center gap-2">
          <button onClick={() => setRunning((v) => !v)} className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium ${running ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30' : 'bg-zinc-700/50 text-zinc-200 hover:bg-zinc-700'}`}>
            {running ? <Pause size={14} /> : <Play size={14} />} {running ? 'Pause' : 'Run'}
          </button>
          <button onClick={onRefresh} disabled={loading} className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-xs font-medium text-white hover:bg-white/20 disabled:opacity-50">Recompute</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 text-xs text-white/80">
        <div className="rounded-md border border-white/10 bg-white/5 p-3">
          <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wide text-white/60"><Gauge size={14} /> Interval</div>
          <div className="flex overflow-hidden rounded-md border border-white/10">
            {intervals.map((it) => (
              <button key={it.v} onClick={() => setIntervalSel(it.v)} className={`px-3 py-1 text-xs ${intervalSel === it.v ? 'bg-white/20 text-white' : 'bg-transparent text-white/70 hover:bg-white/10'}`}>{it.label}</button>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-white/10 bg-white/5 p-3">
          <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-wide text-white/60"><Radio size={14} /> Strategy Preset</div>
          <div className="flex gap-2">
            {presets.map((p) => (
              <button key={p.key} onClick={() => set('preset', p.key)} className={`rounded-md border px-2 py-1 ${settings.preset===p.key ? 'border-white/20 bg-white/20 text-white' : 'border-white/10 bg-transparent text-white/70 hover:bg-white/10'}`}>{p.label}</button>
            ))}
          </div>
        </div>

        <div className="rounded-md border border-white/10 bg-white/5 p-3">
          <div className="mb-2 text-[11px] uppercase tracking-wide text-white/60">Risk & Targets</div>
          <div className="grid grid-cols-2 gap-2">
            <Num label="Capital ($)" value={settings.capital} onChange={(v) => set('capital', v)} />
            <Num label="Amount ($)" value={settings.amount} onChange={(v) => set('amount', v)} />
            <Num label="Target Profit ($)" value={settings.targetProfit} onChange={(v) => set('targetProfit', v)} />
            <Num label="Risk ($)" value={settings.risk} onChange={(v) => set('risk', v)} />
            <Num label="Max Leverage (x)" value={settings.maxLeverage} onChange={(v) => set('maxLeverage', v)} />
            <Num label="Taker Fee (%)" step={0.001} value={settings.takerFee*100} onChange={(v) => set('takerFee', v/100)} />
          </div>
          <div className="mt-2 flex items-center gap-3">
            <Toggle label="Enable Longs" checked={settings.enableLongs} onChange={(v) => set('enableLongs', v)} />
            <Toggle label="Enable Shorts" checked={settings.enableShorts} onChange={(v) => set('enableShorts', v)} />
            <Toggle label="Notifications" icon onChange={(v) => set('notifications', v)} checked={settings.notifications} />
            <Toggle label="Sound" icon={false} checked={settings.soundAlerts} onChange={(v)=>set('soundAlerts', v)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Num({ label, value, onChange, step }) {
  return (
    <label className="flex items-center justify-between gap-2 rounded-md border border-white/10 bg-black/20 px-2 py-2">
      <span className="text-white/70">{label}</span>
      <input type="number" value={value} step={step || 1} onChange={(e) => onChange(Number(e.target.value))} className="w-24 rounded-md border border-white/10 bg-black/30 px-2 py-1 text-right text-white outline-none focus:ring-2 focus:ring-white/20" />
    </label>
  );
}

function Toggle({ label, checked, onChange, icon }) {
  return (
    <label className="inline-flex cursor-pointer select-none items-center gap-2 rounded-md border border-white/10 bg-black/20 px-2 py-1">
      {icon ? (checked ? <Bell size={14} className="text-emerald-300"/> : <BellOff size={14} className="text-white/60"/>) : null}
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-white" />
      <span className="text-white/70 text-xs">{label}</span>
    </label>
  );
}
