import { FlaskConical } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

function fmt(n, p = 6) {
  if (!isFinite(n)) return '—';
  if (n > 100) return n.toFixed(2);
  if (n > 1) return n.toFixed(4);
  return n.toFixed(p);
}

export default function StrategyLab({ fetchKlines, intervalSel, signals, settings }) {
  const [symbol, setSymbol] = useState(() => signals[0]?.symbol || 'BTCUSDT');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (signals[0]?.symbol) setSymbol(signals[0].symbol);
  }, [signals]);

  const run = async () => {
    setLoading(true);
    try {
      const k = await fetchKlines(symbol, intervalSel, 240);
      const stats = backtestSimple(k, settings);
      setResult(stats);
    } catch (e) {
      setResult({ error: 'Failed to run backtest' });
    } finally {
      setLoading(false);
    }
  };

  const summary = useMemo(() => formatSummary(result), [result]);

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-white/90"><FlaskConical size={16} /> Strategy Lab</div>
        <div className="text-xs text-white/60">Quick test on latest bars</div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-md border border-white/10 bg-white/5 p-3">
          <div className="text-[11px] uppercase tracking-wide text-white/60">Symbol</div>
          <input value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className="mt-1 w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-white/20" />
          <button onClick={run} disabled={loading} className="mt-2 w-full rounded-md bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20 disabled:opacity-50">{loading ? 'Running…' : 'Run Backtest'}</button>
        </div>
        <div className="rounded-md border border-white/10 bg-white/5 p-3">
          <div className="text-[11px] uppercase tracking-wide text-white/60">Results</div>
          <ul className="mt-1 space-y-1 text-xs text-white/80">
            <li>Trades: {summary.trades}</li>
            <li>Win Rate: {summary.winRate}%</li>
            <li>P&L: ${fmt(summary.pnl)}</li>
            <li>Avg R: {summary.avgR}</li>
            <li>Max DD: {summary.maxDD}%</li>
          </ul>
        </div>
        <div className="rounded-md border border-white/10 bg-white/5 p-3">
          <div className="text-[11px] uppercase tracking-wide text-white/60">Notes</div>
          <div className="mt-1 text-xs text-white/70 min-h-[64px]">
            {summary.note}
          </div>
        </div>
      </div>
    </div>
  );
}

function backtestSimple(k, settings) {
  const c = k.c;
  if (!c?.length || c.length < 60) return { trades: 0, pnl: 0, winRate: 0, avgR: '0.00', maxDD: 0, note: 'Insufficient data' };
  // Quick heuristic: EMA 9/21 cross with simple TP/SL sized from settings over last 150 bars
  const ema9 = ema(c, 9);
  const ema21 = ema(c, 21);
  const capital = settings.capital || 20;
  const amount = settings.amount || 20;
  const lev = Math.min(settings.maxLeverage || 10, 50);
  const notional = amount * lev;
  const tpFrac = (settings.targetProfit || 20) / Math.max(1e-9, notional);
  const slFrac = (settings.risk || 5) / Math.max(1e-9, notional);

  let pnl = 0;
  let wins = 0;
  let losses = 0;
  let peak = 0;
  let trough = 0;
  let maxDD = 0;
  let rSum = 0;

  for (let i = 22; i < c.length - 1; i++) {
    const long = ema9[i - 1] <= ema21[i - 1] && ema9[i] > ema21[i];
    const short = ema9[i - 1] >= ema21[i - 1] && ema9[i] < ema21[i];
    const entry = c[i + 1];
    let exit = null;
    let r = 0;

    if (long && settings.enableLongs) {
      const tp = entry * (1 + tpFrac);
      const sl = entry * (1 - slFrac);
      const slice = k.h.slice(i + 1, i + 15);
      const sliceL = k.l.slice(i + 1, i + 15);
      const hitTP = slice.findIndex((x) => x >= tp);
      const hitSL = sliceL.findIndex((x) => x <= sl);
      if (hitTP === -1 && hitSL === -1) continue;
      if (hitSL === -1 || (hitTP !== -1 && hitTP < hitSL)) { exit = tp; r = tpFrac / slFrac; wins++; }
      else { exit = sl; r = -1; losses++; }
    } else if (short && settings.enableShorts) {
      const tp = entry * (1 - tpFrac);
      const sl = entry * (1 + slFrac);
      const slice = k.l.slice(i + 1, i + 15);
      const sliceH = k.h.slice(i + 1, i + 15);
      const hitTP = slice.findIndex((x) => x <= tp);
      const hitSL = sliceH.findIndex((x) => x >= sl);
      if (hitTP === -1 && hitSL === -1) continue;
      if (hitSL === -1 || (hitTP !== -1 && hitTP < hitSL)) { exit = tp; r = tpFrac / slFrac; wins++; }
      else { exit = sl; r = -1; losses++; }
    }

    if (exit != null) {
      const tradePnl = r > 0 ? settings.targetProfit : -settings.risk;
      pnl += tradePnl;
      rSum += r;
      peak = Math.max(peak, pnl);
      trough = Math.min(trough, pnl);
      maxDD = Math.max(maxDD, peak !== 0 ? Math.round(((peak - pnl) / Math.max(1e-9, peak)) * 100) : 0);
    }
  }

  const trades = wins + losses;
  const winRate = trades ? Math.round((wins / trades) * 100) : 0;
  const avgR = trades ? (rSum / trades).toFixed(2) : '0.00';
  return { trades, pnl, winRate, avgR, maxDD, note: trades ? 'EMA crossover quick test with fixed TP/SL windows.' : 'No trades triggered on recent data.' };
}

function ema(values, period) {
  if (!values?.length) return [];
  const k = 2 / (period + 1);
  const out = [];
  let prev = values[0];
  out.push(prev);
  for (let i = 1; i < values.length; i++) {
    const next = values[i] * k + prev * (1 - k);
    out.push(next);
    prev = next;
  }
  return out;
}
