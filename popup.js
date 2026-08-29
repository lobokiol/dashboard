const cryptos = ['BTC', 'ADA', 'OKB', 'PAXG', 'BNB'];
const stocks = ['AAPL', 'GOOGL', 'NVDA'];
const exchangeRateSymbol = 'CNY=X';
const assets = [...cryptos, ...stocks];
const refreshIntervalMs = 5 * 60 * 1000;
const defaultUsdCnyRate = 7.2;
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
let priceCurrency = 'USD';
let totalCurrency = 'CNY';
let usdCnyRate = defaultUsdCnyRate;
let hasLiveExchangeRate = false;
let saveTimer;

const rows = document.getElementById('assetRows');
const holdingRows = document.getElementById('holdingRows');
const mainView = document.getElementById('mainView');
const settingsView = document.getElementById('settingsView');
const totalValue = document.getElementById('totalValue');
const priceCurrencySelect = document.getElementById('priceCurrencySelect');
const totalCurrencySelect = document.getElementById('totalCurrencySelect');
const exchangeRate = document.getElementById('exchangeRate');
const statusText = document.getElementById('statusText');
const updatedAt = document.getElementById('updatedAt');
const refreshButton = document.getElementById('refreshButton');
const settingsButton = document.getElementById('settingsButton');
const backButton = document.getElementById('backButton');

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

  assets.forEach(symbol => {
    const row = document.createElement('article');
    row.className = 'asset-row';

    row.innerHTML = `
      <strong class="symbol">${symbol}</strong>
      <span class="price" data-price="${symbol}">加载中</span>
    `;

    const holdingRow = document.createElement('label');
    holdingRow.className = 'holding-row';
    holdingRow.innerHTML = `
      <strong>${symbol}</strong>
      <input class="quantity-input" data-quantity="${symbol}" type="number" min="0" step="any" inputmode="decimal" aria-label="${symbol} 持有数量">
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
  const displayTotal = totalCurrency === 'CNY'
    ? PortfolioCore.convertUsdToCny(portfolioUsd, usdCnyRate)
    : portfolioUsd;
  totalValue.textContent = totalCurrency === 'CNY'
    ? formatCny(displayTotal)
    : formatUsd(displayTotal);
  exchangeRate.textContent = `USD/CNY ${usdCnyRate.toFixed(4)}${hasLiveExchangeRate ? '' : ' · 默认'}`;
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    chrome.storage.local.set({ holdings, priceCurrency, totalCurrency });
    statusText.textContent = '设置已保存';
  }, 250);
}

function loadHoldings() {
  return new Promise(resolve => {
    chrome.storage.local.get({ holdings: defaultHoldings, priceCurrency: 'USD', totalCurrency: 'CNY' }, result => {
      holdings = { ...defaultHoldings, ...result.holdings };
      priceCurrency = result.priceCurrency === 'CNY' ? 'CNY' : 'USD';
      totalCurrency = result.totalCurrency === 'USD' ? 'USD' : 'CNY';
      priceCurrencySelect.value = priceCurrency;
      totalCurrencySelect.value = totalCurrency;
      assets.forEach(symbol => {
        holdings[symbol] = PortfolioCore.normalizeQuantity(holdings[symbol]);
      });
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
  statusText.textContent = '正在获取行情…';

  const [cryptoResult, stockResult] = await Promise.allSettled([
    getCryptoPrices(),
    getStockPrices()
  ]);

  const stockPrices = stockResult.status === 'fulfilled' ? stockResult.value.prices : {};
  const receivedRate = Number(stockPrices[exchangeRateSymbol]);
  if (Number.isFinite(receivedRate) && receivedRate > 0) {
    usdCnyRate = receivedRate;
    hasLiveExchangeRate = true;
  }

  prices = {
    ...(cryptoResult.status === 'fulfilled' ? cryptoResult.value : {}),
    ...stockPrices
  };

  updateValuations();

  const failedSources = [];
  if (cryptoResult.status === 'rejected') failedSources.push('OKX');
  if (
    stockResult.status === 'rejected' ||
    (stockResult.status === 'fulfilled' && stockResult.value.errors.length)
  ) failedSources.push('Yahoo Finance 部分');

  statusText.textContent = failedSources.length
    ? `${failedSources.join('、')} 行情获取失败`
    : '全部行情已更新';
  const time = new Date().toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  });
  updatedAt.textContent = `${time} · 5 分钟刷新`;
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
initialize();
setInterval(refreshPrices, refreshIntervalMs);
