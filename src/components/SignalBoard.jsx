import { TrendingUp, TrendingDown, Circle, CheckCircle2, XCircle } from 'lucide-react';

function fmt(n, p = 6) { if (!isFinite(n)) return '—'; if (n > 100) return n.toFixed(2); if (n > 1) return n.toFixed(4); return n.toFixed(p); }

export default function SignalBoard({ signals, loading }) {
  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-white/90">Alpha Signals</div>
        <div className="text-xs text-white/60">{loading ? 'Computing…' : `${signals?.length || 0} setups`}</div>
      </div>
      {(!signals || signals.length === 0) && (
        <div className="rounded-md border border-white/10 bg-white/5 p-4 text-center text-xs text-white/60">No qualified setups right now. Waiting for the next window.</div>
      )}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {signals.map((s) => (
          <SignalCard key={s.id} s={s} />
        ))}
      </div>
    </div>
  );
}

function SignalCard({ s }) {
  const isLong = s.side === 'LONG';
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-zinc-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`flex h-6 w-6 items-center justify-center rounded ${isLong ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
            {isLong ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
          </div>
          <div className="text-sm font-semibold text-white/90">{s.side} {s.symbol}</div>
        </div>
        <div className="text-xs text-white/60">Bybit Live: ${fmt(s.price)}</div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs text-white/80">
        <Field label="Recommended Amount">${s.amount} USDT</Field>
        <Field label="Leverage">{s.leverage}x</Field>
        <Field label="Profit Target">${s.targetProfitUSDT} USDT</Field>
        <Field label="Risk">${s.riskUSDT} USDT</Field>
        <Field label="Entry">${fmt(s.entry)}</Field>
        <Field label="Take Profit">${fmt(s.takeProfit)}</Field>
        <Field label="Stop Loss">${fmt(s.stopLoss)}</Field>
        <Field label="Capital Used">${s.capital} USDT</Field>
      </div>

      {s.reasoning && (
        <div className="mt-3 rounded-md border border-white/10 bg-white/5 p-2 text-[11px] text-white/70">{s.reasoning}</div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-white/60">
        <Badge>Vol x{(s.meta?.volBoost || 0).toFixed(2)}</Badge>
        <Badge>ATR {(s.meta?.atrPct ? (s.meta.atrPct * 100).toFixed(2) : '—')}%</Badge>
        <Badge>RSI {s.meta?.rsi ? Math.round(s.meta.rsi) : '—'}</Badge>
      </div>

      <div className="mt-3 flex items-center gap-2 text-[11px]">
        <Status status={s.status} />
        {s.closedAt && <span className="text-white/40">Closed {new Date(s.closedAt).toLocaleTimeString()}</span>}
      </div>
    </div>
  );
}

function Status({ status }) {
  const map = {
    NEW: { icon: <Circle size={12} />, cls: 'text-white/60', text: 'New' },
    ENTERED: { icon: <Circle size={12} />, cls: 'text-amber-300', text: 'Entered' },
    TP: { icon: <CheckCircle2 size={12} />, cls: 'text-emerald-300', text: 'TP Hit' },
    SL: { icon: <XCircle size={12} />, cls: 'text-rose-300', text: 'SL Hit' },
    CANCELLED: { icon: <XCircle size={12} />, cls: 'text-white/50', text: 'Cancelled' },
  };
  const it = map[status] || map.NEW;
  return <div className={`inline-flex items-center gap-1 ${it.cls}`}>{it.icon}<span>{it.text}</span></div>;
}

function Field({ label, children }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/5 p-2">
      <div className="text-[10px] uppercase tracking-wide text-white/50">{label}</div>
      <div className="mt-0.5 text-xs text-white">{children}</div>
    </div>
  );
}

function Badge({ children }) { return <div className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-center">{children}</div>; }
