import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

function fmt(n, p = 6) {
  if (!isFinite(n)) return '-';
  if (n > 100) return n.toFixed(2);
  if (n > 1) return n.toFixed(4);
  const s = n.toFixed(p);
  return s;
}

export default function SignalCard({ signal }) {
  const {
    symbol,
    side,
    price,
    amount,
    leverage,
    targetProfitUSDT,
    riskUSDT,
    entry,
    takeProfit,
    stopLoss,
    capital,
    reasoning,
  } = signal;

  const isLong = side === 'LONG';

  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-zinc-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`flex h-6 w-6 items-center justify-center rounded ${isLong ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
            {isLong ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
          </div>
          <div className="text-sm font-semibold text-white/90">{side} {symbol}</div>
        </div>
        <div className="text-xs text-white/60">Bybit Live: ${fmt(price)}</div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs text-white/80">
        <Field label="Recommended Amount">${amount} USDT</Field>
        <Field label="Leverage">{leverage}x</Field>
        <Field label="Profit Target">${targetProfitUSDT} USDT</Field>
        <Field label="Risk">${riskUSDT} USDT</Field>
        <Field label="Entry">${fmt(entry)}</Field>
        <Field label="Take Profit">${fmt(takeProfit)}</Field>
        <Field label="Stop Loss">${fmt(stopLoss)}</Field>
        <Field label="Capital Used">${capital} USDT</Field>
      </div>

      {reasoning && (
        <div className="mt-3 rounded-md border border-white/10 bg-white/5 p-2 text-[11px] text-white/70">
          {reasoning}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/5 p-2">
      <div className="text-[10px] uppercase tracking-wide text-white/50">{label}</div>
      <div className="mt-0.5 text-xs text-white">{children}</div>
    </div>
  );
}
