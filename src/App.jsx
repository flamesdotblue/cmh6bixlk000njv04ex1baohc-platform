import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import HeaderBar from './components/HeaderBar';
import SettingsPanel from './components/SettingsPanel';
import Watchlist from './components/Watchlist';
import SignalBoard from './components/SignalBoard';
import AIInsights from './components/AIInsights';
import StrategyLab from './components/StrategyLab';

const BASE_URL = 'https://api.bybit.com';
const WS_URL = 'wss://stream.bybit.com/v5/public/linear';

const DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT'];

function useInterval(callback, delay) {
  const saved = useRef();
  useEffect(() => { saved.current = callback; }, [callback]);
  useEffect(() => {
    if (delay == null) return;
    const id = setInterval(() => saved.current && saved.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

function useBybitWS(symbols) {
  const [status, setStatus] = useState('idle'); // idle|connecting|open|closed
  const [latency, setLatency] = useState(null);
  const [lastTick, setLastTick] = useState(null);
  const [prices, setPrices] = useState({});

  const wsRef = useRef(null);
  const subsRef = useRef(new Set());
  const lastPingRef = useRef(null);
  const backoffRef = useRef(1000);

  const subscribe = (ws, nextSymbols) => {
    const args = nextSymbols.map((s) => `tickers.${s}`);
    subsRef.current = new Set(args);
    ws.send(JSON.stringify({ op: 'subscribe', args }));
  };

  const connect = useCallback(() => {
    try { wsRef.current && wsRef.current.close(); } catch {}
    setStatus('connecting');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('open');
      backoffRef.current = 1000;
      subscribe(ws, symbols);
      lastPingRef.current = Date.now();
      ws.send(JSON.stringify({ op: 'ping' }));
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.op === 'pong') {
          if (lastPingRef.current) setLatency(Date.now() - lastPingRef.current);
          return;
        }
        if (msg.topic && msg.topic.startsWith('tickers.')) {
          const sym = msg.topic.split('.')[1];
          const data = msg.data?.[0] || msg.data || {};
          const lastPrice = parseFloat(data.lastPrice || data.lp || '0');
          if (Number.isFinite(lastPrice) && lastPrice > 0) {
            setPrices((p) => ({ ...p, [sym]: { price: lastPrice, ts: Date.now() } }));
            setLastTick(Date.now());
          }
          return;
        }
      } catch {}
    };

    ws.onclose = () => {
      setStatus('closed');
      const t = backoffRef.current;
      backoffRef.current = Math.min(backoffRef.current * 2, 15000);
      setTimeout(() => connect(), t);
    };

    ws.onerror = () => {
      try { ws.close(); } catch {}
    };
  }, [symbols]);

  useEffect(() => {
    connect();
    return () => { try { wsRef.current && wsRef.current.close(); } catch {} };
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
    lastPingRef.current = Date.now();
    ws.send(JSON.stringify({ op: 'ping' }));
  }, 10000);

  return { status, latency, prices, lastTick };
}

async function fetchKlines(symbol, interval = '5', limit = 240) {
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
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff; else losses -= diff;
  }
  gains /= period; losses /= period;
  const out = Array(values.length).fill(null);
  out[period] = 100 - 100 / (1 + (gains / (losses || 1e-9)));
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    gains = (gains * (period - 1) + gain) / period;
    losses = (losses * (period - 1) + loss) / period;
    out[i] = 100 - 100 / (1 + (gains / (losses || 1e-9)));
  }
  return out;
}

function trueRange(h, l, c, i) {
  if (i === 0) return h[0] - l[0];
  return Math.max(
    h[i] - l[i],
    Math.abs(h[i] - c[i - 1]),
    Math.abs(l[i] - c[i - 1])
  );
}

function atr(highs, lows, closes, period = 14) {
  if (!highs?.length || highs.length !== lows.length || lows.length !== closes.length) return [];
  const trs = highs.map((_, i) => trueRange(highs, lows, closes, i));
  const res = [];
  let prev = 0;
  for (let i = 0; i < trs.length; i++) {
    if (i < period) {
      const slice = trs.slice(0, i + 1);
      const sma = slice.reduce((a, b) => a + b, 0) / slice.length;
      prev = sma;
      res.push(prev);
    } else {
      prev = (prev * (period - 1) + trs[i]) / period;
      res.push(prev);
    }
  }
  return res;
}

