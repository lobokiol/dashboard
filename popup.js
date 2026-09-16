const defaultAssetDefinitions = [
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
const customSymbolPattern = /^[A-Z0-9.^=-]{1,12}$/;
const exchangeRateSymbol = 'CNY=X';
const refreshIntervalMs = 5 * 60 * 1000;
const defaultUsdCnyRate = 7.2;
const assetDefinitionsVersion = 1;
const shortcutPopupCloseKey = 'shortcutPopupCloseAt';
const defaultHoldings = {
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

let prices = {};
let holdings = { ...defaultHoldings };
let assetDefinitions = [...defaultAssetDefinitions];
let assets = assetDefinitions.map(asset => asset.symbol);
let priceCurrency = 'USD';
let totalCurrency = 'CNY';
let usdCnyRate = defaultUsdCnyRate;
let saveTimer;
let draggedSymbol = '';

const rows = document.getElementById('assetRows');
const holdingRows = document.getElementById('holdingRows');
const mainView = document.getElementById('mainView');
const settingsView = document.getElementById('settingsView');
const totalValue = document.getElementById('totalValue');
const milestoneDialog = document.getElementById('milestoneDialog');
const milestoneDialogMessage = document.getElementById('milestoneDialogMessage');
const milestoneDialogClose = document.getElementById('milestoneDialogClose');
const assetSymbolInput = document.getElementById('assetSymbolInput');
const addAssetButton = document.getElementById('addAssetButton');
const assetMessage = document.getElementById('assetMessage');
const priceCurrencySelect = document.getElementById('priceCurrencySelect');
const totalCurrencySelect = document.getElementById('totalCurrencySelect');
const shortcutSummary = document.getElementById('shortcutSummary');
const shortcutSettingsButton = document.getElementById('shortcutSettingsButton');
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
      const type = asset?.type === 'stock' ? 'stock' : asset?.type === 'auto' ? 'auto' : 'crypto';
      if (!customSymbolPattern.test(symbol) || seen.has(symbol)) return;
      seen.add(symbol);
      normalizedDefinitions.push({ symbol, type });
    });
  }

  assetDefinitions = normalizedDefinitions;
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

async function scheduleShortcutAutoClose() {
  const stored = await chrome.storage.session.get(shortcutPopupCloseKey);
  const closeAt = Number(stored[shortcutPopupCloseKey]);
  await chrome.storage.session.remove(shortcutPopupCloseKey);
  if (!Number.isFinite(closeAt) || closeAt <= Date.now()) return;

  setTimeout(() => window.close(), closeAt - Date.now());
}

async function updateShortcutSummary() {
  const commands = await chrome.commands.getAll();
  const shortcuts = commands
    .filter(command => ['open-dashboard', 'open-dashboard-global'].includes(command.name))
    .map(command => command.shortcut)
    .filter(Boolean);
  shortcutSummary.textContent = shortcuts.length ? shortcuts.join(' / ') : '未设置';
}

const formatUsd = value => formatCurrency(value, 'USD', 'en-US');
const formatCny = value => formatCurrency(value, 'CNY', 'zh-CN');

function clearDragOverStyles() {
  rows.querySelectorAll('.drag-over').forEach(row => row.classList.remove('drag-over'));
}

function clearDragStyles() {
  clearDragOverStyles();
  rows.querySelectorAll('.dragging').forEach(row => row.classList.remove('dragging'));
}

function focusDragHandle(symbol) {
  const handle = [...rows.querySelectorAll('[data-drag-asset]')]
    .find(element => element.dataset.dragAsset === symbol);
  handle?.focus();
}

function moveAssetToIndex(symbol, targetIndex, shouldFocus = false) {
  const result = PortfolioCore.moveAssetDefinition(assetDefinitions, symbol, targetIndex);
  if (!result.changed) return;

  setAssetDefinitions(result.definitions);
  createAssetRows();
  updateValuations();
  scheduleSave();
  if (shouldFocus) requestAnimationFrame(() => focusDragHandle(symbol));
}

