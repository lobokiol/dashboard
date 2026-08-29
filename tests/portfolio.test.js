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

test('detects total milestone crossings without repeating above a threshold', () => {
  const thresholds = [500000, 1000000];
  const firstReading = PortfolioCore.getMilestoneCrossings({}, 600000, thresholds);
  assert.deepEqual(firstReading.crossings, []);
  assert.deepEqual(firstReading.state, { '500000': true, '1000000': false });

  const crossed = PortfolioCore.getMilestoneCrossings(firstReading.state, 1000000, thresholds);
  assert.deepEqual(crossed.crossings, [1000000]);

  const repeated = PortfolioCore.getMilestoneCrossings(crossed.state, 1100000, thresholds);
  assert.deepEqual(repeated.crossings, []);

  const reset = PortfolioCore.getMilestoneCrossings(repeated.state, 400000, thresholds);
  const recrossed = PortfolioCore.getMilestoneCrossings(reset.state, 550000, thresholds);
  assert.deepEqual(recrossed.crossings, [500000]);
});
