(function exposePortfolioCore(root, factory) {
  const core = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = core;
  } else {
    root.PortfolioCore = core;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function createPortfolioCore() {
  function normalizeQuantity(value) {
    const quantity = Number(value);
    return Number.isFinite(quantity) && quantity >= 0 ? quantity : 0;
  }

  function calculateValue(price, quantity) {
    const numericPrice = Number(price);
    if (!Number.isFinite(numericPrice) || numericPrice < 0) return null;
    return numericPrice * normalizeQuantity(quantity);
  }

  function calculateTotal(prices, holdings) {
    return Object.keys(holdings).reduce((total, symbol) => {
      const value = calculateValue(prices[symbol], holdings[symbol]);
      return total + (value ?? 0);
    }, 0);
  }

  function convertUsdToCny(value, rate) {
    if (value === null || value === undefined) return null;
    const numericValue = Number(value);
    const numericRate = Number(rate);
    if (!Number.isFinite(numericValue) || !Number.isFinite(numericRate) || numericRate <= 0) return null;
    return numericValue * numericRate;
  }

  return { normalizeQuantity, calculateValue, calculateTotal, convertUsdToCny };
});
