import { useEffect, useMemo, useRef, useState } from 'react';
import HeroCover from './components/HeroCover';
import SignalControls from './components/SignalControls';
import SignalCard from './components/SignalCard';
import Footer from './components/Footer';

const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT'];
const BASE_URL = 'https://api.bybit.com';

function useInterval(callback, delay) {
  const savedCallback = useRef();
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);
  useEffect(() => {
    if (delay === null) return;
    const id = setInterval(() => savedCallback.current && savedCallback.current(), delay);
    return () => clearInterval(id);
  }, [delay]);
}

function ema(values, period) {
  if (!values || values.length === 0) return [];
  const k = 2 / (period + 1);
  const result = [];
  let prev = values[0];
  result.push(prev);
  for (let i = 1; i < values.length; i++) {
    const next = values[i] * k + prev * (1 - k);
    result.push(next);
    prev = next;
  }
  return result;
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
  const trs = highs.map((_, i) => trueRange(highs, lows, closes, i));
  // Wilder's smoothing: use simple SMA for first and then EMA-like smoothing
  const res = [];
  let prevAtr = null;
  for (let i = 0; i < trs.length; i++) {
    if (i < period) {
      const slice = trs.slice(0, i + 1);
      const sma = slice.reduce((a, b) => a + b, 0) / slice.length;
      res.push(sma);
      if (i === period) prevAtr = sma;
    } else {
      prevAtr = (prevAtr * (period - 1) + trs[i]) / period;
      res.push(prevAtr);
    }
  }
  return res;
}

