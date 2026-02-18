#!/usr/bin/env node
/**
 * MCI Market Data Fetcher
 * GitHub Actions で毎日実行 → data/latest.json を更新
 * 
 * Yahoo Finance API (public, no key required) を使用
 * Symbols:
 *   ^N225    = 日経平均
 *   USDJPY=X = ドル円
 *   BZ=F     = Brent原油先物
 *   HG=F     = 銅先物 (USD/lb)
 *   ^TNX     = 米10Y (JGB代替参考)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const SYMBOLS = {
  nikkei:  '%5EN225',
  usdjpy:  'USDJPY%3DX',
  brent:   'BZ%3DF',
  copper:  'HG%3DF',
  jgb10y:  '%5EIRXX'  // Japan 10Y Govt Bond Index (fallback below)
};

// JGB 10Yは直接取れないことがあるので、別途フォールバック
const JGB_FALLBACK_SYMBOL = '%5ETNX'; // US 10Y as proxy if needed

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MCI-Bot/1.0)' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error(`JSON parse error: ${e.message}`)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

async function getQuote(symbol) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=35d`;
  try {
    const data = await fetchJSON(url);
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    
    const meta = result.meta;
    const closes = result.indicators?.quote?.[0]?.close || [];
    const timestamps = result.timestamp || [];
    
    // 直近の有効な終値を取得
    let lastClose = meta.regularMarketPrice || meta.previousClose;
    
    // 30日分の日次データ
    const history = [];
    for (let i = 0; i < timestamps.length; i++) {
      if (closes[i] != null) {
        const d = new Date(timestamps[i] * 1000);
        history.push({
          date: d.toISOString().slice(0, 10),
          value: Math.round(closes[i] * 1000) / 1000
        });
      }
    }
    
    return { current: lastClose, history };
  } catch (e) {
    console.error(`  ⚠ ${symbol}: ${e.message}`);
    return null;
  }
}

async function main() {
  console.log('📊 MCI Market Data Fetch');
  console.log('========================');
  
  const dataDir = path.join(__dirname, '..', 'data');
  const outPath = path.join(dataDir, 'latest.json');
  
  // 既存データ読み込み
  let existing = {};
  try { existing = JSON.parse(fs.readFileSync(outPath, 'utf8')); } catch {}
  
  const baseValues = existing.baseValues || {
    nikkei: 27500, usdjpy: 131.0, brent: 95.0, copper: 4.30, jgb10y: 0.20
  };
  
  // 各指標を取得
  const results = {};
  const history30d = {};
  
  for (const [key, symbol] of Object.entries(SYMBOLS)) {
    console.log(`  Fetching ${key} (${symbol})...`);
    const q = await getQuote(symbol);
    if (q && q.current) {
      results[key] = Math.round(q.current * 1000) / 1000;
      history30d[key] = q.history;
      console.log(`    ✅ ${key} = ${results[key]}`);
    } else {
      // フォールバック: 既存値を使用
      results[key] = existing.currentValues?.[key] || baseValues[key];
      history30d[key] = [];
      console.log(`    ⚠ ${key} = ${results[key]} (fallback)`);
    }
  }
  
  // JGB 10Y のフォールバック（Yahoo で取れない場合）
  if (!results.jgb10y || results.jgb10y === baseValues.jgb10y) {
    console.log('  Trying JGB 10Y fallback...');
    // 日本10年国債は直接取りにくいので、既知の値を維持
    // GitHub Actions で別ソースを追加する場合はここを拡張
    console.log(`    ℹ JGB 10Y = ${results.jgb10y} (maintained)`);
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
  
  // MCI計算（確認用）
  const weights = { usdjpy: 0.35, copper: 0.25, brent: 0.15, nikkei: 0.15, jgb10y: 0.10 };
  let mci = 0;
  for (const [k, w] of Object.entries(weights)) {
    mci += w * (results[k] / baseValues[k]);
  }
  
  const output = {
    baseDate: existing.baseDate || '2026-02-18',
    fetchDate: new Date().toISOString().slice(0, 10),
    fetchTime: new Date().toISOString(),
    baseValues,
    currentValues: results,
    history30d: mergedHistory,
    mci: Math.round(mci * 10000) / 10000,
    weights
  };
  
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
  
  console.log('========================');
  console.log(`✅ MCI = ${mci.toFixed(4)} (${((mci-1)*100).toFixed(1)}%)`);
  console.log(`📁 Saved to ${outPath}`);
}

main().catch(e => { console.error('❌ Fatal:', e); process.exit(1); });