function decideSignal(symbol, tickPrice, k, params) {
  if (!k || !k.c || k.c.length < 60 || !tickPrice) return null;
  const closes = k.c;
  const highs = k.h;
  const lows = k.l;
  const vols = k.v;
  const last = closes.length - 1;

  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const rsi14 = rsi(closes, 14);
  const a = atr(highs, lows, closes, 14);
  const atrPct = a[last] / Math.max(1e-9, closes[last]);

  let leverage = atrPct < 0.008 ? 50 : atrPct < 0.015 ? 25 : atrPct < 0.03 ? 15 : 10;
  leverage = Math.min(params.maxLeverage, leverage);

  const trendUp = ema9[last] > ema21[last];
  const trendDown = ema9[last] < ema21[last];

  const recentVol = vols.slice(-3).reduce((x, y) => x + y, 0) / 3;
  const baseArr = vols.slice(-20, -3);
  const baseVol = baseArr.length ? baseArr.reduce((x, y) => x + y, 0) / baseArr.length : 0;
  const volBoost = baseVol ? recentVol / baseVol : 0;

  const mom = closes[last] - closes[last - 3];
  const rangeHigh = Math.max(...highs.slice(-params.breakoutLookback));
  const rangeLow = Math.min(...lows.slice(-params.breakoutLookback));
  const breakoutLong = tickPrice > rangeHigh * (1 - params.breakoutBuffer);
  const breakoutShort = tickPrice < rangeLow * (1 + params.breakoutBuffer);

  const rsiOkLong = (rsi14[last] ?? 50) > 48 && (rsi14[last] ?? 50) < 75;
  const rsiOkShort = (rsi14[last] ?? 50) < 52 && (rsi14[last] ?? 50) > 25;

  let side = null;
  if (params.enableLongs && trendUp && mom > 0 && volBoost > 1.05 && breakoutLong && rsiOkLong) side = 'LONG';
  if (params.enableShorts && trendDown && mom < 0 && volBoost > 1.05 && breakoutShort && rsiOkShort) side = side ? side : 'SHORT';
  if (!side) return null;

  const capital = params.capital;
  const amount = params.amount;
  const notional = amount * leverage;
  const targetProfitUSDT = params.targetProfit;
  const riskUSDT = params.risk;

  const requiredMoveTP = targetProfitUSDT / Math.max(1e-9, notional);
  const requiredMoveSL = riskUSDT / Math.max(1e-9, notional);

  const entry = tickPrice;
  const tp = side === 'LONG' ? entry * (1 + requiredMoveTP) : entry * (1 - requiredMoveTP);
  const sl = side === 'LONG' ? entry * (1 - requiredMoveSL) : entry * (1 + requiredMoveSL);

  const reasoning = `${side} ${symbol}: EMA9/21 trend, vol x${volBoost.toFixed(2)}, RSI ${Math.round(rsi14[last] || 0)}, breakout ${params.breakoutLookback} bars.`;

  // Confidence heuristic 0..100
  const conf = Math.max(0, Math.min(100,
    (trendUp || trendDown ? 25 : 0) +
    (Math.min(2, Math.max(0, volBoost - 1)) * 25) +
    (Math.min(1, Math.abs(mom) / (a[last] || 1e-9)) * 25) +
    (side === 'LONG' ? (rsi14[last] > 55 && rsi14[last] < 70 ? 15 : 5) : (rsi14[last] < 45 && rsi14[last] > 30 ? 15 : 5))
  ));

  return {
    symbol,
    side,
    price: tickPrice,
    amount,
    leverage,
    capital,
    targetProfitUSDT,
    riskUSDT,
    entry,
    takeProfit: tp,
    stopLoss: sl,
    meta: { volBoost, atrPct, rsi: rsi14[last], confidence: conf },
    reasoning,
  };
}