async function fetchTicker(symbol) {
  const url = `${BASE_URL}/v5/market/tickers?category=linear&symbol=${symbol}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Ticker fetch failed');
  const data = await res.json();
  const it = data?.result?.list?.[0];
  if (!it) throw new Error('No ticker');
  return {
    symbol,
    lastPrice: parseFloat(it.lastPrice),
    volume24: parseFloat(it.volume24h),
    turnover24: parseFloat(it.turnover24h),
    priceChangeRate24h: parseFloat(it.price24hPcnt || '0'),
  };
}

async function fetchKlines(symbol) {
  const url = `${BASE_URL}/v5/market/kline?category=linear&symbol=${symbol}&interval=5&limit=120`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Kline fetch failed');
  const data = await res.json();
  const list = data?.result?.list || [];
  // list items: [startTime, open, high, low, close, volume, turnover]
  const o = list.map(r => parseFloat(r[1])).reverse();
  const h = list.map(r => parseFloat(r[2])).reverse();
  const l = list.map(r => parseFloat(r[3])).reverse();
  const c = list.map(r => parseFloat(r[4])).reverse();
  const v = list.map(r => parseFloat(r[5])).reverse();
  return { o, h, l, c, v };
}

function decideSignal(symbol, price, k) {
  if (!k || !k.c || k.c.length < 30) return null;
  const closes = k.c;
  const highs = k.h;
  const lows = k.l;
  const vols = k.v;

  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const last = closes.length - 1;
  const trendUp = ema9[last] > ema21[last];
  const trendDown = ema9[last] < ema21[last];

  const a = atr(highs, lows, closes, 14);
  const atrPct = a[last] / closes[last];

  let leverage = 20;
  if (atrPct < 0.008) leverage = 50;
  else if (atrPct < 0.015) leverage = 25;
  else if (atrPct < 0.03) leverage = 15;
  else leverage = 10;

  // Volume pulse: last 3 vs prior 10 average
  const recentVol = vols.slice(-3).reduce((x, y) => x + y, 0) / 3;
  const baseVol = vols.slice(-13, -3).reduce((x, y) => x + y, 0) / 10 || 1;
  const volBoost = recentVol / baseVol;

  // Momentum: last 3 closes slope
  const m1 = closes[last] - closes[last - 1];
  const m2 = closes[last - 1] - closes[last - 2];
  const mom = (m1 + m2) / 2;

  let side = null;
  if (trendUp && mom > 0 && volBoost > 1.05) side = 'LONG';
  if (trendDown && mom < 0 && volBoost > 1.05) side = 'SHORT';
  if (!side) return null;

  const capital = 20; // USDT
  const amount = 20; // recommended amount in USDT
  const notional = amount * leverage;
  const targetProfitUSDT = 20; // aim 100% on $20
  const riskUSDT = 5; // risk 25%

  const requiredMoveTP = targetProfitUSDT / notional; // fraction
  const requiredMoveSL = riskUSDT / notional; // fraction

  const entry = price;
  const tp = side === 'LONG' ? entry * (1 + requiredMoveTP) : entry * (1 - requiredMoveTP);
  const sl = side === 'LONG' ? entry * (1 - requiredMoveSL) : entry * (1 + requiredMoveSL);

  const reasoning = `${side} on ${symbol}: EMA(9/21) trend with volume boost ${volBoost.toFixed(2)} and momentum confirmation.`;

  return {
    symbol,
    side,
    price,
    amount,
    leverage,
    capital,
    targetProfitUSDT,
    riskUSDT,
    entry,
    takeProfit: tp,
    stopLoss: sl,
    reasoning,
  };
}

export default function App() {
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [intervalMs, setIntervalMs] = useState(5 * 60 * 1000); // 5 minutes

  const fetchAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const tickers = await Promise.all(
        SYMBOLS.map(async (s) => {
          try {
            return await fetchTicker(s);
          } catch (e) {
            return null;
          }
        })
      );
      const validTickers = tickers.filter(Boolean);
      const klinesMap = Object.fromEntries(
        await Promise.all(
          validTickers.map(async (t) => {
            try {
              const k = await fetchKlines(t.symbol);
              return [t.symbol, k];
            } catch (e) {
              return [t.symbol, null];
            }
          })
        )
      );

      const sigs = validTickers
        .map((t) => {
          const k = klinesMap[t.symbol];
          return decideSignal(t.symbol, t.lastPrice, k);
        })
        .filter(Boolean);

      // Rank by volume turnover or vol boost proxy
      const ranked = sigs.sort((a, b) => {
        // prioritize BTC/ETH then others
        const prio = (sym) => (sym.startsWith('BTC') || sym.startsWith('ETH') ? 1 : 0);
        if (prio(b.symbol) !== prio(a.symbol)) return prio(b.symbol) - prio(a.symbol);
        return Math.abs(b.entry - b.takeProfit) - Math.abs(a.entry - a.takeProfit);
      });

      setSignals(ranked.slice(0, 6));
      setLastUpdated(new Date());
    } catch (e) {
      setError('Failed to load market data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  useInterval(
    () => {
      if (running) fetchAll();
    },
    running ? intervalMs : null
  );

  const nextRefreshIn = useNextRefreshCountdown(lastUpdated, intervalMs, running);

  const header = useMemo(() => ({
    title: 'Crypto Futures Alpha Signals',
    subtitle:
      'High-probability scalps and quick swings every 5 minutes. Auto-refreshed execution-ready entries with TP/SL.',
  }), []);

  return (
    <div className="min-h-screen w-full bg-black text-white">
      <div className="relative h-[60vh] w-full">
        <HeroCover title={header.title} subtitle={header.subtitle} />
      </div>

      <div className="mx-auto max-w-6xl px-4 py-8">
        <SignalControls
          running={running}
          onToggle={() => setRunning((v) => !v)}
          loading={loading}
          onRefresh={fetchAll}
          nextRefreshIn={nextRefreshIn}
          intervalMs={intervalMs}
          setIntervalMs={setIntervalMs}
        />

        {error && (
          <div className="mt-4 rounded-md border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-200">
            {error}
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {signals.map((s) => (
            <SignalCard key={`${s.symbol}-${s.side}`} signal={s} />
          ))}
        </div>

        {!loading && signals.length === 0 && (
          <div className="mt-8 rounded-lg border border-white/10 p-6 text-center text-sm text-white/70">
            No qualified setups right now. Waiting for the next window.
          </div>
        )}

        <Footer />
      </div>
    </div>
  );
}

function useNextRefreshCountdown(lastUpdated, intervalMs, running) {
  const [now, setNow] = useState(Date.now());
  useInterval(() => setNow(Date.now()), 250);
  if (!running || !lastUpdated) return null;
  const elapsed = now - lastUpdated.getTime();
  const remain = Math.max(0, intervalMs - elapsed);
  const s = Math.ceil(remain / 1000);
  return s;
}
