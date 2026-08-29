const STOCK_SYMBOL_PATTERN = /^[A-Z0-9.^=-]{1,12}$/;

async function fetchStockPrice(symbol) {
  if (!STOCK_SYMBOL_PATTERN.test(symbol)) throw new Error(`Invalid symbol: ${symbol}`);

  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`);
  if (!response.ok) throw new Error(`Yahoo HTTP ${response.status}`);

  const data = await response.json();
  const price = Number(data?.chart?.result?.[0]?.meta?.regularMarketPrice);
  if (!Number.isFinite(price)) throw new Error(`Missing price: ${symbol}`);
  return price;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
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