export default function App() {
  const [symbols, setSymbols] = useState(DEFAULT_SYMBOLS);
  const { status, latency, prices, lastTick } = useBybitWS(symbols);

  const [running, setRunning] = useState(true);
  const [intervalSel, setIntervalSel] = useState('5');
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [settings, setSettings] = useState({
    capital: 20,
    amount: 20,
    targetProfit: 20,
    risk: 5,
    maxLeverage: 50,
    breakoutLookback: 24,
    breakoutBuffer: 0.0005,
    enableLongs: true,
    enableShorts: true,
    notifications: false,
  });

  useEffect(() => {
    if (settings.notifications && 'Notification' in window) {
      if (Notification.permission === 'default') Notification.requestPermission();
    }
  }, [settings.notifications]);

  const notify = useCallback((title, body) => {
    if (!settings.notifications) return;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') new Notification(title, { body });
  }, [settings.notifications]);

  const fetchAndSignal = useCallback(async () => {
    if (!running) return;
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all(
        symbols.map(async (sym) => {
          try {
            const k = await fetchKlines(sym, intervalSel, 240);
            const tick = prices[sym]?.price;
            return decideSignal(sym, tick, k, settings);
          } catch (e) {
            return null;
          }
        })
      );
      const list = results.filter(Boolean);
      const ranked = list.sort((a, b) => {
        const confDiff = (b.meta?.confidence || 0) - (a.meta?.confidence || 0);
        if (confDiff !== 0) return confDiff;
        const av = Math.abs(a.takeProfit - a.entry);
        const bv = Math.abs(b.takeProfit - b.entry);
        return bv - av;
      });

      const prevTopKey = signals[0] ? `${signals[0].symbol}-${signals[0].side}` : '';
      const nextTopKey = ranked[0] ? `${ranked[0].symbol}-${ranked[0].side}` : '';
      if (nextTopKey && nextTopKey !== prevTopKey) {
        notify('New Alpha Setup', `${ranked[0].side} ${ranked[0].symbol} | Entry ${ranked[0].entry.toFixed(4)}`);
      }

      setSignals(ranked);
    } catch (e) {
      setError('Failed to compute signals.');
    } finally {
      setLoading(false);
    }
  }, [symbols, intervalSel, prices, running, settings, signals, notify]);

  useEffect(() => { fetchAndSignal(); }, [fetchAndSignal]);

  const debRef = useRef(null);
  useEffect(() => {
    if (!running) return;
    if (debRef.current) clearTimeout(debRef.current);
    debRef.current = setTimeout(() => fetchAndSignal(), 2000);
    return () => debRef.current && clearTimeout(debRef.current);
  }, [lastTick, fetchAndSignal, running]);

  useInterval(() => { if (running) fetchAndSignal(); }, 60000);

  const headerInfo = useMemo(() => ({
    title: 'Real-Time Crypto Futures Alpha Signals',
    subtitle: 'Bybit USDT-Perp. High-probability scalps and quick swings with execution-ready entries.',
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
      />

      <div className="mx-auto max-w-7xl px-4 pb-12 pt-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-3 space-y-6">
            <SettingsPanel
              running={running}
              setRunning={setRunning}
              intervalSel={intervalSel}
              setIntervalSel={setIntervalSel}
              settings={settings}
              setSettings={setSettings}
              onRefresh={fetchAndSignal}
              loading={loading}
            />
            <Watchlist symbols={symbols} setSymbols={setSymbols} prices={prices} />
          </div>
          <div className="lg:col-span-9 space-y-6">
            {error && (
              <div className="rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
            )}
            <AIInsights signals={signals} />
            <SignalBoard signals={signals} loading={loading} />
            <StrategyLab fetchKlines={fetchKlines} intervalSel={intervalSel} signals={signals} settings={settings} />
          </div>
        </div>

        <div className="mt-8 space-y-2 border-t border-white/10 pt-6 text-center text-xs text-white/50">
          <p>Live prices via Bybit WebSocket v5 (linear). Signals recompute on tick and every 60s.</p>
          <p>Research/education only. Crypto futures involve substantial risk. Manage risk strictly.</p>
        </div>
      </div>
    </div>
  );
}
