const test = require('node:test');
const assert = require('node:assert/strict');
const PortfolioCore = require('../portfolio.js');

test('normalizes invalid and negative quantities to zero', () => {
  assert.equal(PortfolioCore.normalizeQuantity(-10), 0);
  assert.equal(PortfolioCore.normalizeQuantity('abc'), 0);
  assert.equal(PortfolioCore.normalizeQuantity('10000'), 10000);
});

test('calculates a single asset value', () => {
  assert.equal(PortfolioCore.calculateValue(0.75, 10000), 7500);
  assert.equal(PortfolioCore.calculateValue(50, 100), 5000);
  assert.equal(PortfolioCore.calculateValue(undefined, 100), null);
});

test('calculates total value and ignores unavailable prices', () => {
  const prices = { ADA: 0.75, OKB: 50 };
  const holdings = { ADA: 10000, OKB: 100, BTC: 2 };
  assert.equal(PortfolioCore.calculateTotal(prices, holdings), 12500);
});

test('converts portfolio value from USD to CNY', () => {
  assert.equal(PortfolioCore.convertUsdToCny(12500, 7.2), 90000);
  assert.equal(PortfolioCore.convertUsdToCny(12500, 0), null);
});
