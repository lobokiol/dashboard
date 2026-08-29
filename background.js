importScripts('portfolio.js');

const STOCK_SYMBOL_PATTERN = /^[A-Z0-9.^=-]{1,12}$/;
const EXCHANGE_RATE_SYMBOL = 'CNY=X';
const MILESTONE_ALARM = 'portfolio-milestone-check';
const MILESTONE_THRESHOLDS = [500000, 1000000];
const MILESTONE_STATE_VERSION = 3;
const DEFAULT_ASSET_DEFINITIONS = [
  { symbol: 'BTC', type: 'crypto' },
  { symbol: 'ADA', type: 'crypto' },
  { symbol: 'OKB', type: 'crypto' },
  { symbol: 'PAXG', type: 'crypto' },
  { symbol: 'BNB', type: 'crypto' },
  { symbol: 'AAPL', type: 'stock' },
  { symbol: 'GOOGL', type: 'stock' },
  { symbol: 'NVDA', type: 'stock' }
];
const DEFAULT_HOLDINGS = {
  BTC: 0,
  ADA: 10000,
  OKB: 100,
  PAXG: 0,
  BNB: 0,
  AAPL: 0,
  GOOGL: 0,
  NVDA: 0
};
const notificationIcon = 'notification.svg';

let milestoneCheckInProgress = false;
let milestoneRefreshInProgress = false;

async function fetchStockPrice(symbol) {
  if (!STOCK_SYMBOL_PATTERN.test(symbol)) throw new Error(`Invalid symbol: ${symbol}`);

  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  if (!response.ok) throw new Error(`Yahoo HTTP ${response.status}`);

  const data = await response.json();
  const price = Number(data?.chart?.result?.[0]?.meta?.regularMarketPrice);
  if (!Number.isFinite(price)) throw new Error(`Missing price: ${symbol}`);
  return price;
}

async function fetchCryptoPrices(symbols) {
  const response = await fetch('https://www.okx.com/api/v5/market/tickers?instType=SPOT');
  if (!response.ok) throw new Error(`OKX HTTP ${response.status}`);

  const payload = await response.json();
  if (!Array.isArray(payload.data)) throw new Error('OKX 返回格式异常');

  return payload.data.reduce((result, item) => {
    const symbol = item.instId?.endsWith('-USDT') ? item.instId.slice(0, -5) : '';
    const price = Number(item.last);
    if (symbols.includes(symbol) && Number.isFinite(price)) result[symbol] = price;
    return result;
  }, {});
}

async function fetchStockPrices(symbols) {
  const results = await Promise.allSettled(symbols.map(fetchStockPrice));
  return results.reduce((prices, result, index) => {
    if (result.status === 'fulfilled') prices[symbols[index]] = result.value;
    return prices;
  }, {});
}

function normalizeAssetDefinitions(definitions) {
  const seen = new Set();
  const normalized = [];

  definitions.forEach(asset => {
    const symbol = String(asset?.symbol || '').trim().toUpperCase();
    const type = asset?.type === 'stock' ? 'stock' : 'crypto';
    if (!STOCK_SYMBOL_PATTERN.test(symbol) || seen.has(symbol)) return;
    seen.add(symbol);
    normalized.push({ symbol, type });
  });

  return normalized;
}

function createNotification(threshold, totalCny) {
  const thresholdText = new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 0
  }).format(threshold);
  const totalText = new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(totalCny);

  chrome.notifications.create(`milestone-${threshold}-${Date.now()}`, {
    type: 'basic',
    iconUrl: notificationIcon,
    title: '资产总额提醒',
    message: `人民币合计已突破 ${thresholdText}，当前约 ${totalText}`
  }, () => {
    void chrome.runtime.lastError;
  });
}

async function checkMilestones(totalCny) {
  if (milestoneCheckInProgress) return [];
  milestoneCheckInProgress = true;

  try {
    const stored = await chrome.storage.local.get({
      milestoneState: null,
      milestoneStateVersion: 0
    });
    const result = PortfolioCore.getMilestoneCrossings(
      stored.milestoneStateVersion === MILESTONE_STATE_VERSION
        ? stored.milestoneState
        : { '500000': false, '1000000': false },
      totalCny,
      MILESTONE_THRESHOLDS
    );

    await chrome.storage.local.set({
      milestoneState: result.state,
      milestoneStateVersion: MILESTONE_STATE_VERSION
    });
    result.crossings.forEach(threshold => createNotification(threshold, totalCny));
    return result.crossings;
  } finally {
    milestoneCheckInProgress = false;
  }
}

async function refreshPortfolioForAlerts() {
  const stored = await chrome.storage.local.get({
    holdings: DEFAULT_HOLDINGS,
    assetDefinitions: null
  });
  const definitions = Array.isArray(stored.assetDefinitions)
    ? stored.assetDefinitions
    : DEFAULT_ASSET_DEFINITIONS;
  const assets = normalizeAssetDefinitions(definitions);
  const cryptos = assets.filter(asset => asset.type === 'crypto').map(asset => asset.symbol);
  const stocks = assets.filter(asset => asset.type === 'stock').map(asset => asset.symbol);
  const holdings = assets.reduce((result, asset) => {
    result[asset.symbol] = PortfolioCore.normalizeQuantity(
      stored.holdings?.[asset.symbol] ?? DEFAULT_HOLDINGS[asset.symbol] ?? 0
    );
    return result;
  }, {});

  const [cryptoResult, stockResult] = await Promise.allSettled([
    fetchCryptoPrices(cryptos),
    fetchStockPrices([...stocks, EXCHANGE_RATE_SYMBOL])
  ]);
  const cryptoPrices = cryptoResult.status === 'fulfilled' ? cryptoResult.value : {};
  const stockPrices = stockResult.status === 'fulfilled' ? stockResult.value : {};
  const rate = Number(stockPrices[EXCHANGE_RATE_SYMBOL]);
  if (!Number.isFinite(rate) || rate <= 0) return;

  const totalUsd = PortfolioCore.calculateTotal({ ...cryptoPrices, ...stockPrices }, holdings);
  const totalCny = PortfolioCore.convertUsdToCny(totalUsd, rate);
  if (Number.isFinite(totalCny)) await checkMilestones(totalCny);
}

function scheduleMilestoneAlarm() {
  chrome.alarms.create(MILESTONE_ALARM, {
    delayInMinutes: 5,
    periodInMinutes: 5
  });
}

chrome.runtime.onInstalled.addListener(scheduleMilestoneAlarm);
chrome.runtime.onStartup.addListener(scheduleMilestoneAlarm);

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name !== MILESTONE_ALARM || milestoneRefreshInProgress) return;
  milestoneRefreshInProgress = true;
  refreshPortfolioForAlerts().catch(() => {}).finally(() => {
    milestoneRefreshInProgress = false;
  });
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'CHECK_TOTAL_MILESTONES') {
    const totalCny = Number(message.totalCny);
    if (!Number.isFinite(totalCny)) {
      sendResponse({ ok: false });
      return false;
    }

    checkMilestones(totalCny).then(crossings => sendResponse({ ok: true, crossings })).catch(() => {
      sendResponse({ ok: false });
    });
    return true;
  }

  if (message.type !== 'GET_STOCKS') return false;

  const symbols = Array.isArray(message.symbols) ? message.symbols : [];

  Promise.allSettled(symbols.map(fetchStockPrice)).then(results => {
    const prices = {};
    const errors = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        prices[symbols[index]] = result.value;
      } else {
        errors.push(symbols[index]);
      }
    });

    sendResponse({ prices, errors });
  });

  return true;
});
