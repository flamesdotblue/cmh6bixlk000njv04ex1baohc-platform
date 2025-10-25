import { Brain, Rocket } from 'lucide-react';

function fmt(n) {
  if (!isFinite(n)) return '—';
  if (n > 100) return n.toFixed(2);
  if (n > 1) return n.toFixed(4);
  return n.toFixed(6);
}

function scoreSignal(s) {
  const conf = s.meta?.confidence || 0;
  const rr = Math.abs((s.takeProfit - s.entry) / (s.entry - s.stopLoss || 1e-9));
  const rrScore = Math.max(0, Math.min(40, rr * 10));
  const volScore = Math.max(0, Math.min(20, ((s.meta?.volBoost || 1) - 1) * 20));
  const atrPenalty = Math.max(0, 10 - ((s.meta?.atrPct || 0) * 100));
  return conf + rrScore + volScore + atrPenalty; // 0..~170
}

export default function AIInsights({ signals }) {
  const ranked = [...(signals || [])].sort((a, b) => scoreSignal(b) - scoreSignal(a)).slice(0, 5);
  const top = ranked[0];

  return (
    <div className="rounded-xl border border-white/10 bg-gradient-to-b from-zinc-950 to-zinc-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="inline-flex items-center gap-2 text-sm font-semibold text-white/90"><Brain size={16} /> AI Alpha Insights</div>
        <div className="text-xs text-white/60">Auto-ranked by confidence, R/R, volatility</div>
      </div>

      {ranked.length === 0 && (
        <div className="rounded-md border border-white/10 bg-white/5 p-3 text-center text-xs text-white/60">No candidates yet. Waiting on market structure and volume.</div>
      )}

      {ranked.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="mb-2 text-xs font-semibold text-white/80">Top Opportunity</div>
            <div className="text-sm text-white/90">{top.side} {top.symbol} <span className="text-white/50">@</span> ${fmt(top.entry)} <span className="ml-1 rounded bg-white/10 px-1.5 py-0.5 text-[11px]">Score {scoreSignal(top).toFixed(0)}</span></div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[12px] text-white/70">
              <li>Confidence {(top.meta?.confidence || 0).toFixed(0)}%, Vol x{(top.meta?.volBoost || 0).toFixed(2)}, RSI {top.meta?.rsi ? Math.round(top.meta.rsi) : '—'}</li>
              <li>TP ${fmt(top.takeProfit)} | SL ${fmt(top.stopLoss)} | Lev {top.leverage}x | Amount ${top.amount}</li>
              <li>R/R {calcRR(top).toFixed(2)} | ATR {(top.meta?.atrPct ? (top.meta.atrPct*100).toFixed(2) : '—')}%</li>
            </ul>
            <div className="mt-2 text-[12px] text-emerald-300">AI View: {aiNarrative(top)}</div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold text-white/80"><Rocket size={14} /> Quick Picks</div>
            <div className="grid grid-cols-1 gap-2">
              {ranked.map((s) => (
                <div key={`${s.symbol}-${s.side}`} className="flex items-center justify-between rounded-md border border-white/10 bg-black/20 px-2 py-2 text-xs">
                  <div className="text-white/80">{s.side} {s.symbol}</div>
                  <div className="text-white/60">Score {scoreSignal(s).toFixed(0)} | RR {calcRR(s).toFixed(2)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function calcRR(s) {
  const risk = Math.abs(s.entry - s.stopLoss);
  const reward = Math.abs(s.takeProfit - s.entry);
  return risk > 0 ? reward / risk : 0;
}

function aiNarrative(s) {
  const c = s.meta?.confidence || 0;
  const rr = calcRR(s);
  const vol = s.meta?.volBoost || 1;
  const rsi = s.meta?.rsi || 50;
  const lines = [];
  if (c >= 70) lines.push('High confidence trend + volume alignment.');
  else if (c >= 50) lines.push('Moderate confidence with improving momentum.');
  else lines.push('Cautious setup; wait for stronger confirmation.');
  if (rr >= 1.5) lines.push('Attractive risk/reward profile.');
  else if (rr >= 1.0) lines.push('Balanced R/R.');
  else lines.push('Weak R/R; consider tighter SL or skip.');
  if (vol > 1.15) lines.push('Volume expansion supports continuation.');
  if (s.side === 'LONG' && rsi > 70) lines.push('RSI elevated; risk of pullback.');
  if (s.side === 'SHORT' && rsi < 30) lines.push('RSI depressed; risk of mean reversion.');
  return lines.join(' ');
}
