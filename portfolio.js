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

  function getMilestoneCrossings(previousState, totalCny, thresholds) {
    const state = previousState && typeof previousState === 'object' ? previousState : {};
    const numericTotal = Number(totalCny);
    const nextState = {};
    const crossings = [];

    thresholds.forEach(threshold => {
      const numericThreshold = Number(threshold);
      if (!Number.isFinite(numericThreshold) || numericThreshold <= 0) return;

      const key = String(numericThreshold);
      const isAbove = Number.isFinite(numericTotal) && numericTotal >= numericThreshold;
      if (state[key] === false && isAbove) crossings.push(numericThreshold);
      nextState[key] = isAbove;
    });

    return { crossings, state: nextState };
  }

  return {
    normalizeQuantity,
    calculateValue,
    calculateTotal,
    convertUsdToCny,
    getMilestoneCrossings
  };
});
