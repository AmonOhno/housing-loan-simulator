import { test } from 'node:test';
import assert from 'node:assert/strict';
import { levelPayment, equalPrincipalUnit } from '../js/calc/loan.js';

test('C1: 100万円・年1.2%・35年・元利均等 = 2,917円', () => {
  assert.equal(levelPayment(1_000_000, 1200, 420, 12), 2917);
});

test('C2/C3: 3,500万円・3,600万円（年0.8%・35年）', () => {
  assert.equal(levelPayment(35_000_000, 800, 420, 12), 95571);
  assert.equal(levelPayment(36_000_000, 800, 420, 12), 98301);
  assert.equal(98301 - 95571, 2730);
});

test('C6: ボーナス返済分500万円・年0.8%・35年（70回）= 82,036円', () => {
  assert.equal(levelPayment(5_000_000, 800, 70, 2), 82036);
});

test('C4: 金利0%でもゼロ除算しない', () => {
  assert.equal(levelPayment(1_000_000, 0, 420, 12), 2380);
  assert.equal(levelPayment(5_000_000, 0, 70, 2), 71428);
});

test('元本0は0円、回数不正は例外', () => {
  assert.equal(levelPayment(0, 800, 420, 12), 0);
  assert.throws(() => levelPayment(1_000_000, 800, 0, 12));
  assert.throws(() => equalPrincipalUnit(1_000_000, 0));
});

test('C5: 元金均等の毎月の元金は円未満切り捨て', () => {
  assert.equal(equalPrincipalUnit(35_000_000, 420), 83333);
  assert.equal(equalPrincipalUnit(1_000_000, 420), 2380);
});