function bindAssetReorder() {
  rows.querySelectorAll('.asset-row').forEach(assetRow => {
    const symbol = assetRow.dataset.assetSymbol;
    const handle = assetRow.querySelector('[data-drag-asset]');

    handle.addEventListener('dragstart', event => {
      draggedSymbol = symbol;
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', symbol);
      }
      assetRow.classList.add('dragging');
    });

    handle.addEventListener('dragend', () => {
      draggedSymbol = '';
      clearDragStyles();
    });

    handle.addEventListener('keydown', event => {
      if (!event.altKey || !['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const currentIndex = assetDefinitions.findIndex(asset => asset.symbol === symbol);
      const offset = ['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 1;
      moveAssetToIndex(symbol, currentIndex + offset, true);
    });

    assetRow.addEventListener('dragover', event => {
      if (!draggedSymbol || draggedSymbol === symbol) return;
      event.preventDefault();
      clearDragOverStyles();
      assetRow.classList.add('drag-over');
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    });

    assetRow.addEventListener('dragleave', () => {
      assetRow.classList.remove('drag-over');
    });

    assetRow.addEventListener('drop', event => {
      event.preventDefault();
      const sourceSymbol = draggedSymbol || event.dataTransfer?.getData('text/plain');
      const targetIndex = assetDefinitions.findIndex(asset => asset.symbol === symbol);
      draggedSymbol = '';
      clearDragStyles();
      moveAssetToIndex(sourceSymbol, targetIndex);
    });
  });
}

function createAssetRows() {
  const assetFragment = document.createDocumentFragment();
  const holdingFragment = document.createDocumentFragment();

  rows.replaceChildren();
  holdingRows.replaceChildren();

  assets.forEach(symbol => {
    const row = document.createElement('article');
    row.className = 'asset-row';
    row.dataset.assetSymbol = symbol;

    row.innerHTML = `
      <strong class="symbol drag-handle" draggable="true" tabindex="0" role="button" data-drag-asset="${symbol}" aria-label="拖动 ${symbol} 排序，或按 Alt 加方向键调整" title="拖动排序">${symbol}</strong>
      <span class="price" data-price="${symbol}">加载中</span>
    `;

    const holdingRow = document.createElement('div');
    holdingRow.className = 'holding-row';
    holdingRow.dataset.assetSymbol = symbol;
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

  bindAssetReorder();
}

function showAssetMessage(message, isError = false) {
  assetMessage.textContent = message;
  assetMessage.classList.toggle('error', isError);
}

function showMilestoneDialog(thresholds, totalCny) {
  const milestoneText = thresholds.map(formatCny).join('、');
  milestoneDialogMessage.textContent = `人民币合计已突破 ${milestoneText}，当前约 ${formatCny(totalCny)}`;
  milestoneDialog.hidden = false;
  milestoneDialogClose.focus();
}

function addCustomAsset() {
  const symbol = assetSymbolInput.value.trim().toUpperCase();

  if (!customSymbolPattern.test(symbol)) {
    showAssetMessage('代码需为 1–12 位大写字母、数字或交易符号', true);
    return;
  }
  if (assets.includes(symbol)) {
    showAssetMessage(`${symbol} 已存在`, true);
    return;
  }

  setAssetDefinitions([...assetDefinitions, { symbol, type: 'auto' }]);
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
  showAssetMessage('');
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

  if (Number.isFinite(portfolioCny)) {
    chrome.runtime.sendMessage({ type: 'CHECK_TOTAL_MILESTONES', totalCny: portfolioCny }, response => {
      void chrome.runtime.lastError;
      if (response?.ok && response.crossings?.length) {
        showMilestoneDialog(response.crossings, portfolioCny);
      }
    });
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    chrome.storage.local.set({ holdings, assetDefinitions, priceCurrency, totalCurrency, usdCnyRate });
  }, 250);
}

function loadHoldings() {
  return new Promise(resolve => {
    chrome.storage.local.get({
      holdings: defaultHoldings,
      assetDefinitions: null,
      assetDefinitionsVersion: 0,
      customAssets: [],
      priceCurrency: 'USD',
      totalCurrency: 'CNY',
      usdCnyRate: defaultUsdCnyRate
    }, result => {
      let savedDefinitions = Array.isArray(result.assetDefinitions)
        ? result.assetDefinitions
        : [...defaultAssetDefinitions, ...(Array.isArray(result.customAssets) ? result.customAssets : [])];
      if (result.assetDefinitionsVersion < assetDefinitionsVersion) {
        if (!savedDefinitions.some(asset => asset?.symbol === 'BGB')) {
          savedDefinitions = [...savedDefinitions, { symbol: 'BGB', type: 'crypto' }];
        }
        chrome.storage.local.set({ assetDefinitions: savedDefinitions, assetDefinitionsVersion });
      }
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
      usdCnyRate = PortfolioCore.resolveUsdCnyRate(undefined, result.usdCnyRate, defaultUsdCnyRate);
      priceCurrencySelect.value = priceCurrency;
      totalCurrencySelect.value = totalCurrency;
      resolve();
    });
  });
}

function getMarketPrices() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'GET_MARKET_PRICES', assets: assetDefinitions }, result => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      if (!result) {
        reject(new Error('行情无响应'));
        return;
      }
      resolve(result);
    });
  });
}

async function refreshPrices() {
  refreshButton.disabled = true;

  const marketResult = await getMarketPrices().catch(() => ({ prices: {} }));
  const receivedRate = Number(marketResult.prices?.[exchangeRateSymbol]);
  usdCnyRate = PortfolioCore.resolveUsdCnyRate(receivedRate, usdCnyRate, defaultUsdCnyRate);
  const storageUpdates = {};
  if (Number.isFinite(receivedRate) && receivedRate > 0) storageUpdates.usdCnyRate = receivedRate;

  const resolvedAssets = PortfolioCore.applyResolvedAssetTypes(assetDefinitions, marketResult.resolvedTypes);
  if (resolvedAssets.changed) {
    setAssetDefinitions(resolvedAssets.definitions);
    storageUpdates.assetDefinitions = assetDefinitions;
  }
  if (Object.keys(storageUpdates).length) chrome.storage.local.set(storageUpdates);

  prices = marketResult.prices || {};

  updateValuations();
  refreshButton.disabled = false;
}

async function initialize() {
  await loadHoldings();
  createAssetRows();
  await updateShortcutSummary();
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
milestoneDialogClose.addEventListener('click', () => {
  milestoneDialog.hidden = true;
});
shortcutSettingsButton.addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});
scheduleShortcutAutoClose();
initialize();
setInterval(refreshPrices, refreshIntervalMs);
