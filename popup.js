const defaultAssetDefinitions = [
  { symbol: 'BTC', type: 'crypto' },
  { symbol: 'ADA', type: 'crypto' },
  { symbol: 'OKB', type: 'crypto' },
  { symbol: 'PAXG', type: 'crypto' },
  { symbol: 'BNB', type: 'crypto' },
  { symbol: 'AAPL', type: 'stock' },
  { symbol: 'GOOGL', type: 'stock' },
  { symbol: 'NVDA', type: 'stock' }
];
const customSymbolPattern = /^[A-Z0-9.^=-]{1,12}$/;
const exchangeRateSymbol = 'CNY=X';
const refreshIntervalMs = 5 * 60 * 1000;
const defaultUsdCnyRate = 7.2;
const defaultMilestoneAlerts = {
  500000: true,
  1000000: true
};
const defaultHoldings = {
  BTC: 0,
  ADA: 10000,
  OKB: 100,
  PAXG: 0,
  BNB: 0,
  AAPL: 0,
  GOOGL: 0,
  NVDA: 0
};

let prices = {};
let holdings = { ...defaultHoldings };
let assetDefinitions = [...defaultAssetDefinitions];
let cryptos = defaultAssetDefinitions.filter(asset => asset.type === 'crypto').map(asset => asset.symbol);
let stocks = defaultAssetDefinitions.filter(asset => asset.type === 'stock').map(asset => asset.symbol);
let assets = assetDefinitions.map(asset => asset.symbol);
let priceCurrency = 'USD';
let totalCurrency = 'CNY';
let usdCnyRate = defaultUsdCnyRate;
let milestoneAlerts = { ...defaultMilestoneAlerts };
let saveTimer;

const rows = document.getElementById('assetRows');
const holdingRows = document.getElementById('holdingRows');
const mainView = document.getElementById('mainView');
const settingsView = document.getElementById('settingsView');
const totalValue = document.getElementById('totalValue');
const milestoneNotice = document.getElementById('milestoneNotice');
const assetTypeSelect = document.getElementById('assetTypeSelect');
const assetSymbolInput = document.getElementById('assetSymbolInput');
const addAssetButton = document.getElementById('addAssetButton');
const assetMessage = document.getElementById('assetMessage');
const priceCurrencySelect = document.getElementById('priceCurrencySelect');
const totalCurrencySelect = document.getElementById('totalCurrencySelect');
const milestone500kToggle = document.getElementById('milestone500kToggle');
const milestone1mToggle = document.getElementById('milestone1mToggle');
const refreshButton = document.getElementById('refreshButton');
const settingsButton = document.getElementById('settingsButton');
const backButton = document.getElementById('backButton');

function setAssetDefinitions(definitions = defaultAssetDefinitions) {
  const seen = new Set();
  const normalizedDefinitions = [];

  if (Array.isArray(definitions)) {
    definitions.forEach(asset => {
      const symbol = String(asset?.symbol || '').trim().toUpperCase();
      const type = asset?.type === 'stock' ? 'stock' : 'crypto';
      if (!customSymbolPattern.test(symbol) || seen.has(symbol)) return;
      seen.add(symbol);
      normalizedDefinitions.push({ symbol, type });
    });
  }

  assetDefinitions = normalizedDefinitions;
  cryptos = assetDefinitions.filter(asset => asset.type === 'crypto').map(asset => asset.symbol);
  stocks = assetDefinitions.filter(asset => asset.type === 'stock').map(asset => asset.symbol);
  assets = assetDefinitions.map(asset => asset.symbol);
}

