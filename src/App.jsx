import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import HeaderBar from './components/HeaderBar';
import Controls from './components/Controls';
import Watchlist from './components/Watchlist';
import SignalBoard from './components/SignalBoard';

const BASE_URL = 'https://api.bybit.com';
const WS_URL = 'wss://stream.bybit.com/v5/public/linear';

const DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT'];

function useInterval(callback, delay) {
  const savedCallback = useRef();
  useEffect(() => { savedCallback.current = callback; }, [callback]);
  useEffect(() => {
    if (delay == null) return;
    const id = setInterval(() => savedCallback.current && savedCallback.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

function useBybitWS(symbols) {
  const [status, setStatus] = useState('idle'); // idle|connecting|open|closed
  const [lastPing, setLastPing] = useState(null);
  const [latency, setLatency] = useState(null);
  const [prices, setPrices] = useState({});
  const [lastTick, setLastTick] = useState(null);
  const wsRef = useRef(null);
  const subsRef = useRef(new Set());

  const connect = useCallback(() => {
    if (wsRef.current) {
      try { wsRef.current.close(); } catch {}
      wsRef.current = null;
    }
    setStatus('connecting');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('open');
      const args = symbols.map((s) => `tickers.${s}`);
      subsRef.current = new Set(args);
      ws.send(JSON.stringify({ op: 'subscribe', args }));
      const ping = () => {
        if (ws.readyState !== 1) return;
        setLastPing(Date.now());
        ws.send(JSON.stringify({ op: 'ping' }));
      };
      ping();
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.op === 'pong') {
          if (lastPing) setLatency(Date.now() - lastPing);
          return;
        }
        if (msg.topic && msg.topic.startsWith('tickers.')) {
          const sym = msg.topic.split('.')[1];
          const data = Array.isArray(msg.data) ? msg.data[0] : msg.data;
          const lastPrice = parseFloat(data?.lastPrice || '0');
          if (Number.isFinite(lastPrice) && lastPrice > 0) {
            setPrices((p) => ({ ...p, [sym]: { price: lastPrice, ts: Date.now() } }));
            setLastTick(Date.now());
          }
        }
      } catch {}
    };

    ws.onclose = () => setStatus('closed');
    ws.onerror = () => setStatus('closed');
  }, [symbols, lastPing]);

  useEffect(() => { connect(); return () => { try { wsRef.current?.close(); } catch {} }; }, [connect]);

  useEffect(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) return;
    const want = new Set(symbols.map((s) => `tickers.${s}`));
    const have = subsRef.current;
    const toUnsub = [...have].filter((x) => !want.has(x));
    const toSub = [...want].filter((x) => !have.has(x));
    if (toUnsub.length) ws.send(JSON.stringify({ op: 'unsubscribe', args: toUnsub }));
    if (toSub.length) ws.send(JSON.stringify({ op: 'subscribe', args: toSub }));
    subsRef.current = want;
  }, [symbols]);

  useInterval(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== 1) return;
    setLastPing(Date.now());
    ws.send(JSON.stringify({ op: 'ping' }));
  }, 10000);

  return { status, latency, prices, lastTick };
}

// Indicators
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
function rsi(values, period = 14) {
  if (!values || values.length < period + 1) return Array(values?.length || 0).fill(null);
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d >= 0) gains += d; else losses -= d;
  }
  gains /= period; losses /= period;
  const out = Array(values.length).fill(null);
  out[period] = 100 - 100 / (1 + (gains / (losses || 1e-9)));
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    const gain = d > 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    gains = (gains * (period - 1) + gain) / period;
    losses = (losses * (period - 1) + loss) / period;
    out[i] = 100 - 100 / (1 + (gains / (losses || 1e-9)));
  }
  return out;
}
function trueRange(h, l, c, i) {
  if (i === 0) return h[0] - l[0];
  return Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1]));
}
function atr(highs, lows, closes, period = 14) {
  if (!highs?.length) return [];
  const trs = highs.map((_, i) => trueRange(highs, lows, closes, i));
  const res = [];
  let prev = 0;
  for (let i = 0; i < trs.length; i++) {
    if (i < period) {
      const slice = trs.slice(0, i + 1);
      prev = slice.reduce((a, b) => a + b, 0) / slice.length;
      res.push(prev);
    } else {
      prev = (prev * (period - 1) + trs[i]) / period;
      res.push(prev);
    }
  }
  return res;
}

