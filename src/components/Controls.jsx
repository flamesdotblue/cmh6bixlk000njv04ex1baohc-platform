import { Play, Pause, Clock, Settings, Bell } from 'lucide-react';
import { useRef, useState } from 'react';

const intervals = [
  { label: '1m', v: '1' },
  { label: '3m', v: '3' },
  { label: '5m', v: '5' },
  { label: '15m', v: '15' },
];

export default function Controls({ running, setRunning, intervalSel, setIntervalSel, onRefresh, loading, settings, setSettings }) {
  const [open, setOpen] = useState(false);
  const formRef = useRef(null);

  const onSave = () => {
    const f = new FormData(formRef.current);
    const next = {
      capital: Number(f.get('capital')) || 20,
      amount: Number(f.get('amount')) || 20,
      targetProfit: Number(f.get('targetProfit')) || 20,
      risk: Number(f.get('risk')) || 5,
      maxLeverage: Number(f.get('maxLeverage')) || 50,
      breakoutLookback: Number(f.get('breakoutLookback')) || 24,
      breakoutBuffer: Number(f.get('breakoutBuffer')) || 0.0005,
      enableLongs: f.get('enableLongs') === 'on',
      enableShorts: f.get('enableShorts') === 'on',
      soundAlerts: f.get('soundAlerts') === 'on',
      browserAlerts: f.get('browserAlerts') === 'on',
      autoCancelMins: Number(f.get('autoCancelMins')) || 30,
    };
    setSettings(next);
    setOpen(false);
  };

  return (
    <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-4 backdrop-blur md:flex-row md:items-center">
      <div className="flex items-center gap-3">
        <button onClick={() => setRunning((v) => !v)} className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium ${running ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30' : 'bg-zinc-700/50 text-zinc-200 hover:bg-zinc-700'}`}>
          {running ? <Pause size={16} /> : <Play size={16} />} {running ? 'Pause' : 'Run'}
        </button>
        <button onClick={onRefresh} disabled={loading} className="inline-flex items-center gap-2 rounded-md bg-zinc-700/50 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-700 disabled:opacity-50">
          Recompute
        </button>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-xs text-white/70">
          <Clock size={14} />
          Interval:
          <div className="flex overflow-hidden rounded-md border border-white/10">
            {intervals.map((it) => (
              <button key={it.v} onClick={() => setIntervalSel(it.v)} className={`px-3 py-1 text-xs ${intervalSel === it.v ? 'bg-white/20 text-white' : 'bg-transparent text-white/70 hover:bg-white/10'}`}>
                {it.label}
              </button>
            ))}
          </div>
        </div>
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20">
          <Settings size={16} /> Settings
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-2xl rounded-xl border border-white/10 bg-zinc-950 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-white/90"><Bell size={16} /> Strategy & Alerts</div>
              <button onClick={() => setOpen(false)} className="rounded-md bg-white/10 px-2 py-1 text-xs text-white/80 hover:bg-white/20">Close</button>
            </div>
            <form ref={formRef} className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Field label="Capital (USDT)"><input name="capital" defaultValue={settings.capital} className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none" /></Field>
              <Field label="Recommended Amount (USDT)"><input name="amount" defaultValue={settings.amount} className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none" /></Field>
              <Field label="Profit Target (USDT)"><input name="targetProfit" defaultValue={settings.targetProfit} className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none" /></Field>
              <Field label="Risk (USDT)"><input name="risk" defaultValue={settings.risk} className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none" /></Field>
              <Field label="Max Leverage"><input name="maxLeverage" defaultValue={settings.maxLeverage} className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none" /></Field>
              <Field label="Breakout Lookback (bars)"><input name="breakoutLookback" defaultValue={settings.breakoutLookback} className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none" /></Field>
              <Field label="Breakout Buffer (fraction)"><input name="breakoutBuffer" defaultValue={settings.breakoutBuffer} step="0.0001" className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none" /></Field>
              <Field label="Auto Cancel (mins)"><input name="autoCancelMins" defaultValue={settings.autoCancelMins} className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none" /></Field>
              <Check label="Enable Longs"><input type="checkbox" name="enableLongs" defaultChecked={settings.enableLongs} /></Check>
              <Check label="Enable Shorts"><input type="checkbox" name="enableShorts" defaultChecked={settings.enableShorts} /></Check>
              <Check label="Sound Alerts"><input type="checkbox" name="soundAlerts" defaultChecked={settings.soundAlerts} /></Check>
              <Check label="Browser Notifications"><input type="checkbox" name="browserAlerts" defaultChecked={settings.browserAlerts} /></Check>
            </form>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white hover:bg-white/10">Cancel</button>
              <button onClick={onSave} className="rounded-md border border-emerald-500/40 bg-emerald-500/20 px-3 py-2 text-sm text-emerald-200 hover:bg-emerald-500/30">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="space-y-1">
      <div className="text-[10px] uppercase tracking-wide text-white/50">{label}</div>
      {children}
    </label>
  );
}

function Check({ label, children }) {
  return (
    <label className="flex items-center justify-between rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-white/80">
      <span>{label}</span>
      {children}
    </label>
  );
}