function formatCurrency(value, currency, locale) {
  if (value === null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
}

const formatUsd = value => formatCurrency(value, 'USD', 'en-US');
const formatCny = value => formatCurrency(value, 'CNY', 'zh-CN');

function createAssetRows() {
  const assetFragment = document.createDocumentFragment();
  const holdingFragment = document.createDocumentFragment();

  rows.replaceChildren();
  holdingRows.replaceChildren();

  assets.forEach(symbol => {
    const row = document.createElement('article');
    row.className = 'asset-row';

    row.innerHTML = `
      <strong class="symbol">${symbol}</strong>
      <span class="price" data-price="${symbol}">加载中</span>
    `;

    const holdingRow = document.createElement('div');
    holdingRow.className = 'holding-row';
    holdingRow.innerHTML = `
      <strong>${symbol}</strong>
      <input class="quantity-input" data-quantity="${symbol}" type="number" min="0" step="any" inputmode="decimal" aria-label="${symbol} 持有数量">
      <button class="plain-button remove-asset-button" type="button" data-remove-asset="${symbol}" aria-label="删除 ${symbol}">×</button>
    `;

    assetFragment.appendChild(row);
    holdingFragment.appendChild(holdingRow);
  });

  rows.appendChild(assetFragment);
  holdingRows.appendChild(holdingFragment);

  holdingRows.querySelectorAll('[data-quantity]').forEach(input => {
    const symbol = input.dataset.quantity;
    input.value = holdings[symbol];
    input.addEventListener('input', event => {
      holdings[symbol] = PortfolioCore.normalizeQuantity(event.target.value);
      updateValuations();
      scheduleSave();
    });
  });

  holdingRows.querySelectorAll('[data-remove-asset]').forEach(button => {
    button.addEventListener('click', () => removeAsset(button.dataset.removeAsset));
  });
}

function showAssetMessage(message, isError = false) {
  assetMessage.textContent = message;
  assetMessage.classList.toggle('error', isError);
}

function addCustomAsset() {
  const symbol = assetSymbolInput.value.trim().toUpperCase();
  const type = assetTypeSelect.value === 'stock' ? 'stock' : 'crypto';

  if (!customSymbolPattern.test(symbol)) {
    showAssetMessage('代码需为 1–12 位大写字母、数字或交易符号', true);
    return;
  }
  if (assets.includes(symbol)) {
    showAssetMessage(`${symbol} 已存在`, true);
    return;
  }

  setAssetDefinitions([...assetDefinitions, { symbol, type }]);
  holdings[symbol] = 0;
  assetSymbolInput.value = '';
  createAssetRows();
  updateValuations();
  scheduleSave();
  showAssetMessage(`${symbol} 已添加`);
  refreshPrices();
}

function removeAsset(symbol) {
  const asset = assetDefinitions.find(item => item.symbol === symbol);
  if (!asset) return;

  setAssetDefinitions(assetDefinitions.filter(item => item.symbol !== symbol));
  delete holdings[symbol];
  delete prices[symbol];
  createAssetRows();
  updateValuations();
  scheduleSave();
  showAssetMessage(`${symbol} 已移除`);
}

function showSettings(shouldShow) {
  document.documentElement.classList.toggle('settings-mode', shouldShow);
  mainView.hidden = shouldShow;
  settingsView.hidden = !shouldShow;
}

function updateValuations() {
  assets.forEach(symbol => {
    const priceElement = rows.querySelector(`[data-price="${symbol}"]`);
    const price = prices[symbol];
    const displayPrice = priceCurrency === 'CNY'
      ? PortfolioCore.convertUsdToCny(price, usdCnyRate)
      : price;

    priceElement.textContent = Number.isFinite(price)
      ? (priceCurrency === 'CNY' ? formatCny(displayPrice) : formatUsd(displayPrice))
      : '不可用';
    priceElement.classList.toggle('unavailable', !Number.isFinite(price));
  });

  const portfolioUsd = PortfolioCore.calculateTotal(prices, holdings);
  const portfolioCny = PortfolioCore.convertUsdToCny(portfolioUsd, usdCnyRate);
  const displayTotal = totalCurrency === 'CNY'
    ? PortfolioCore.convertUsdToCny(portfolioUsd, usdCnyRate)
    : portfolioUsd;
  totalValue.textContent = totalCurrency === 'CNY'
    ? formatCny(displayTotal)
    : formatUsd(displayTotal);

  const reachedMilestones = [500000, 1000000]
    .filter(threshold => Number.isFinite(portfolioCny) && portfolioCny >= threshold)
    .map(threshold => formatCny(threshold));
  milestoneNotice.hidden = reachedMilestones.length === 0;
  milestoneNotice.textContent = reachedMilestones.length
    ? `提醒：人民币合计已达 ${reachedMilestones.join('、')}`
    : '';

  if (Number.isFinite(portfolioCny)) {
    chrome.runtime.sendMessage({ type: 'CHECK_TOTAL_MILESTONES', totalCny: portfolioCny }, () => {
      void chrome.runtime.lastError;
    });
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    chrome.storage.local.set({ holdings, assetDefinitions, priceCurrency, totalCurrency, milestoneAlerts });
  }, 250);
}