async function fetchKlines(symbol, interval = '5', limit = 200) {
  const url = `${BASE_URL}/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Kline fetch failed');
  const data = await res.json();
  const list = data?.result?.list || [];
  const o = list.map(r => parseFloat(r[1])).reverse();
  const h = list.map(r => parseFloat(r[2])).reverse();
  const l = list.map(r => parseFloat(r[3])).reverse();
  const c = list.map(r => parseFloat(r[4])).reverse();
  const v = list.map(r => parseFloat(r[5])).reverse();
  return { o, h, l, c, v };
}

function decideSignal(symbol, tickPrice, k, params) {
  if (!k?.c?.length || k.c.length < 50 || !tickPrice) return null;
  const closes = k.c; const highs = k.h; const lows = k.l; const vols = k.v; const last = closes.length - 1;
  const ema9 = ema(closes, 9); const ema21 = ema(closes, 21); const rsi14 = rsi(closes, 14); const a = atr(highs, lows, closes, 14);
  const atrPct = a[last] / closes[last];
  let leverage = 20;
  if (atrPct < 0.008) leverage = 50; else if (atrPct < 0.015) leverage = 25; else if (atrPct < 0.03) leverage = 15; else leverage = 10;
  leverage = Math.min(params.maxLeverage || leverage, leverage);

  const trendUp = ema9[last] > ema21[last];
  const trendDown = ema9[last] < ema21[last];
  const recentVol = vols.slice(-3).reduce((x, y) => x + y, 0) / 3;
  const baseVol = vols.slice(-20, -3).reduce((x, y) => x + y, 0) / 17 || 1;
  const volBoost = recentVol / baseVol;
  const mom = closes[last] - closes[last - 3];
  const rangeHigh = Math.max(...highs.slice(-params.breakoutLookback));
  const rangeLow = Math.min(...lows.slice(-params.breakoutLookback));
  const strongLong = trendUp && mom > 0 && volBoost > 1.05 && tickPrice > rangeHigh * (1 - params.breakoutBuffer);
  const strongShort = trendDown && mom < 0 && volBoost > 1.05 && tickPrice < rangeLow * (1 + params.breakoutBuffer);
  const rsiOkLong = (rsi14[last] ?? 50) > 48 && (rsi14[last] ?? 50) < 75;
  const rsiOkShort = (rsi14[last] ?? 50) < 52 && (rsi14[last] ?? 50) > 25;

  let side = null;
  if (params.enableLongs && strongLong && rsiOkLong) side = 'LONG';
  if (params.enableShorts && strongShort && rsiOkShort) side = side ? side : 'SHORT';
  if (!side) return null;

  const capital = params.capital;
  const amount = params.amount;
  const notional = amount * leverage;
  const targetProfitUSDT = params.targetProfit;
  const riskUSDT = params.risk;
  const requiredMoveTP = targetProfitUSDT / notional;
  const requiredMoveSL = riskUSDT / notional;
  const entry = tickPrice;
  const tp = side === 'LONG' ? entry * (1 + requiredMoveTP) : entry * (1 - requiredMoveTP);
  const sl = side === 'LONG' ? entry * (1 - requiredMoveSL) : entry * (1 + requiredMoveSL);
  const reasoning = `${side} ${symbol}: EMA9/21 trend, vol x${volBoost.toFixed(2)}, RSI ${Math.round(rsi14[last] || 0)}, breakout ${params.breakoutLookback} bars.`;

  return {
    id: `${symbol}-${side}-${Date.now()}`,
    symbol, side, price: tickPrice, amount, leverage, capital, targetProfitUSDT, riskUSDT,
    entry, takeProfit: tp, stopLoss: sl,
    meta: { volBoost, atrPct, rsi: rsi14[last] },
    reasoning,
  };
}

const defaultSettings = {
  capital: 20,
  amount: 20,
  targetProfit: 20,
  risk: 5,
  maxLeverage: 50,
  breakoutLookback: 24,
  breakoutBuffer: 0.0005,
  enableLongs: true,
  enableShorts: true,
  enableAlerts: true,
  soundAlerts: true,
};

const beepSrc = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABYBHGZmZmY=';

export default function App() {
  const [symbols, setSymbols] = useState(() => {
    const s = localStorage.getItem('symbols');
    return s ? JSON.parse(s) : DEFAULT_SYMBOLS;
  });
  const { status, latency, prices, lastTick } = useBybitWS(symbols);

  const [intervalSel, setIntervalSel] = useState('5');
  const [running, setRunning] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [signals, setSignals] = useState([]);

  const [settings, setSettings] = useState(() => {
    const s = localStorage.getItem('settings');
    return s ? { ...defaultSettings, ...JSON.parse(s) } : defaultSettings;
  });

  const [armed, setArmed] = useState({}); // id -> signal
  const [history, setHistory] = useState(() => {
    const h = localStorage.getItem('history');
    return h ? JSON.parse(h) : [];
  });

  const audioRef = useRef(null);
  useEffect(() => { audioRef.current = new Audio(beepSrc); }, []);

  useEffect(() => { localStorage.setItem('symbols', JSON.stringify(symbols)); }, [symbols]);
  useEffect(() => { localStorage.setItem('settings', JSON.stringify(settings)); }, [settings]);
  useEffect(() => { localStorage.setItem('history', JSON.stringify(history)); }, [history]);

  const requestNotify = useCallback(async () => {
    try {
      if (!('Notification' in window)) return;
      if (Notification.permission === 'default') await Notification.requestPermission();
    } catch {}
  }, []);
  useEffect(() => { if (settings.enableAlerts) requestNotify(); }, [settings.enableAlerts, requestNotify]);

  const notify = useCallback((title, body) => {
    if (!settings.enableAlerts) return;
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(title, { body });
      }
    } catch {}
    try { if (settings.soundAlerts && audioRef.current) { audioRef.current.currentTime = 0; audioRef.current.play(); } } catch {}
  }, [settings.enableAlerts, settings.soundAlerts]);

  const fetchAndSignal = useCallback(async () => {
    if (!running) return;
    setLoading(true); setError(null);
    try {
      const results = await Promise.all(
        symbols.map(async (sym) => {
          try {
            const k = await fetchKlines(sym, intervalSel, 200);
            const tick = prices[sym]?.price;
            return decideSignal(sym, tick, k, settings);
          } catch (e) { return null; }
        })
      );
      const list = results.filter(Boolean);
      const ranked = list.sort((a, b) => {
        const av = Math.abs(a.takeProfit - a.entry);
        const bv = Math.abs(b.takeProfit - b.entry);
        const vb = (b.meta?.volBoost || 0) - (a.meta?.volBoost || 0);
        return vb !== 0 ? vb : (bv - av);
      });

      // Alert on new signals (by symbol-side uniqueness window)
      const prevKeys = new Set(signals.map(s => `${s.symbol}-${s.side}`));
      ranked.forEach(s => {
        const key = `${s.symbol}-${s.side}`;
        if (!prevKeys.has(key)) notify(`New ${s.side} ${s.symbol}`, `Entry ${s.entry.toFixed(6)} | TP ${s.takeProfit.toFixed(6)} | SL ${s.stopLoss.toFixed(6)}`);
      });

      setSignals(ranked);
    } catch (e) {
      setError('Failed to compute signals');
    } finally { setLoading(false); }
  }, [symbols, intervalSel, prices, running, settings, signals, notify]);

  useEffect(() => { fetchAndSignal(); }, [intervalSel]);

  // Debounced recompute on live ticks
  const debounceRef = useRef(null);
  useEffect(() => {
    if (!running) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { fetchAndSignal(); }, 2500);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [lastTick, fetchAndSignal, running]);

  // Periodic refresh of klines
  useInterval(() => { if (running) fetchAndSignal(); }, 60000);

  // Monitor armed signals for TP/SL hits using live price
  useEffect(() => {
    const now = Date.now();
    const updates = [];
    const newArmed = { ...armed };
    for (const id in armed) {
      const s = armed[id];
      const tick = prices[s.symbol]?.price;
      if (!tick) continue;
      if (s.side === 'LONG') {
        if (tick >= s.takeProfit) {
          updates.push({ ...s, outcome: 'TP', closedAt: now, pnl: s.targetProfitUSDT });
          delete newArmed[id];
          notify(`TP Hit ${s.symbol}`, `LONG closed +$${s.targetProfitUSDT}`);
        } else if (tick <= s.stopLoss) {
          updates.push({ ...s, outcome: 'SL', closedAt: now, pnl: -s.riskUSDT });
          delete newArmed[id];
          notify(`SL Hit ${s.symbol}`, `LONG closed -$${s.riskUSDT}`);
        }
      } else {
        if (tick <= s.takeProfit) {
          updates.push({ ...s, outcome: 'TP', closedAt: now, pnl: s.targetProfitUSDT });
          delete newArmed[id];
          notify(`TP Hit ${s.symbol}`, `SHORT closed +$${s.targetProfitUSDT}`);
        } else if (tick >= s.stopLoss) {
          updates.push({ ...s, outcome: 'SL', closedAt: now, pnl: -s.riskUSDT });
          delete newArmed[id];
          notify(`SL Hit ${s.symbol}`, `SHORT closed -$${s.riskUSDT}`);
        }
      }
    }
    if (updates.length) setHistory((h) => [...updates, ...h].slice(0, 200));
    if (Object.keys(newArmed).length !== Object.keys(armed).length) setArmed(newArmed);
  }, [prices, armed, notify]);

  const armSignal = useCallback((s) => {
    setArmed((a) => ({ ...a, [s.id]: { ...s, openedAt: Date.now() } }));
  }, []);
  const cancelArmed = useCallback((id) => { setArmed((a) => { const n = { ...a }; delete n[id]; return n; }); }, []);

  const exportCSV = useCallback(() => {
    const headers = ['time','symbol','side','entry','takeProfit','stopLoss','leverage','amount','outcome','pnl'];
    const rows = history.map(h => [new Date(h.closedAt).toISOString(), h.symbol, h.side, h.entry, h.takeProfit, h.stopLoss, h.leverage, h.amount, h.outcome, h.pnl]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'signals_history.csv'; a.click(); URL.revokeObjectURL(url);
  }, [history]);

  const headerInfo = useMemo(() => ({
    title: 'Real‑Time Crypto Futures Alpha Signals',
    subtitle: 'Bybit USDT‑Perp. Execution‑ready scalps and quick swings, updated live.',
  }), []);

  const stats = useMemo(() => {
    const total = history.length;
    const wins = history.filter(h => h.outcome === 'TP').length;
    const pnl = history.reduce((a, b) => a + (b.pnl || 0), 0);
    return { total, wins, winRate: total ? Math.round((wins / total) * 100) : 0, pnl };
  }, [history]);

  return (
    <div className="min-h-screen w-full bg-black text-white">
      <HeaderBar
        title={headerInfo.title}
        subtitle={headerInfo.subtitle}
        wsStatus={status}
        latency={latency}
        lastTick={lastTick}
        onRefresh={fetchAndSignal}
        loading={loading}
        stats={stats}
      />

      <div className="mx-auto max-w-7xl px-4 pb-12 pt-6">
        <Controls
          running={running}
          setRunning={setRunning}
          intervalSel={intervalSel}
          setIntervalSel={setIntervalSel}
          onRefresh={fetchAndSignal}
          loading={loading}
          settings={settings}
          setSettings={setSettings}
          exportCSV={exportCSV}
        />

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-3">
            <Watchlist symbols={symbols} setSymbols={setSymbols} prices={prices} />
            <div className="mt-6 rounded-xl border border-white/10 bg-zinc-900/60 p-4 text-xs text-white/70">
              <div className="mb-2 text-sm font-semibold text-white/90">Positions Monitor</div>
              {Object.keys(armed).length === 0 && <div className="text-white/50">No armed signals. Arm any setup to track TP/SL with live price.</div>}
              {Object.values(armed).map((s) => (
                <div key={s.id} className="mb-2 rounded-md border border-white/10 bg-white/5 p-2">
                  <div className="flex items-center justify-between text-white/80">
                    <div className="text-xs">{s.side} {s.symbol}</div>
                    <button className="rounded bg-white/10 px-2 py-1 text-[11px] hover:bg-white/20" onClick={() => cancelArmed(s.id)}>Cancel</button>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-2 text-[11px] text-white/60">
                    <div>Entry ${s.entry.toFixed(6)}</div>
                    <div>Live ${prices[s.symbol]?.price ? prices[s.symbol].price.toFixed(6) : '—'}</div>
                    <div>TP ${s.takeProfit.toFixed(6)}</div>
                    <div>SL ${s.stopLoss.toFixed(6)}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-xl border border-white/10 bg-zinc-900/60 p-4 text-xs text-white/70">
              <div className="mb-2 text-sm font-semibold text-white/90">History</div>
              {history.length === 0 && <div className="text-white/50">No closed signals yet.</div>}
              {history.slice(0, 8).map((h) => (
                <div key={`${h.id}-${h.closedAt}`} className="mb-2 flex items-center justify-between rounded-md border border-white/10 bg-white/5 p-2">
                  <div className="text-[11px] text-white/80">{h.outcome} {h.side} {h.symbol}</div>
                  <div className={`text-[11px] ${h.pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{h.pnl >= 0 ? '+' : ''}${h.pnl}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-9">
            {error && (
              <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
            )}
            <SignalBoard
              signals={signals}
              loading={loading}
              onArm={armSignal}
            />
          </div>
        </div>

        <div className="mt-8 space-y-2 border-t border-white/10 pt-6 text-center text-xs text-white/50">
          <p>Data source: Bybit public REST + WebSocket (v5). Prices update in real time from exchange feed.</p>
          <p>Research/education only. Crypto futures are high risk. Use strict risk management.</p>
        </div>
      </div>
    </div>
  );
}
