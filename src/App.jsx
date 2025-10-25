import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import HeaderBar from './components/HeaderBar';
import SettingsPanel from './components/SettingsPanel';
import Watchlist from './components/Watchlist';
import SignalBoard from './components/SignalBoard';

// Endpoints
const BYBIT_BASE = 'https://api.bybit.com';
const BYBIT_WS = 'wss://stream.bybit.com/v5/public/linear';
const BINANCE_FAPI = 'https://fapi.binance.com';

const DEFAULT_SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'XRPUSDT', 'DOGEUSDT'];

function useInterval(cb, delay) {
  const ref = useRef();
  useEffect(() => { ref.current = cb; }, [cb]);
  useEffect(() => { if (delay == null) return; const id = setInterval(() => ref.current && ref.current(), delay); return () => clearInterval(id); }, [delay]);
}

// WebSocket live prices (Bybit)
function useBybitWS(symbols, enabled) {
  const [status, setStatus] = useState('idle');
  const [latency, setLatency] = useState(null);
  const [lastTick, setLastTick] = useState(null);
  const [prices, setPrices] = useState({});
  const wsRef = useRef(null);
  const subsRef = useRef(new Set());
  const lastPingRef = useRef(null);
  const backoffRef = useRef(1000);

  const connect = useCallback(() => {
    if (!enabled) return;
    try { wsRef.current && wsRef.current.close(); } catch {}
    setStatus('connecting');
    const ws = new WebSocket(BYBIT_WS);
    wsRef.current = ws;

    ws.onopen = () => {
      setStatus('open');
      backoffRef.current = 1000;
      const args = symbols.map((s) => `tickers.${s}`);
      subsRef.current = new Set(args);
      ws.send(JSON.stringify({ op: 'subscribe', args }));
      lastPingRef.current = Date.now();
      ws.send(JSON.stringify({ op: 'ping' }));
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.op === 'pong') { if (lastPingRef.current) setLatency(Date.now() - lastPingRef.current); return; }
        if (msg.topic && msg.topic.startsWith('tickers.')) {
          const sym = msg.topic.split('.')[1];
          const data = msg.data?.[0] || msg.data || {};
          const lastPrice = parseFloat(data.lastPrice || data.lp || '0');
          if (Number.isFinite(lastPrice) && lastPrice > 0) {
            setPrices((p) => ({ ...p, [sym]: { price: lastPrice, ts: Date.now() } }));
            setLastTick(Date.now());
          }
        }
      } catch {}
    };

    ws.onclose = () => {
      setStatus('closed');
      if (!enabled) return;
      const t = backoffRef.current;
      backoffRef.current = Math.min(backoffRef.current * 2, 15000);
      setTimeout(() => connect(), t);
    };

    ws.onerror = () => { try { ws.close(); } catch {} };
  }, [symbols, enabled]);

  useEffect(() => { connect(); return () => { try { wsRef.current && wsRef.current.close(); } catch {} }; }, [connect]);

  // keep subs in sync
  useEffect(() => {
    if (!enabled) return;
    const ws = wsRef.current; if (!ws || ws.readyState !== 1) return;
    const want = new Set(symbols.map((s) => `tickers.${s}`));
    const have = subsRef.current;
    const toUnsub = [...have].filter((x) => !want.has(x));
    const toSub = [...want].filter((x) => !have.has(x));
    if (toUnsub.length) ws.send(JSON.stringify({ op: 'unsubscribe', args: toUnsub }));
    if (toSub.length) ws.send(JSON.stringify({ op: 'subscribe', args: toSub }));
    subsRef.current = want;
  }, [symbols, enabled]);

  useInterval(() => {
    if (!enabled) return;
    const ws = wsRef.current; if (!ws || ws.readyState !== 1) return;
    lastPingRef.current = Date.now(); ws.send(JSON.stringify({ op: 'ping' }));
  }, 10000);

  return { status, latency, lastTick, prices };
}

// REST: Bybit klines and instrument precision
async function fetchBybitKlines(symbol, interval = '5', limit = 240) {
  const url = `${BYBIT_BASE}/v5/market/kline?category=linear&symbol=${symbol}&interval=${interval}&limit=${limit}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('kline failed');
  const data = await res.json();
  const list = data?.result?.list || [];
  const o = list.map(r => parseFloat(r[1])).reverse();
  const h = list.map(r => parseFloat(r[2])).reverse();
  const l = list.map(r => parseFloat(r[3])).reverse();
  const c = list.map(r => parseFloat(r[4])).reverse();
  const v = list.map(r => parseFloat(r[5])).reverse();
  return { o, h, l, c, v };
}

async function fetchBybitInstrument(symbol) {
  const url = `${BYBIT_BASE}/v5/market/instruments-info?category=linear&symbol=${symbol}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const it = data?.result?.list?.[0];
  if (!it) return null;
  const tickSize = parseFloat(it.priceFilter?.tickSize || '0.01');
  const lotSize = parseFloat(it.lotSizeFilter?.qtyStep || '0.001');
  return { tickSize, lotSize };
}

