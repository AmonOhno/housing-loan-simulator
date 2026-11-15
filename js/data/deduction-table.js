// 住宅ローン控除の制度値（要件 9.2・9.3）。制度改正時はこのファイルと requirements.md 9 章だけを更新する。
// 令和 8 年度税制改正後の、2026 年（令和 8 年）1 月 1 日〜2030 年（令和 12 年）12 月 31 日入居の値。

export const CONFIRMED_AT = '2026-11-15';

export const SOURCES = [
  { id: 1, title: '国土交通省「住宅ローン減税」', url: 'https://www.mlit.go.jp/jutakukentiku/house/jutakukentiku_house_tk2_000017.html' },
  { id: 2, title: '国土交通省 報道発表「住宅ローン減税等の延長・拡充が閣議決定されました」', url: 'https://www.mlit.go.jp/report/press/house02_hh_000241.html' },
  { id: 3, title: '国土交通省「住宅ローン減税 Q&A」（居住開始が令和 8 年 1 月 1 日以降）', url: 'https://www.mlit.go.jp/jutakukentiku/house/content/002011976.pdf' },
  { id: 4, title: '財務省「令和 8 年度 税制改正の解説」租税特別措置法等（所得税関係）', url: 'https://www.mof.go.jp/tax_policy/tax_reform/outline/fy2026/explanation/PDF/p0210-0436.pdf' },
  { id: 5, title: '総務省「個人住民税の住宅ローン控除」', url: 'https://www.soumu.go.jp/main_sosiki/jichi_zeisei/czaisei/czaisei_seido/090929.html' },
  { id: 6, title: '財務省「住宅ローン控除の見直し（令和 8 年度改正）」概要資料', url: 'https://www.mof.go.jp/tax_policy/summary/income/063a8.pdf' },
];

/** 画面に表示する出典の番号 */
export const DISPLAY_SOURCE_IDS = [1, 3, 5];

/** 控除率の初期値（ミリ%）: 0.7% */
export const DEFAULT_RATE_MILLI = 700;

/** 住民税からの控除上限の初期値（万円）: 9.75 万円 = 97,500 円 */
export const DEFAULT_RESIDENT_CAP_MAN = 9.75;

/**
 * 取得の種類・性能区分・入居年から借入限度額（万円）と控除期間を引く表。
 * limitMan.general: 一般世帯、limitMan.childcare: 子育て世帯・若者夫婦世帯（上乗せ後）。
 * limitMan が 0 または years が 0 の行は「対象外」。
 */
export const RULES = [
  { houseKind: 'new', perf: 'certified', fromYear: 2026, toYear: 2030, limitMan: { general: 4500, childcare: 5000 }, years: 13, note: '', needsCheck: false },
  { houseKind: 'new', perf: 'zeh', fromYear: 2026, toYear: 2030, limitMan: { general: 3500, childcare: 4500 }, years: 13, note: '', needsCheck: false },
  { houseKind: 'new', perf: 'energy', fromYear: 2026, toYear: 2027, limitMan: { general: 2000, childcare: 3000 }, years: 13, note: '', needsCheck: false },
  {
    houseKind: 'new', perf: 'energy', fromYear: 2028, toYear: 2030, limitMan: { general: 2000, childcare: 2000 }, years: 10,
    note: '原則対象外。経過措置（2027 年 12 月 31 日までに建築確認、または 2028 年 6 月 30 日までに建築）に該当する場合の値です。要確認。',
    needsCheck: true,
  },
  {
    houseKind: 'new', perf: 'other', fromYear: 2026, toYear: 2030, limitMan: { general: 0, childcare: 0 }, years: 0,
    note: '新築は原則対象外です。例外に該当する場合は限度額・期間を手入力してください（例: 2,000 万円・10 年）。',
    needsCheck: false,
  },
  { houseKind: 'existing', perf: 'certified', fromYear: 2026, toYear: 2030, limitMan: { general: 3500, childcare: 4500 }, years: 13, note: '', needsCheck: false },
  { houseKind: 'existing', perf: 'zeh', fromYear: 2026, toYear: 2030, limitMan: { general: 3500, childcare: 4500 }, years: 13, note: '既存住宅の ZEH 水準の値は要確認です。', needsCheck: true },
  { houseKind: 'existing', perf: 'energy', fromYear: 2026, toYear: 2030, limitMan: { general: 2000, childcare: 3000 }, years: 13, note: '', needsCheck: false },
  { houseKind: 'existing', perf: 'other', fromYear: 2026, toYear: 2030, limitMan: { general: 2000, childcare: 2000 }, years: 10, note: '', needsCheck: false },
];

/** 床面積などの共通の注意（画面の注記用） */
export const COMMON_NOTES = [
  '子育て世帯・若者夫婦世帯の判定は入居した年の 12 月 31 日時点です。上乗せを使う場合は床面積 50㎡以上が必要です。',
  '借入額が住宅の取得対価を超える場合、超える部分は控除の対象外になることがあります（本ツールでは判定しません）。',
  '合計所得金額・床面積・省エネ性能の証明書類などの要件は判定していません。最新の制度は国土交通省・国税庁の情報で確認してください。',
];
