// 公開ページの初期値（要件 4 章・10.4）。個人情報を含まない一般的な例のみ。
// 金額は万円、金利は %。

export const MAX_CASES = 3;
export const MAX_PREPAYMENTS = 3;

export const DEFAULT_COMMON = {
  price: 3800,
  expenses: 150,
  deposit: 100,
  income: 600,
  startYm: '2027-02',
};

export const DEFAULT_DEDUCTION = {
  enabled: true,
  moveInYear: 2027,
  houseKind: 'new',
  perf: 'zeh',
  childcare: true,
  limitOverride: null,
  rateOverride: null,
  yearsOverride: null,
  incomeTax: null,
  residentCap: 9.75,
};

/** 繰上返済 1 件の初期値（「繰上返済を追加」したとき） */
export const DEFAULT_PREPAY = { afterYears: 10, afterMonths: 0, amount: 100, type: 'shorten' };

/** ケース追加時のひな形（要件 4.2） */
export const DEFAULT_CASE = {
  label: '',
  loan: 3500,
  ownFundsMode: 'auto',
  ownFunds: null,
  rate: 1.0,
  years: 35,
  method: 'equalPayment',
  bonusPrincipal: 0,
  guaranteeType: 'inRate',
  guaranteeRateAdd: 0.2,
  rateIncludesGuarantee: false,
  guaranteeLumpMode: 'auto',
  guaranteeLump: null,
  prepayments: [],
};

/** 画面の初期ケース（A・B）。繰上返済は初期なし（実装計画 I13） */
export const DEFAULT_CASES = [
  { ...DEFAULT_CASE, label: 'A：手付金を頭金に', loan: 3500, prepayments: [] },
  { ...DEFAULT_CASE, label: 'B：手付金分も借りる', loan: 3600, prepayments: [] },
];
