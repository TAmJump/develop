#!/usr/bin/env node
/**
 * MCI Market Data Fetcher
 * GitHub Actions で毎日実行 → data/latest.json を更新
 *
 * Yahoo Finance API (public, no key required) を使用
 * Symbols:
 *   ^N225      = 日経平均
 *   USDJPY=X   = ドル円
 *   BZ=F       = Brent原油先物
 *   HG=F       = 銅先物 (USD/lb)
 *   ^TNX       = 米10Y (JGB10Y代替)
 *   CNYJPY=X   = 人民元/円
 *   NUE        = Nucor(鉄鋼株・HRC代替)
 *   LB=F       = 木材先物
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');

// ── 主要シンボル ──────────────────────────────────────────
const SYMBOLS = {
  nikkei: '%5EN225',
  usdjpy: 'USDJPY%3DX',
  brent:  'BZ%3DF',
  copper: 'HG%3DF',
  jgb10y: '%5ETNX',      // 米10Y（JGB10Y代替）
  cnyJpy: 'CNYJPY%3DX',  // 人民元/円
  steel:  'NUE',          // Nucor（鉄鋼株・HRC先物代替）
  lumber: 'LB%3DF',       // 木材先物
};

// ── フォールバックシンボル（主要が失敗した場合） ─────────
const FALLBACK_SYMBOLS = {
  jgb10y: '%5EIRXX',   // Japan 10Y（取れれば優先）
  steel:  'STLD',       // Steel Dynamics（Nucor失敗時）
  lumber: 'WOOD',       // iShares木材ETF（先物失敗時）
  cnyJpy: 'CNY%3DX',   // 人民元USD建て（変換計算）
};

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    // query1 と query2 を両方試す
    const req = https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function getQuote(symbol, fallback = null) {
  const endpoints = [
    `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=35d`,
    `https://query2.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=35d`,
  ];

  for (const url of endpoints) {
    try {
      const data = await fetchJSON(url);
      const result = data?.chart?.result?.[0];
      if (!result) continue;

      const meta   = result.meta;
      const closes = result.indicators?.quote?.[0]?.close || [];
      const timestamps = result.timestamp || [];

      const lastClose = meta.regularMarketPrice || meta.previousClose;
      if (!lastClose) continue;

      const history = [];
      for (let i = 0; i < timestamps.length; i++) {
        if (closes[i] != null) {
          const d = new Date(timestamps[i] * 1000);
          history.push({
            date:  d.toISOString().slice(0, 10),
            value: Math.round(closes[i] * 1000) / 1000,
          });
        }
      }
      return { current: lastClose, history };
    } catch (e) {
      // 次のエンドポイントを試す
    }
  }

  // フォールバックシンボルを試す
  if (fallback) {
    console.log(`    ↪ trying fallback: ${fallback}`);
    return getQuote(fallback);
  }

  return null;
}

async function main() {
  console.log('📊 MCI Market Data Fetch (8 indicators)');
  console.log('=========================================');

  const dataDir = path.join(__dirname, '..', 'data');
  const outPath = path.join(dataDir, 'latest.json');

  let existing = {};
  try { existing = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch {}

  const baseValues = existing.baseValues || {
    nikkei: 27500, usdjpy: 131.0, brent: 95.0, copper: 4.30,
    jgb10y: 0.20,  cnyJpy: 19.5,  steel:  42.0, lumber: 450.0,
  };

  const results   = {};
  const history30d = {};
  const statusLog  = {};

  for (const [key, symbol] of Object.entries(SYMBOLS)) {
    console.log(`  Fetching ${key} (${symbol})...`);
    const fallback = FALLBACK_SYMBOLS[key] || null;
    const q = await getQuote(symbol, fallback);

    if (q && q.current) {
      results[key]    = Math.round(q.current * 1000) / 1000;
      history30d[key] = q.history;
      statusLog[key]  = 'live';
      console.log(`    ✅ ${key} = ${results[key]}`);
    } else {
      results[key]    = existing.currentValues?.[key] || baseValues[key];
      history30d[key] = existing.history30d?.map(d => ({ date: d.date, value: d[key] })).filter(Boolean) || [];
      statusLog[key]  = 'fallback';
      console.log(`    ⚠  ${key} = ${results[key]} (fallback/maintained)`);
    }
  }

  // 30日分の統合履歴
  const allDates = new Set();
  Object.values(history30d).forEach(arr => arr.forEach(d => allDates.add(d.date)));
  const sortedDates = [...allDates].sort().slice(-30);

  const mergedHistory = sortedDates.map(date => {
    const entry = { date };
    for (const key of Object.keys(SYMBOLS)) {
      const found = history30d[key]?.find(d => d.date === date);
      entry[key] = found ? found.value : (results[key] || baseValues[key]);
    }
    return entry;
  });

  // MCI計算
  const weights = {
    usdjpy: 0.27, copper: 0.18, steel:  0.15, brent:  0.12,
    nikkei: 0.10, lumber: 0.08, cnyJpy: 0.06, jgb10y: 0.04,
  };
  let mci = 0;
  for (const [k, w] of Object.entries(weights)) {
    mci += w * (results[k] / baseValues[k]);
  }

  const output = {
    baseDate:      existing.baseDate || '2022-04-01',
    fetchDate:     new Date().toISOString().slice(0, 10),
    fetchTime:     new Date().toISOString(),
    baseValues,
    currentValues: results,
    history30d:    mergedHistory,
    mci:           Math.round(mci * 10000) / 10000,
    weights,
    statusLog,
  };

  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');

  console.log('=========================================');
  console.log(`✅ MCI = ${mci.toFixed(4)} (${((mci - 1) * 100).toFixed(1)}%)`);
  console.log(`📊 Status: ${Object.entries(statusLog).map(([k,v]) => `${k}:${v}`).join(' | ')}`);
  console.log(`📁 Saved → ${outPath}`);
}

main().catch(e => { console.error('❌ Fatal:', e); process.exit(1); });
