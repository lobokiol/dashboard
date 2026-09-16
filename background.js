importScripts('portfolio.js');

const STOCK_SYMBOL_PATTERN = /^[A-Z0-9.^=-]{1,12}$/;
const EXCHANGE_RATE_SYMBOL = 'CNY=X';
const DEFAULT_USD_CNY_RATE = 7.2;
const MILESTONE_ALARM = 'portfolio-milestone-check';
const MILESTONE_THRESHOLDS = [500000, 1000000];
const MILESTONE_STATE_VERSION = 3;
const DASHBOARD_SHORTCUT_COMMANDS = new Set(['open-dashboard', 'open-dashboard-global']);
const SHORTCUT_POPUP_CLOSE_KEY = 'shortcutPopupCloseAt';
const SHORTCUT_POPUP_DURATION_MS = 3000;
const DEFAULT_ASSET_DEFINITIONS = [
  { symbol: 'BTC', type: 'crypto' },
  { symbol: 'ADA', type: 'crypto' },
  { symbol: 'OKB', type: 'crypto' },
  { symbol: 'PAXG', type: 'crypto' },
  { symbol: 'BNB', type: 'crypto' },
  { symbol: 'BGB', type: 'crypto' },
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
  BGB: 0,
  AAPL: 0,
  GOOGL: 0,
  NVDA: 0
};
const notificationIcon = 'notification.svg';

let milestoneCheckInProgress = false;
let milestoneRefreshInProgress = false;

async function fetchYahooPrice(symbol, type = 'stock') {
  if (!STOCK_SYMBOL_PATTERN.test(symbol)) throw new Error(`Invalid symbol: ${symbol}`);

  const yahooSymbols = type === 'crypto'
    ? [`${symbol}-USD`]
    : type === 'auto'
      ? [`${symbol}-USD`, symbol]
      : [symbol];
  let lastError;

  for (const yahooSymbol of yahooSymbols) {
    try {
      const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}`);
      if (!response.ok) throw new Error(`Yahoo HTTP ${response.status}`);

      const data = await response.json();
      const price = Number(data?.chart?.result?.[0]?.meta?.regularMarketPrice);
      if (!Number.isFinite(price)) throw new Error(`Missing price: ${symbol}`);
      return {
        price,
        resolvedType: yahooSymbol.endsWith('-USD') ? 'crypto' : 'stock'
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error(`Missing price: ${symbol}`);
}

async function fetchCryptoPrices(symbols) {
  if (!symbols.length) return {};

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

async function fetchYahooPrices(assets) {
  const requests = [
    ...assets,
    { symbol: EXCHANGE_RATE_SYMBOL, type: 'stock' }
  ];
  const results = await Promise.allSettled(
    requests.map(asset => fetchYahooPrice(asset.symbol, asset.type))
  );

  return results.reduce((marketData, result, index) => {
    if (result.status !== 'fulfilled') return marketData;
    const symbol = requests[index].symbol;
    marketData.prices[symbol] = result.value.price;
    marketData.resolvedTypes[symbol] = result.value.resolvedType;
    return marketData;
  }, { prices: {}, resolvedTypes: {} });
}

async function fetchAllMarketPrices(assets) {
  const yahooMarketData = await fetchYahooPrices(assets);
  const missingCryptoSymbols = assets
    .filter(asset => asset.type !== 'stock' && !Number.isFinite(yahooMarketData.prices[asset.symbol]))
    .map(asset => asset.symbol);
  const okxPrices = await fetchCryptoPrices(missingCryptoSymbols).catch(() => ({}));
  Object.keys(okxPrices).forEach(symbol => {
    yahooMarketData.resolvedTypes[symbol] = 'crypto';
  });

  return {
    prices: { ...yahooMarketData.prices, ...okxPrices },
    resolvedTypes: yahooMarketData.resolvedTypes
  };
}

function normalizeAssetDefinitions(definitions) {
  const seen = new Set();
  const normalized = [];

  definitions.forEach(asset => {
    const symbol = String(asset?.symbol || '').trim().toUpperCase();
    const type = asset?.type === 'stock' ? 'stock' : asset?.type === 'auto' ? 'auto' : 'crypto';
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
    assetDefinitions: null,
    usdCnyRate: DEFAULT_USD_CNY_RATE
  });
  const definitions = Array.isArray(stored.assetDefinitions)
    ? stored.assetDefinitions
    : DEFAULT_ASSET_DEFINITIONS;
  const assets = normalizeAssetDefinitions(definitions);
  const holdings = assets.reduce((result, asset) => {
    result[asset.symbol] = PortfolioCore.normalizeQuantity(
      stored.holdings?.[asset.symbol] ?? DEFAULT_HOLDINGS[asset.symbol] ?? 0
    );
    return result;
  }, {});

  const marketResult = await fetchAllMarketPrices(assets);
  const receivedRate = Number(marketResult.prices[EXCHANGE_RATE_SYMBOL]);
  const rate = PortfolioCore.resolveUsdCnyRate(receivedRate, stored.usdCnyRate, DEFAULT_USD_CNY_RATE);
  const resolvedAssets = PortfolioCore.applyResolvedAssetTypes(assets, marketResult.resolvedTypes);
  const storageUpdates = {};
  if (Number.isFinite(receivedRate) && receivedRate > 0) storageUpdates.usdCnyRate = receivedRate;
  if (resolvedAssets.changed) storageUpdates.assetDefinitions = resolvedAssets.definitions;
  if (Object.keys(storageUpdates).length) await chrome.storage.local.set(storageUpdates);

  const totalUsd = PortfolioCore.calculateTotal(marketResult.prices, holdings);
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

async function openDashboardForShortcut() {
  await chrome.storage.session.set({
    [SHORTCUT_POPUP_CLOSE_KEY]: Date.now() + SHORTCUT_POPUP_DURATION_MS
  });

  try {
    await chrome.action.openPopup();
  } catch {
    await chrome.storage.session.remove(SHORTCUT_POPUP_CLOSE_KEY);
  }
}

chrome.commands.onCommand.addListener(command => {
  if (!DASHBOARD_SHORTCUT_COMMANDS.has(command)) return;
  openDashboardForShortcut();
});

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

  if (message.type !== 'GET_MARKET_PRICES') return false;

  const assets = normalizeAssetDefinitions(message.assets);
  fetchAllMarketPrices(assets)
    .then(result => sendResponse({ ok: true, ...result }))
    .catch(() => sendResponse({ ok: false, prices: {} }));

  return true;
});