// Binance market metrics for advanced filters
async function fetchBinanceFunding(symbol) {
  const url = `${BINANCE_FAPI}/fapi/v1/premiumIndex?symbol=${symbol}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const d = await res.json();
  const fr = parseFloat(d?.lastFundingRate || '0');
  return { fundingRate: fr };
}

async function fetchBinanceTakerRatio(symbol) {
  const url = `${BINANCE_FAPI}/futures/data/takerlongshortRatio?symbol=${symbol}&period=5m&limit=1`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const arr = await res.json();
  const last = arr?.[0];
  if (!last) return null;
  const buy = parseFloat(last?.buyVol || '0');
  const sell = parseFloat(last?.sellVol || '0');
  const ratio = sell ? buy / sell : 1;
  return { takerBuySellRatio: ratio };
}

async function fetchBinanceOI(symbol) {
  const url = `${BINANCE_FAPI}/futures/data/openInterestHist?symbol=${symbol}&period=5m&limit=10`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const arr = await res.json();
  if (!arr || arr.length < 2) return null;
  const last = parseFloat(arr[arr.length - 1]?.sumOpenInterest || '0');
  const prev = parseFloat(arr[arr.length - 2]?.sumOpenInterest || '0');
  const delta = last - prev;
  const pct = prev ? delta / prev : 0;
  return { openInterest: last, oiChangePct: pct };
}

// Indicators
function ema(values, period) {
  if (!values?.length) return [];
  const k = 2 / (period + 1);
  const out = [];
  let prev = values[0];
  out.push(prev);
  for (let i = 1; i < values.length; i++) { const next = values[i] * k + prev * (1 - k); out.push(next); prev = next; }
  return out;
}
function rsi(values, period = 14) {
  if (!values || values.length < period + 1) return Array(values?.length || 0).fill(null);
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) { const d = values[i] - values[i-1]; if (d>=0) gains += d; else losses -= d; }
  gains /= period; losses /= period;
  const out = Array(values.length).fill(null);
  out[period] = 100 - 100 / (1 + (gains / (losses || 1e-9)));
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i-1]; const g = d>0?d:0; const l = d<0?-d:0;
    gains = (gains*(period-1)+g)/period; losses = (losses*(period-1)+l)/period;
    out[i] = 100 - 100 / (1 + (gains / (losses || 1e-9)));
  }
  return out;
}
function trueRange(h, l, c, i) { if (i===0) return h[0]-l[0]; return Math.max(h[i]-l[i], Math.abs(h[i]-c[i-1]), Math.abs(l[i]-c[i-1])); }
function atr(highs, lows, closes, period = 14) {
  if (!highs?.length) return [];
  const trs = highs.map((_, i) => trueRange(highs, lows, closes, i));
  const out = [];
  let prev = 0;
  for (let i=0;i<trs.length;i++) { if (i<period) { const sma = trs.slice(0,i+1).reduce((a,b)=>a+b,0)/(i+1); prev = sma; out.push(prev); } else { prev = (prev*(period-1)+trs[i])/period; out.push(prev);} }
  return out;
}

// Strategy presets
const PRESETS = {
  scalps: { breakoutLookback: 18, breakoutBuffer: 0.0005, rsiMinLong: 45, rsiMaxLong: 72, rsiMinShort: 28, rsiMaxShort: 55 },
  momentum: { breakoutLookback: 36, breakoutBuffer: 0.0008, rsiMinLong: 50, rsiMaxLong: 80, rsiMinShort: 20, rsiMaxShort: 50 },
  meanrev: { breakoutLookback: 12, breakoutBuffer: -0.0002, rsiMinLong: 35, rsiMaxLong: 60, rsiMinShort: 40, rsiMaxShort: 65 },
};

function roundTo(n, step) { if (!step) return n; return Math.round(n/step)*step; }

function buildPosition(symbol, price, settings, precision) {
  const leverage = settings.leverage;
  const amount = settings.amount; // USDT margin allocated to this signal
  const notional = amount * leverage;
  const takerFee = settings.takerFee; // fraction per side
  const qty = notional / Math.max(price, 1e-9);
  const feeRoundQty = precision?.lotSize ? roundTo(qty, precision.lotSize) : qty;
  const feePerSide = notional * takerFee;
  const roundPrice = precision?.tickSize ? (v)=> roundTo(v, precision.tickSize) : (v)=>v;
  return { notional, qty: Math.max(feeRoundQty, precision?.lotSize || 0), feeRoundQty, feePerSide, roundPrice };
}

function decideSignal(symbol, tickPrice, k, settings, metrics, precision) {
  if (!k || !k.c || k.c.length < 60 || !tickPrice) return null;
  const closes = k.c, highs = k.h, lows = k.l, vols = k.v; const last = closes.length - 1;

  // indicators
  const ema9 = ema(closes, 9); const ema21 = ema(closes, 21); const rsi14 = rsi(closes, 14);
  const a = atr(highs, lows, closes, 14); const atrPct = a[last] / Math.max(1e-9, closes[last]);

  // dynamic leverage (bounded by user)
  let dynLev = atrPct < 0.008 ? 50 : atrPct < 0.015 ? 25 : atrPct < 0.03 ? 15 : 10;
  const leverage = Math.min(settings.maxLeverage, dynLev);

  // apply strategy preset ranges
  const p = PRESETS[settings.preset] || PRESETS.scalps;

  const trendUp = ema9[last] > ema21[last];
  const trendDown = ema9[last] < ema21[last];
  const recentVol = vols.slice(-3).reduce((a,b)=>a+b,0)/3; const baseVol = vols.slice(-20,-3).reduce((a,b)=>a+b,0)/Math.max(1,vols.slice(-20,-3).length); const volBoost = baseVol? (recentVol/baseVol):0;
  const mom = closes[last] - closes[last-3];
  const rangeHigh = Math.max(...highs.slice(-p.breakoutLookback));
  const rangeLow = Math.min(...lows.slice(-p.breakoutLookback));
  const breakoutLong = p.breakoutBuffer >= 0 ? tickPrice > rangeHigh * (1 - p.breakoutBuffer) : tickPrice < rangeHigh; // meanrev allows under-break
  const breakoutShort = p.breakoutBuffer >= 0 ? tickPrice < rangeLow * (1 + p.breakoutBuffer) : tickPrice > rangeLow; // meanrev allows over-break

  const rsiVal = rsi14[last] ?? 50;
  const rsiOkLong = rsiVal > (p.rsiMinLong||45) && rsiVal < (p.rsiMaxLong||75);
  const rsiOkShort = rsiVal < (p.rsiMaxShort||55) && rsiVal > (p.rsiMinShort||25);

  // Advanced metric filters (from Binance as proxy)
  const fr = metrics?.fundingRate ?? 0; // prefer low absolute funding for meanrev, positive for momentum longs
  const tbr = metrics?.takerBuySellRatio ?? 1;
  const oiChg = metrics?.oiChangePct ?? 0;

  let side = null;
  if (settings.enableLongs && trendUp && mom > 0 && volBoost > 1.05 && breakoutLong && rsiOkLong) {
    // favor longs if taker ratio > 1 and OI rising or funding not extremely negative
    if (tbr >= 0.95 && oiChg >= -0.01 && fr > -0.01) side = 'LONG';
  }
  if (!side && settings.enableShorts && trendDown && mom < 0 && volBoost > 1.05 && breakoutShort && rsiOkShort) {
    // favor shorts if taker ratio < 1 and OI non-rising or funding not extremely positive
    if (tbr <= 1.05 && oiChg <= 0.02 && fr < 0.02) side = 'SHORT';
  }
  if (!side) return null;

  // Build position and fee-aware TP/SL
  const pos = buildPosition(symbol, tickPrice, { amount: settings.amount, leverage, takerFee: settings.takerFee }, precision);
  const capital = settings.capital;
  const riskUSDT = settings.risk;
  const targetProfitUSDT = settings.targetProfit;
  const notional = pos.notional;
  const feesRoundTrip = 2 * pos.feePerSide; // entry + exit taker

  // Required move accounting for fees
  const requiredMoveTP = (targetProfitUSDT + feesRoundTrip) / Math.max(1e-9, notional);
  const requiredMoveSL = (riskUSDT - feesRoundTrip) / Math.max(1e-9, notional);

  const entry = precision?.tickSize ? pos.roundPrice(tickPrice) : tickPrice;
  const rawTP = side==='LONG' ? entry * (1 + requiredMoveTP) : entry * (1 - requiredMoveTP);
  const rawSL = side==='LONG' ? entry * (1 - Math.max(requiredMoveSL, 0.0005)) : entry * (1 + Math.max(requiredMoveSL, 0.0005));
  const takeProfit = precision?.tickSize ? pos.roundPrice(rawTP) : rawTP;
  const stopLoss = precision?.tickSize ? pos.roundPrice(rawSL) : rawSL;

  const reasoning = `${side} ${symbol}: EMA9/21 trend, vol x${volBoost.toFixed(2)}, RSI ${Math.round(rsiVal)}, FR ${(fr*100).toFixed(3)}%, TBR ${tbr.toFixed(2)}, OI ${(oiChg*100).toFixed(2)}%`;

  return {
    symbol,
    side,
    price: tickPrice,
    amount: settings.amount,
    leverage,
    capital,
    targetProfitUSDT,
    riskUSDT,
    entry,
    takeProfit,
    stopLoss,
    qty: pos.qty,
    feesRoundTrip,
    meta: { volBoost, atrPct, rsi: rsiVal, fundingRate: fr, takerRatio: tbr, oiChangePct: oiChg },
    reasoning,
  };
}

export default function App() {
  const [symbols, setSymbols] = useState(DEFAULT_SYMBOLS);
  const [exchange, setExchange] = useState('BYBIT'); // BYBIT | BINANCE
  const useWs = exchange === 'BYBIT';
  const { status, latency, lastTick, prices: wsPrices } = useBybitWS(symbols, useWs);

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
    takerFee: 0.0006,
    preset: 'scalps',
    enableLongs: true,
    enableShorts: true,
    notifications: false,
    soundAlerts: true,
  });

  // Poll REST price for Binance if chosen
  const [restPrices, setRestPrices] = useState({});
  const fetchRestPrices = useCallback(async () => {
    if (exchange !== 'BINANCE') return;
    try {
      const results = await Promise.all(symbols.map(async (s)=>{
        const url = `${BINANCE_FAPI}/fapi/v1/ticker/price?symbol=${s}`;
        const r = await fetch(url); if (!r.ok) return [s,null]; const d = await r.json(); const price = parseFloat(d?.price||'0'); return [s, { price, ts: Date.now() }];
      }));
      setRestPrices(Object.fromEntries(results.filter(Boolean)));
    } catch {}
  }, [symbols, exchange]);
  useInterval(fetchRestPrices, exchange==='BINANCE' ? 3000 : null);
  useEffect(() => { fetchRestPrices(); }, [fetchRestPrices]);

  const livePrices = useMemo(()=> exchange==='BYBIT' ? wsPrices : restPrices, [exchange, wsPrices, restPrices]);

  // Cache precision per symbol
  const precisionRef = useRef({});
  const getPrecision = useCallback(async (sym) => {
    if (precisionRef.current[sym]) return precisionRef.current[sym];
    const p = await fetchBybitInstrument(sym);
    precisionRef.current[sym] = p || { tickSize: 0.01, lotSize: 0.001 };
    return precisionRef.current[sym];
  }, []);

  // Advanced metrics cache
  const metricsRef = useRef({});
  const fetchMetrics = useCallback(async (sym) => {
    // Use Binance public endpoints for funding/taker ratio/OI
    try {
      const [fr, tr, oi] = await Promise.all([
        fetchBinanceFunding(sym),
        fetchBinanceTakerRatio(sym),
        fetchBinanceOI(sym)
      ]);
      metricsRef.current[sym] = { ...(fr||{}), ...(tr||{}), ...(oi||{}) };
    } catch {}
    return metricsRef.current[sym] || {};
  }, []);

  const fetchAndSignal = useCallback(async () => {
    if (!running) return;
    setLoading(true); setError(null);
    try {
      const results = await Promise.all(symbols.map(async (sym) => {
        try {
          const [k, precision] = await Promise.all([
            fetchBybitKlines(sym, intervalSel, 240),
            getPrecision(sym)
          ]);
          // live price
          const tick = livePrices[sym]?.price;
          // metrics
          const metrics = await fetchMetrics(sym);
          // extend settings with leverage bound from maxLeverage
          const sig = decideSignal(sym, tick, k, { ...settings }, metrics, precision);
          return sig;
        } catch (e) {
          return null;
        }
      }));
      const list = results.filter(Boolean);
      const ranked = list.sort((a,b)=>{
        // prioritize larger TP distance and better vol boost
        const av = Math.abs(a.takeProfit - a.entry); const bv = Math.abs(b.takeProfit - b.entry);
        if ((b.meta?.volBoost||0) !== (a.meta?.volBoost||0)) return (b.meta?.volBoost||0) - (a.meta?.volBoost||0);
        return bv - av;
      });
      setSignals(ranked);
    } catch (e) {
      setError('Failed to compute signals.');
    } finally { setLoading(false); }
  }, [symbols, intervalSel, livePrices, running, settings, getPrecision, fetchMetrics]);

  // Initial + interval change
  useEffect(() => { fetchAndSignal(); }, [fetchAndSignal]);

  // Recompute on live tick (Bybit) or REST poll updates
  const lastPricesKey = JSON.stringify(Object.entries(livePrices).map(([s,v])=>[s, v?.ts]).sort());
  useEffect(() => { const id = setTimeout(() => { if (running) fetchAndSignal(); }, 2000); return () => clearTimeout(id); }, [lastPricesKey, fetchAndSignal, running]);

  // Periodic refresh of klines/metrics
  useInterval(() => { if (running) fetchAndSignal(); }, 60000);
  useInterval(() => { // refresh metrics less frequently
    if (!running) return;
    (async () => { for (const s of symbols) { await fetchMetrics(s); } })();
  }, 120000);

  // Notifications + sound alerts for entry/TP/SL touch
  useEffect(() => { if (settings.notifications && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission(); }, [settings.notifications]);
  const playBeep = useCallback(() => {
    if (!settings.soundAlerts) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine'; o.frequency.value = 880; o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0.001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.01); o.start();
      setTimeout(()=>{ g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.2); o.stop(ctx.currentTime + 0.25); }, 120);
    } catch {}
  }, [settings.soundAlerts]);
  const prevTouchRef = useRef({});
  useEffect(() => {
    signals.forEach(sig => {
      const price = livePrices[sig.symbol]?.price; if (!price) return;
      const key = `${sig.symbol}-${sig.side}`;
      const prev = prevTouchRef.current[key] || { entry: false, tp: false, sl: false };
      const crossedEntry = sig.side==='LONG' ? price >= sig.entry : price <= sig.entry;
      const crossedTP = sig.side==='LONG' ? price >= sig.takeProfit : price <= sig.takeProfit;
      const crossedSL = sig.side==='LONG' ? price <= sig.stopLoss : price >= sig.stopLoss;
      const notify = (title, body) => { if (settings.notifications && 'Notification' in window && Notification.permission === 'granted') new Notification(title, { body }); };
      if (crossedEntry && !prev.entry) { notify('Entry touched', `${sig.side} ${sig.symbol} @ ${sig.entry.toFixed(6)}`); playBeep(); }
      if (crossedTP && !prev.tp) { notify('Take Profit reached', `${sig.side} ${sig.symbol} TP ${sig.takeProfit.toFixed(6)}`); playBeep(); }
      if (crossedSL && !prev.sl) { notify('Stop Loss hit', `${sig.side} ${sig.symbol} SL ${sig.stopLoss.toFixed(6)}`); playBeep(); }
      prevTouchRef.current[key] = { entry: crossedEntry, tp: crossedTP, sl: crossedSL };
    });
  }, [signals, livePrices, playBeep, settings.notifications]);

  const headerInfo = useMemo(() => ({
    title: 'Real-Time Futures Alpha Signals',
    subtitle: 'Multi-exchange metrics with live entries, fee-aware TP/SL, and strategy presets.'
  }), []);

  return (
    <div className="min-h-screen w-full bg-black text-white">
      <HeaderBar
        title={headerInfo.title}
        subtitle={headerInfo.subtitle}
        wsStatus={useWs ? status : 'rest'}
        latency={useWs ? latency : null}
        lastTick={useWs ? lastTick : Object.values(livePrices)[0]?.ts}
        onRefresh={fetchAndSignal}
        loading={loading}
        exchange={exchange}
        setExchange={setExchange}
      />

      <div className="mx-auto max-w-7xl px-4 pb-12 pt-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="lg:col-span-4 space-y-6">
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
            <Watchlist symbols={symbols} setSymbols={setSymbols} prices={livePrices} />
          </div>
          <div className="lg:col-span-8">
            {error && (
              <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-200">{error}</div>
            )}
            <SignalBoard signals={signals} loading={loading} />
          </div>
        </div>
        <div className="mt-8 space-y-2 border-t border-white/10 pt-6 text-center text-xs text-white/50">
          <p>Live prices via {exchange==='BYBIT' ? 'Bybit WebSocket' : 'Binance REST'}; metrics via Binance public endpoints. Signals recompute automatically.</p>
          <p>Research/education only. Futures are high risk. Manage risk strictly.</p>
        </div>
      </div>
    </div>
  );
}
