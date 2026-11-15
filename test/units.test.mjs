import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  manToYen, yenToMan, percentToMilli, milliToPercent, floorYen, floorTo,
  parseYm, ymToIndex, indexToYm, addMonths, monthlyInterest, halfYearInterest,
} from '../js/calc/units.js';

test('万円→円は円未満四捨五入', () => {
  assert.equal(manToYen(3500), 35000000);
  assert.equal(manToYen(3500.5), 35005000);
  assert.equal(manToYen(0.00005), 1);
  assert.equal(manToYen(0), 0);
  assert.equal(yenToMan(35000000), 3500);
});

test('%→ミリ%は整数に丸める', () => {
  assert.equal(percentToMilli(0.8), 800);
  assert.equal(percentToMilli(1.2), 1200);
  assert.equal(percentToMilli(0.123), 123);
  assert.equal(percentToMilli(0.7), 700);
  assert.equal(milliToPercent(1200), 1.2);
});

test('floorYen は浮動小数の誤差を吸収して切り捨てる', () => {
  assert.equal(floorYen(2916.9999999999), 2917);
  assert.equal(floorYen(2917.02), 2917);
  assert.equal(floorTo(86419, 100), 86400);
});

test('年月の変換と加算', () => {
  assert.deepEqual(parseYm('2027-02'), { year: 2027, month: 2 });
  assert.throws(() => parseYm('2027-13'));
  assert.throws(() => parseYm('abc'));
  assert.equal(indexToYm(ymToIndex('2027-02')), '2027-02');
  assert.equal(addMonths('2027-11', 3), '2028-02');
  assert.equal(addMonths('2027-12', 1), '2028-01');
  assert.equal(addMonths('2027-02', 0), '2027-02');
  assert.equal(addMonths('2027-02', 420), '2062-02');
});

test('利息は円未満切り捨て', () => {
  assert.equal(monthlyInterest(35_000_000, 800), 23333);
  assert.equal(monthlyInterest(1_200_000, 1000), 1000);
  assert.equal(monthlyInterest(0, 1200), 0);
  assert.equal(halfYearInterest(5_000_000, 800), 20000);
  assert.equal(halfYearInterest(1_000_001, 800), 4000);
});
