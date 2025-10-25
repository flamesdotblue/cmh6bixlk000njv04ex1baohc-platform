import { Play, Pause, Clock, Settings, Bell, Download } from 'lucide-react';
import { useMemo, useState } from 'react';

const intervals = [
  { label: '1m', v: '1' },
  { label: '3m', v: '3' },
  { label: '5m', v: '5' },
  { label: '15m', v: '15' },
];

export default function Controls({ running, setRunning, intervalSel, setIntervalSel, onRefresh, loading, settings, setSettings, exportCSV }) {
  const [open, setOpen] = useState(false);
  const handleChange = (key, value) => setSettings({ ...settings, [key]: value });

  const rows = useMemo(() => [
    { k: 'capital', label: 'Capital Used ($)', type: 'number', step: 1, min: 1 },
    { k: 'amount', label: 'Recommended Amount ($)', type: 'number', step: 1, min: 1 },
    { k: 'targetProfit', label: 'Profit Target ($)', type: 'number', step: 1, min: 1 },
    { k: 'risk', label: 'Risk ($)', type: 'number', step: 1, min: 1 },
    { k: 'maxLeverage', label: 'Max Leverage (x)', type: 'number', step: 1, min: 1 },
    { k: 'breakoutLookback', label: 'Breakout Lookback (bars)', type: 'number', step: 1, min: 5 },
    { k: 'breakoutBuffer', label: 'Breakout Buffer (fraction)', type: 'number', step: 0.0001, min: 0 },
  ], [settings]);

  return (
    <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur md:flex-row md:items-center">
      <div className="flex items-center gap-3">
        <button onClick={() => setRunning((v) => !v)} className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${running ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30' : 'bg-zinc-700/50 text-zinc-200 hover:bg-zinc-700'}`}>
          {running ? <Pause size={16} /> : <Play size={16} />} {running ? 'Pause' : 'Run'}
        </button>
        <button onClick={onRefresh} disabled={loading} className="inline-flex items-center gap-2 rounded-md bg-zinc-700/50 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">Recompute</button>
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-md bg-zinc-700/50 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-700"><Settings size={16} /> Settings</button>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs text-white/70">
          <Clock size={14} /> Interval:
          <div className="flex overflow-hidden rounded-md border border-white/10">
            {intervals.map((it) => (
              <button key={it.v} onClick={() => setIntervalSel(it.v)} className={`px-3 py-1 text-xs ${intervalSel === it.v ? 'bg-white/20 text-white' : 'bg-transparent text-white/70 hover:bg-white/10'}`}>{it.label}</button>
            ))}
          </div>
        </div>
        <button onClick={exportCSV} className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-xs text-white hover:bg-white/20"><Download size={14} /> Export</button>
        <div className="inline-flex items-center gap-1 rounded-md bg-white/10 px-2 py-1 text-[11px] text-white/80"><Bell size={12} /> Alerts {settings.enableAlerts ? 'On' : 'Off'}</div>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" onClick={() => setOpen(false)} />
          <div className="relative z-10 w-full max-w-lg rounded-xl border border-white/10 bg-zinc-950 p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold text-white">Strategy Settings</div>
              <button className="rounded-md bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20" onClick={() => setOpen(false)}>Close</button>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {rows.map((r) => (
                <div key={r.k} className="text-xs">
                  <div className="mb-1 text-white/70">{r.label}</div>
                  <input type="number" value={settings[r.k]} onChange={(e) => handleChange(r.k, Number(e.target.value))} step={r.step} min={r.min} className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-white/20" />
                </div>
              ))}
              <div className="flex items-center gap-2 text-xs">
                <input id="longs" type="checkbox" checked={settings.enableLongs} onChange={(e) => handleChange('enableLongs', e.target.checked)} />
                <label htmlFor="longs" className="text-white/80">Enable Longs</label>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <input id="shorts" type="checkbox" checked={settings.enableShorts} onChange={(e) => handleChange('enableShorts', e.target.checked)} />
                <label htmlFor="shorts" className="text-white/80">Enable Shorts</label>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <input id="alerts" type="checkbox" checked={settings.enableAlerts} onChange={(e) => handleChange('enableAlerts', e.target.checked)} />
                <label htmlFor="alerts" className="text-white/80">Enable Notifications</label>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <input id="sound" type="checkbox" checked={settings.soundAlerts} onChange={(e) => handleChange('soundAlerts', e.target.checked)} />
                <label htmlFor="sound" className="text-white/80">Sound Alerts</label>
              </div>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button className="rounded-md bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20" onClick={() => setOpen(false)}>Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
