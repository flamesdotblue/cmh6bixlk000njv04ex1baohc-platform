import { Plus, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

function fmt(n) {
  if (!n || !isFinite(n)) return '—';
  if (n > 100) return n.toFixed(2);
  if (n > 1) return n.toFixed(4);
  return n.toFixed(6);
}

export default function Watchlist({ symbols, setSymbols, prices }) {
  const [newSym, setNewSym] = useState('');

  const rows = useMemo(() => symbols.map((s) => ({ symbol: s, price: prices?.[s]?.price, ts: prices?.[s]?.ts })), [symbols, prices]);

  const addSymbol = () => {
    const raw = newSym.trim().toUpperCase();
    if (!raw) return;
    const withUsdt = raw.endsWith('USDT') ? raw : `${raw}USDT`;
    if (!/^[A-Z0-9]{3,15}$/.test(withUsdt)) return;
    if (symbols.includes(withUsdt)) return;
    setSymbols([withUsdt, ...symbols]);
    setNewSym('');
  };

  const removeSymbol = (sym) => setSymbols(symbols.filter((x) => x !== sym));

  useEffect(() => {
    const onEnter = (e) => { if (e.key === 'Enter') addSymbol(); };
    return () => {};
  }, [addSymbol]);

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm font-semibold text-white/90">Watchlist</div>
      </div>
      <div className="mb-3 flex gap-2">
        <input value={newSym} onChange={(e) => setNewSym(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addSymbol()} placeholder="Add symbol (e.g. AVAXUSDT)" className="w-full rounded-md border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder-white/40 outline-none focus:ring-2 focus:ring-white/20" />
        <button onClick={addSymbol} className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-2 text-sm text-white hover:bg-white/20"><Plus size={16} /> Add</button>
      </div>
      <div className="divide-y divide-white/5">
        {rows.map((r) => (
          <div key={r.symbol} className="flex items-center justify-between py-2">
            <div>
              <div className="text-sm text-white/90">{r.symbol}</div>
              <div className="text-xs text-white/50">{r.ts ? 'Live' : 'Waiting…'}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-sm text-white/80">${fmt(r.price)}</div>
              <button onClick={() => removeSymbol(r.symbol)} className="rounded-md bg-white/5 p-1 text-white/60 hover:bg-white/10"><X size={14} /></button>
            </div>
          </div>
        ))}
        {rows.length === 0 && (
          <div className="py-6 text-center text-xs text-white/50">No symbols tracked. Add some above.</div>
        )}
      </div>
    </div>
  );
}
