import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFunding } from '../js/calc/funding.js';

const common = { priceYen: 38_000_000, expensesYen: 1_500_000, depositYen: 1_000_000, guaranteeLumpYen: 0 };

test('F1: 初期値（自動）で左右一致、自己資金450万円（手付金100＋決済時350）', () => {
  const f = computeFunding({ ...common, loanYen: 35_000_000, ownFundsMode: 'auto', ownFundsYen: null });
  assert.equal(f.required, 39_500_000);
  assert.equal(f.raised, 39_500_000);
  assert.equal(f.ownFunds, 4_500_000);
  assert.equal(f.cashAtSettlement, 3_500_000);
  assert.equal(f.depositReturned, 0);
  assert.equal(f.status, 'match');
  assert.equal(f.diff, 0);
});

test('F2: 自己資金を手入力で400万円 → 50万円不足', () => {
  const f = computeFunding({ ...common, loanYen: 35_000_000, ownFundsMode: 'manual', ownFundsYen: 4_000_000 });
  assert.equal(f.diff, -500_000);
  assert.equal(f.status, 'short');
  assert.equal(f.fillOwnFunds, 4_500_000);
});

test('手入力で超過', () => {
  const f = computeFunding({ ...common, loanYen: 35_000_000, ownFundsMode: 'manual', ownFundsYen: 5_000_000 });
  assert.equal(f.diff, 500_000);
  assert.equal(f.status, 'over');
});

test('F3: 借入額が必要資金−手付金を超えると決済時必要現金が負になり手付金が戻る', () => {
  const f = computeFunding({ ...common, loanYen: 39_000_000, ownFundsMode: 'auto', ownFundsYen: null });
  assert.equal(f.ownFunds, 500_000);
  assert.equal(f.cashAtSettlement, -500_000);
  assert.equal(f.depositReturned, 500_000);
  assert.equal(f.status, 'match');
  assert.ok(!f.warnings.includes('loanExceedsRequired'));
});

test('借入額が必要資金を超えると警告（自己資金がマイナス）', () => {
  const f = computeFunding({ ...common, loanYen: 40_000_000, ownFundsMode: 'auto', ownFundsYen: null });
  assert.ok(f.ownFunds < 0);
  assert.ok(f.warnings.includes('loanExceedsRequired'));
});

test('C10: 一括保証料が諸経費合計・必要資金に加わる', () => {
  const f = computeFunding({ ...common, guaranteeLumpYen: 721_000, loanYen: 35_000_000, ownFundsMode: 'auto', ownFundsYen: null });
  assert.equal(f.expensesTotal, 2_221_000);
  assert.equal(f.required, 40_221_000);
  assert.equal(f.ownFunds, 5_221_000);
  assert.equal(f.status, 'match');
});

test('借入額が10万円単位でないと警告コード', () => {
  const f = computeFunding({ ...common, loanYen: 35_050_000, ownFundsMode: 'auto', ownFundsYen: null });
  assert.ok(f.warnings.includes('notTenThousandUnit'));
});