function loadHoldings() {
  return new Promise(resolve => {
    chrome.storage.local.get({
      holdings: defaultHoldings,
      assetDefinitions: null,
      customAssets: [],
      priceCurrency: 'USD',
      totalCurrency: 'CNY',
      milestoneAlerts: defaultMilestoneAlerts
    }, result => {
      const savedDefinitions = Array.isArray(result.assetDefinitions)
        ? result.assetDefinitions
        : [...defaultAssetDefinitions, ...(Array.isArray(result.customAssets) ? result.customAssets : [])];
      setAssetDefinitions(savedDefinitions);
      const savedHoldings = result.holdings && typeof result.holdings === 'object' ? result.holdings : {};
      holdings = assets.reduce((resultHoldings, symbol) => {
        resultHoldings[symbol] = PortfolioCore.normalizeQuantity(
          savedHoldings[symbol] ?? defaultHoldings[symbol] ?? 0
        );
        return resultHoldings;
      }, {});
      priceCurrency = result.priceCurrency === 'CNY' ? 'CNY' : 'USD';
      totalCurrency = result.totalCurrency === 'USD' ? 'USD' : 'CNY';
      const savedMilestoneAlerts = result.milestoneAlerts && typeof result.milestoneAlerts === 'object'
        ? result.milestoneAlerts
        : defaultMilestoneAlerts;
      milestoneAlerts = {
        500000: savedMilestoneAlerts['500000'] !== false,
        1000000: savedMilestoneAlerts['1000000'] !== false
      };
      priceCurrencySelect.value = priceCurrency;
      totalCurrencySelect.value = totalCurrency;
      milestone500kToggle.checked = milestoneAlerts['500000'];
      milestone1mToggle.checked = milestoneAlerts['1000000'];
      resolve();
    });
  });
}

async function getCryptoPrices() {
  const response = await fetch('https://www.okx.com/api/v5/market/tickers?instType=SPOT');
  if (!response.ok) throw new Error(`OKX HTTP ${response.status}`);

  const payload = await response.json();
  if (!Array.isArray(payload.data)) throw new Error('OKX 返回格式异常');

  return payload.data.reduce((result, item) => {
    const symbol = item.instId?.endsWith('-USDT') ? item.instId.slice(0, -5) : '';
    const price = Number(item.last);
    if (cryptos.includes(symbol) && Number.isFinite(price)) result[symbol] = price;
    return result;
  }, {});
}

function getStockPrices() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'GET_STOCKS', symbols: [...stocks, exchangeRateSymbol] }, result => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!result) {
        reject(new Error('股票行情无响应'));
        return;
      }
      resolve({
        prices: result.prices || {},
        errors: result.errors || []
      });
    });
  });
}

async function refreshPrices() {
  refreshButton.disabled = true;

  const [cryptoResult, stockResult] = await Promise.allSettled([
    getCryptoPrices(),
    getStockPrices()
  ]);

  const stockPrices = stockResult.status === 'fulfilled' ? stockResult.value.prices : {};
  const receivedRate = Number(stockPrices[exchangeRateSymbol]);
  if (Number.isFinite(receivedRate) && receivedRate > 0) {
    usdCnyRate = receivedRate;
  }

  prices = {
    ...(cryptoResult.status === 'fulfilled' ? cryptoResult.value : {}),
    ...stockPrices
  };

  updateValuations();
  refreshButton.disabled = false;
}

async function initialize() {
  await loadHoldings();
  createAssetRows();
  await refreshPrices();
}

refreshButton.addEventListener('click', refreshPrices);
settingsButton.addEventListener('click', () => showSettings(true));
backButton.addEventListener('click', () => showSettings(false));
addAssetButton.addEventListener('click', addCustomAsset);
assetSymbolInput.addEventListener('keydown', event => {
  if (event.key === 'Enter') addCustomAsset();
});
priceCurrencySelect.addEventListener('change', event => {
  priceCurrency = event.target.value === 'CNY' ? 'CNY' : 'USD';
  updateValuations();
  scheduleSave();
});
totalCurrencySelect.addEventListener('change', event => {
  totalCurrency = event.target.value === 'USD' ? 'USD' : 'CNY';
  updateValuations();
  scheduleSave();
});
[milestone500kToggle, milestone1mToggle].forEach(toggle => {
  toggle.addEventListener('change', event => {
    milestoneAlerts[event.target.id === 'milestone500kToggle' ? '500000' : '1000000'] = event.target.checked;
    scheduleSave();
  });
});
initialize();
setInterval(refreshPrices, refreshIntervalMs);
