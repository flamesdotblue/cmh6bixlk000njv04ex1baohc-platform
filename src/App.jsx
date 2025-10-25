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

function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw != null ? JSON.parse(raw) : initialValue;
    } catch {
      return initialValue;
    }
  });
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  }, [key, value]);
  return [value, setValue];
}

function useBybitWS(symbols) {
  const [status, setStatus] = useState('idle');
  const [lastPing, setLastPing] = useState(null);
  const [lastPong, setLastPong] = useState(null);
  const [latency, setLatency] = useState(null);
  const [prices, setPrices] = useState({});
  const [lastTick, setLastTick] = useState(null);
  const wsRef = useRef(null);
  const subsRef = useRef(new Set());

  const connect = useCallback(() => {
    if (wsRef.current) { try { wsRef.current.close(); } catch {} wsRef.current = null; }
    setStatus('connecting');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('open');
      const args = symbols.map((s) => `tickers.${s}`);
      subsRef.current = new Set(args);
      ws.send(JSON.stringify({ op: 'subscribe', args }));
      const now = Date.now();
      setLastPing(now);
      ws.send(JSON.stringify({ op: 'ping' }));
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.op === 'pong') {
          const now = Date.now();
          setLastPong(now);
          setLatency((last) => (lastPing ? now - lastPing : last));
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

    ws.onclose = () => { setStatus('closed'); };
    ws.onerror = () => { setStatus('closed'); };
  }, [symbols, lastPing]);

  useEffect(() => {
    connect();
    return () => { try { wsRef.current && wsRef.current.close(); } catch {} wsRef.current = null; };
  }, [connect]);

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
    const now = Date.now();
    setLastPing(now);
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
  for (let i = 1; i < values.length; i++) { prev = values[i] * k + prev * (1 - k); out.push(prev); }
  return out;
}
function rsi(values, period = 14) {
  if (!values || values.length < period + 1) return Array(values?.length || 0).fill(null);
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) { const d = values[i] - values[i-1]; if (d >= 0) gains += d; else losses -= d; }
  gains /= period; losses /= period; const out = Array(values.length).fill(null);
  out[period] = 100 - 100 / (1 + (gains / (losses || 1e-9)));
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i-1]; const g = d > 0 ? d : 0; const l = d < 0 ? -d : 0;
    gains = (gains * (period - 1) + g) / period; losses = (losses * (period - 1) + l) / period;
    out[i] = 100 - 100 / (1 + (gains / (losses || 1e-9)));
  }
  return out;
}
function trueRange(h, l, c, i) { if (i === 0) return h[0] - l[0]; return Math.max(h[i]-l[i], Math.abs(h[i]-c[i-1]), Math.abs(l[i]-c[i-1])); }
function atr(highs, lows, closes, period = 14) {
  if (!highs?.length || highs.length !== lows.length || lows.length !== closes.length) return [];
  const trs = highs.map((_, i) => trueRange(highs, lows, closes, i));
  const out = []; let prev = 0;
  for (let i = 0; i < trs.length; i++) {
    if (i < period) { const sma = trs.slice(0, i+1).reduce((a,b)=>a+b,0)/(i+1); prev = sma; out.push(prev); }
    else { prev = (prev*(period-1)+trs[i])/period; out.push(prev); }
  }
  return out;
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
  if (!k || !k.c || k.c.length < 50 || !tickPrice) return null;
  const closes = k.c, highs = k.h, lows = k.l, vols = k.v; const last = closes.length - 1;
  const ema9 = ema(closes, 9); const ema21 = ema(closes, 21); const rsi14 = rsi(closes, 14); const a = atr(highs, lows, closes, 14);
  const atrPct = a[last] / closes[last];
  let leverage = 20; if (atrPct < 0.008) leverage = 50; else if (atrPct < 0.015) leverage = 25; else if (atrPct < 0.03) leverage = 15; else leverage = 10; leverage = Math.min(params.maxLeverage || leverage, leverage);
  const trendUp = ema9[last] > ema21[last]; const trendDown = ema9[last] < ema21[last];
  const recentVol = vols.slice(-3).reduce((x,y)=>x+y,0)/3; const baseVol = vols.slice(-20,-3).reduce((x,y)=>x+y,0)/17 || 1; const volBoost = recentVol / baseVol;
  const mom = closes[last] - closes[last-3];
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
  const capital = params.capital; const amount = params.amount; const notional = amount * leverage; const targetProfitUSDT = params.targetProfit; const riskUSDT = params.risk;
  const requiredMoveTP = targetProfitUSDT / notional; const requiredMoveSL = riskUSDT / notional;
  const entry = tickPrice;
  const tp = side === 'LONG' ? entry * (1 + requiredMoveTP) : entry * (1 - requiredMoveTP);
  const sl = side === 'LONG' ? entry * (1 - requiredMoveSL) : entry * (1 + requiredMoveSL);
  return {
    id: `${symbol}-${side}-${Math.round(entry*1e6)}`,
    symbol, side, price: tickPrice, amount, leverage, capital, targetProfitUSDT, riskUSDT, entry, takeProfit: tp, stopLoss: sl,
    meta: { volBoost, atrPct, rsi: rsi14[last], ema9: ema9[last], ema21: ema21[last] },
    reasoning: `${side} ${symbol}: EMA9/21 trend, vol x${volBoost.toFixed(2)}, RSI ${Math.round(rsi14[last] || 0)}, breakout ${params.breakoutLookback} bars.`,
    status: 'NEW', // NEW | ENTERED | TP | SL | CANCELLED
    createdAt: Date.now(),
  };
}

function useAudio(src) {
  const ref = useRef(null);
  useEffect(() => { const a = new Audio(src); a.volume = 0.4; ref.current = a; }, [src]);
  const play = useCallback(() => { try { ref.current && ref.current.play(); } catch {} }, []);
  return play;
}

export default function App() {
  const [symbols, setSymbols] = useLocalStorage('symbols', DEFAULT_SYMBOLS);
  const { status, latency, prices, lastTick } = useBybitWS(symbols);
  const [intervalSel, setIntervalSel] = useLocalStorage('intervalSel', '5');
  const [running, setRunning] = useLocalStorage('running', true);
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [stats, setStats] = useLocalStorage('stats', { total: 0, wins: 0, losses: 0, cancelled: 0 });

  const [settings, setSettings] = useLocalStorage('settings', {
    capital: 20,
    amount: 20,
    targetProfit: 20,
    risk: 5,
    maxLeverage: 50,
    breakoutLookback: 24,
    breakoutBuffer: 0.0005,
    enableLongs: true,
    enableShorts: true,
    soundAlerts: true,
    browserAlerts: false,
    autoCancelMins: 30,
  });

  const pingSound = useAudio('data:audio/mp3;base64,//uQZAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQAA');
  const winSound = useAudio('data:audio/mp3;base64,//uQZAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQAA');
  const loseSound = useAudio('data:audio/mp3;base64,//uQZAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQAA');

  useEffect(() => {
    if (settings.browserAlerts && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
  }, [settings.browserAlerts]);

  const params = useMemo(() => ({
    capital: settings.capital,
    amount: settings.amount,
    targetProfit: settings.targetProfit,
    risk: settings.risk,
    maxLeverage: settings.maxLeverage,
    breakoutLookback: settings.breakoutLookback,
    breakoutBuffer: settings.breakoutBuffer,
    enableLongs: settings.enableLongs,
    enableShorts: settings.enableShorts,
  }), [settings]);

  const notify = useCallback((title, body, type = 'info') => {
    if (settings.soundAlerts) { if (type === 'win') winSound(); else if (type === 'loss') loseSound(); else pingSound(); }
    if (settings.browserAlerts && 'Notification' in window && Notification.permission === 'granted') {
      try { new Notification(title, { body }); } catch {}
    }
  }, [settings, pingSound, winSound, loseSound]);

  const fetchAndSignal = useCallback(async () => {
    if (!running) return;
    setLoading(true); setError(null);
    try {
      const results = await Promise.all(symbols.map(async (sym) => {
        try {
          const k = await fetchKlines(sym, intervalSel, 200);
          const tick = prices[sym]?.price;
          return decideSignal(sym, tick, k, params);
        } catch { return null; }
      }));
      const list = results.filter(Boolean);
      const ranked = list.sort((a,b) => {
        const av = Math.abs(a.takeProfit - a.entry); const bv = Math.abs(b.takeProfit - b.entry);
        const va = a.meta?.volBoost || 0; const vb = b.meta?.volBoost || 0;
        if (vb !== va) return vb - va; return bv - av;
      });
      setSignals((prev) => {
        const mapPrev = Object.fromEntries(prev.map(s => [s.id, s]));
        const merged = ranked.map(s => mapPrev[s.id] ? { ...s, status: mapPrev[s.id].status, createdAt: mapPrev[s.id].createdAt } : s);
        return merged;
      });
    } catch (e) {
      setError('Failed to compute signals');
    } finally { setLoading(false); }
  }, [symbols, intervalSel, prices, running, params]);

  useEffect(() => { fetchAndSignal(); }, [intervalSel]);

  const debounceRef = useRef(null);
  useEffect(() => {
    if (!running) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { fetchAndSignal(); }, 2500);
    return () => debounceRef.current && clearTimeout(debounceRef.current);
  }, [lastTick, fetchAndSignal, running]);

  useInterval(() => { if (running) fetchAndSignal(); }, 60 * 1000);

  // Signal state machine updates with live price: entry -> TP/SL -> stats
  useEffect(() => {
    if (!running || !signals?.length) return;
    setSignals((prev) => {
      const now = Date.now();
      let changed = false;
      const updated = prev.map((s) => {
        const p = prices[s.symbol]?.price; if (!p) return s;
        let st = s.status;
        if (st === 'NEW') {
          // Enter immediately at current price when created (since entry = tick)
          st = 'ENTERED'; changed = true; if (settings.soundAlerts) pingSound(); if (settings.browserAlerts) notify(`${s.side} ${s.symbol}`, 'Entered at live price');
        }
        if (st === 'ENTERED') {
          if ((s.side === 'LONG' && p >= s.takeProfit) || (s.side === 'SHORT' && p <= s.takeProfit)) {
            st = 'TP'; changed = true; notify(`TP Hit: ${s.symbol}`, `Side: ${s.side} | TP: ${s.takeProfit.toFixed(6)}`, 'win');
          } else if ((s.side === 'LONG' && p <= s.stopLoss) || (s.side === 'SHORT' && p >= s.stopLoss)) {
            st = 'SL'; changed = true; notify(`SL Hit: ${s.symbol}`, `Side: ${s.side} | SL: ${s.stopLoss.toFixed(6)}`, 'loss');
          } else if (settings.autoCancelMins && now - s.createdAt > settings.autoCancelMins * 60 * 1000) {
            st = 'CANCELLED'; changed = true; notify(`Cancelled: ${s.symbol}`, 'Timed out');
          }
        }
        return st !== s.status ? { ...s, status: st, closedAt: st === 'TP' || st === 'SL' || st === 'CANCELLED' ? now : s.closedAt } : s;
      });
      if (changed) {
        const t = updated.filter(x => x.status !== 'NEW' && x.status !== 'ENTERED');
        const wins = t.filter(x => x.status === 'TP').length;
        const losses = t.filter(x => x.status === 'SL').length;
        const cancelled = t.filter(x => x.status === 'CANCELLED').length;
        setStats({ total: t.length, wins, losses, cancelled });
      }
      return updated;
    });
  }, [prices, running, settings.autoCancelMins, settings.soundAlerts, settings.browserAlerts, notify, pingSound]);

  const headerInfo = useMemo(() => ({
    title: 'Real‑Time Crypto Futures Alpha Signals',
    subtitle: 'Bybit USDT‑Perp. High‑probability scalps and quick swings with live prices.',
  }), []);

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
        />

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-3">
            <Watchlist symbols={symbols} setSymbols={setSymbols} prices={prices} />
          </div>
          <div className="lg:col-span-9">
            {error && (
              <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
            )}
            <SignalBoard signals={signals} loading={loading} />
          </div>
        </div>

        <div className="mt-8 space-y-2 border-t border-white/10 pt-6 text-center text-xs text-white/50">
          <p>Data source: Bybit public REST + WebSocket (v5). Prices update in real time from exchange feed.</p>
          <p>This tool provides informational signals. Futures trading is high risk. Manage risk strictly.</p>
        </div>
      </div>
    </div>
  );
}
