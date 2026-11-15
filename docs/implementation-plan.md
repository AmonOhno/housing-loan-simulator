# 住宅ローン概算シミュレータ 実装計画書

- 文書の版: 1.0（2026-11-15 作成）
- 前提文書: `docs/requirements.md`（機能要件定義書。以下「要件」。章番号は要件の章を指す）
- 読者: 実装担当（会話履歴なし）。本書と要件だけで実装できることを目標にする。本書と要件が食い違う場合は**要件を優先**し、食い違いを README の「設計メモ」に記録する。
- 本書の金額・パスワードはすべて一般例またはダミー値。

---

## 0. 実装者が必ず守ること

1. **オーナーの実データを扱わない。** 物件名・実際の金額・パスワードは知らされていないし、推測して書かない。テスト・サンプル・README の例は要件にある一般例（物件価格 3,800 万円、諸経費 150 万円、手付金 100 万円、借入 3,500 万円／3,600 万円、年収 600 万円、金利 1.0% など）かダミー値だけを使う。
2. **`git commit` / `git push` はしない**（メインセッションが行う）。`git init` もしない。
3. **npm パッケージを使わない。** `package.json` は `"type": "module"` とテストスクリプトのためだけに置き、`dependencies` / `devDependencies` は書かない。外部 CDN・外部フォント・解析タグは使わない。
4. ビルド不要。HTML / CSS / バニラ JavaScript（ES モジュール）。参照はすべて相対パス（`./js/main.js` など。先頭 `/` で始めない）。
5. UI 文言・コードコメント・README は日本語。
6. `innerHTML` に利用者入力・復号結果を入れない（`textContent` と `createElement` を使う）。インラインスクリプト・インラインイベントハンドラ（`onclick=` 等）は使わない。
7. `data/presets.enc.json` は**空コンテナ**（`entries: []`）で作る。実データの暗号文はオーナーが後で追加する。
8. パスワードや平文の設定値をファイル・ログ・`console.*`・エラーメッセージに出さない。

---

## 1. ディレクトリ構成と責務

```
housing-loan-simulator/
├── index.html                    画面の骨格（静的マークアップ）、CSP meta、main.js の読み込み
├── .nojekyll                     空ファイル
├── package.json                  {"type":"module","private":true,"scripts":{"test":"node --test \"test/*.test.mjs\""}}
├── README.md                     使い方・マイ設定の手順・セキュリティ上の注意・Pages 設定・開発手順
├── css/
│   └── style.css                 全スタイル（CSS 変数でライト／ダーク、レスポンシブ、印刷）
├── data/
│   └── presets.enc.json          暗号化コンテナ（初期は entries: []）
├── js/
│   ├── main.js                   起動処理。状態の初期化、各 UI モジュールの結線、再計算ループ
│   ├── chart.js                  残高推移グラフ（SVG 自前描画、ツールチップ、補助線）
│   ├── calc/                     ★純粋関数のみ（DOM・window・localStorage 参照禁止）
│   │   ├── units.js              単位変換（万円→円、%→ミリ%）、年月演算、端数処理ヘルパー
│   │   ├── loan.js               返済額の公式（元利均等の M・B、元金均等の元金）
│   │   ├── guarantee.js          保証料方式 → 計算金利・一括保証料（目安表の補間）
│   │   ├── prepay.js             繰上返済の正規化（回数換算・並べ替え）、残高按分、効果の算出
│   │   ├── schedule.js           月次返済予定の生成（ボーナス・繰上返済込み）、暦年集計
│   │   ├── funding.js            資金計画（必要資金・調達資金・差額・決済時必要現金）
│   │   ├── tax-credit.js         住宅ローン控除の初期値解決と年別控除額
│   │   └── scenario.js           1 ケースの全計算（computeCase）、比較表（compareCases）
│   ├── data/                     ★制度値・目安値・初期値（ここだけ更新すれば済む構造）
│   │   ├── deduction-table.js    要件 9.3 の対応表、出典 URL、確認日
│   │   ├── guarantee-table.js    要件 6.5 の一括保証料目安表、上乗せ幅初期値
│   │   └── defaults.js           公開ページの初期値（一般例）、ケース初期値、上限件数
│   ├── model/                    ★純粋関数のみ
│   │   ├── validate.js           入力文字列の正規化・数値化・範囲チェック（4 章）
│   │   └── preset-schema.js      平文スキーマ（要件 10.4）の正規化・生成・検証
│   ├── crypto/                   ★ブラウザ・Node 共通（globalThis.crypto のみ使用）
│   │   ├── presets-crypto.js     鍵導出・暗号化・復号・base64・エントリ検証
│   │   └── container.js          コンテナ（要件 10.3）の生成・解析・マージ・重複排除
│   └── ui/
│       ├── dom.js                要素生成ヘルパー（el(tag, attrs, children)、textContent のみ）
│       ├── format.js             表示用整形（円 3 桁区切り、約○万円、%、年月、差額の文言）
│       ├── fields.js             入力項目の定義表（ID・ラベル・単位・inputmode・説明文）
│       ├── state.js              アプリ状態（生の入力文字列・検証結果・最終有効結果）と購読
│       ├── form.js               共通入力・控除入力・ケースタブ・ケース入力・繰上返済行の描画とイベント
│       ├── results.js            結果サマリー、繰上返済の効果
│       ├── funding-view.js       資金計画チェック（申込書の記入イメージ）
│       ├── compare.js            シナリオ比較表
│       ├── tax-credit-view.js    控除の結果・注記・出典表示
│       ├── schedule-table.js     年次返済予定表（折りたたみ）
│       ├── presets-storage.js    同梱 JSON の取得、localStorage の読み書き
│       └── presets-view.js       マイ設定ダイアログ（解錠・一覧・反映・新規・編集・エクスポート）
├── scripts/
│   └── encrypt-preset.mjs        オーナー用 CLI（暗号化・マージ・確認）
├── test/
│   ├── units.test.mjs
│   ├── loan.test.mjs
│   ├── schedule.test.mjs
│   ├── prepay.test.mjs
│   ├── guarantee.test.mjs
│   ├── funding.test.mjs
│   ├── tax-credit.test.mjs
│   ├── scenario.test.mjs
│   ├── validate.test.mjs
│   ├── preset-schema.test.mjs
│   ├── crypto.test.mjs
│   ├── container.test.mjs
│   └── encrypt-script.test.mjs
├── docs/
│   ├── requirements.md
│   └── implementation-plan.md    本書
└── .github/workflows/pages.yml
```

補足（判断の記録）:

- 要件 9.3 は対応表を「例: `js/deduction-table.js`」としているが、データ類をまとめるため `js/data/deduction-table.js` に置く。
- 計算ロジックの単位変換・検証は UI から分離し、Node でテストできるようにする（`js/calc/`・`js/model/`・`js/crypto/`・`js/data/` は DOM を一切参照しない）。
- Node で `js/**/*.js` を ES モジュールとして読むため `package.json` に `"type": "module"` を置く（依存パッケージは置かない）。

---

## 2. 共通の型と単位の約束

### 2.1 内部単位

| 種類 | 内部表現 | 例 |
|---|---|---|
| 金額 | **円の整数**（`number`、`Number.isSafeInteger` を満たす） | 3,500 万円 → `35000000` |
| 金利 | **ミリ%（年率%×1000 の整数）** `rateMilli` | 1.2% → `1200`、0.8% → `800`、0.7% → `700` |
| 期間 | 年（整数）・回数（整数） | 35 年 → `n = 420` |
| 年月 | `"YYYY-MM"` 文字列、または通し月 `ymIndex = 年×12 + (月−1)` | `"2027-02"` |

- 金利を整数にする理由: 利息計算 `floor(残高 × 金利)` を**整数演算だけで**行い、浮動小数の誤差で 1 円ずれるのを防ぐ。
  - 月利息 = `Math.floor(balance * rateMilli / 1_200_000)`
  - 半年利息（ボーナス分） = `Math.floor(balance * rateMilli / 200_000)`
  - 控除可能額 = `Math.floor(target * rateMilli / 100_000 / 100) * 100`（下記 9 章。先に `Math.floor(target * rateMilli / 100_000)` を求め、それを 100 円未満切り捨て）
  - 最大でも `1e10 円 × 17000` ≒ `1.7e14` で `2^53` 未満なので安全。
- 返済額の公式（べき乗を含む）だけは浮動小数で計算し、`Math.floor(x + 1e-7)` で切り捨てる（`2916.9999999` のような誤差対策）。

### 2.2 JSDoc で使う型（実装時は JSDoc コメントで記述）

```ts
type Yen = number;         // 円・整数
type RateMilli = number;   // 年率% × 1000・整数
type Ym = string;          // "YYYY-MM"
type Method = 'equalPayment' | 'equalPrincipal';
type GuaranteeType = 'inRate' | 'lump' | 'none';
type PrepayType = 'shorten' | 'reduce';
type HouseKind = 'new' | 'existing';
type Perf = 'certified' | 'zeh' | 'energy' | 'other';
```

---

## 3. 計算モジュール（`js/calc/`）

すべて純粋関数。引数を変更しない（返り値は新しいオブジェクト）。例外は「プログラムの誤用」（型違い等）のときだけ投げ、利用者入力の不正は `js/model/validate.js` で先に弾く。

### 3.1 `js/calc/units.js`

| 関数 | シグネチャ | 説明 |
|---|---|---|
| `manToYen` | `(man: number) => Yen` | `Math.round(man * 10000)`。3500.5 → 35005000 |
| `yenToMan` | `(yen: Yen) => number` | `yen / 10000`（表示用。丸めない） |
| `percentToMilli` | `(pct: number) => RateMilli` | `Math.round(pct * 1000)` |
| `milliToPercent` | `(m: RateMilli) => number` | `m / 1000` |
| `floorYen` | `(x: number) => Yen` | `Math.floor(x + 1e-7)`（公式の結果用） |
| `floorTo` | `(yen: Yen, unit: number) => Yen` | `Math.floor(yen / unit) * unit`（控除の 100 円未満切り捨て） |
| `parseYm` | `(ym: Ym) => {year, month}` | 不正なら例外 |
| `ymToIndex` / `indexToYm` | `(ym) => number` / `(idx) => Ym` | 通し月との相互変換 |
| `addMonths` | `(ym: Ym, k: number) => Ym` | k か月後の年月 |
| `monthlyInterest` | `(bal: Yen, r: RateMilli) => Yen` | `Math.floor(bal * r / 1_200_000)` |
| `halfYearInterest` | `(bal: Yen, r: RateMilli) => Yen` | `Math.floor(bal * r / 200_000)` |

### 3.2 `js/calc/loan.js`（公式）

```js
/** 元利均等の 1 回あたり返済額（円未満切り捨て）。periodsPerYear: 12（毎月）または 2（ボーナス） */
export function levelPayment(principal: Yen, rateMilli: RateMilli, count: number, periodsPerYear: 12 | 2): Yen
/** 元金均等の 1 回あたり元金（円未満切り捨て） */
export function equalPrincipalUnit(principal: Yen, count: number): Yen
```

- `levelPayment`: `i = rateMilli / 100000 / periodsPerYear`。
  - `principal === 0` → `0`。
  - `i === 0` → `floorYen(principal / count)`（**金利 0% でゼロ除算しない**。要件 C4）。
  - それ以外 → `floorYen(principal * i * (1+i)**count / ((1+i)**count - 1))`。
- `count < 1` は例外（呼び出し側で起きないようにする）。
- 検証値: `levelPayment(1_000_000, 1200, 420, 12) === 2917`、`levelPayment(35_000_000, 800, 420, 12) === 95571`、`levelPayment(36_000_000, 800, 420, 12) === 98301`、`levelPayment(5_000_000, 800, 70, 2) === 82036`。

### 3.3 `js/calc/guarantee.js`

```js
export function resolveGuarantee({
  type: GuaranteeType,
  inputRateMilli: RateMilli,
  addMilli: RateMilli,              // 上乗せ幅（金利内包型）
  rateIncludesGuarantee: boolean,
  loanYen: Yen,
  years: number,
  lumpMode: 'auto' | 'manual',
  lumpYen: Yen | null,              // 手入力時のみ
}) => {
  effectiveRateMilli: RateMilli,    // 計算に使う金利 R
  lumpYen: Yen,                     // 一括保証料（lump 以外は 0）
  lumpUnitPerMillion: number|null,  // 自動時の 100 万円あたり単価（表示用）
  notes: string[],                  // 例: '目安の範囲外（35 年超）'
}
export function guaranteeUnitPerMillion(years: number) => { unit: number, outOfRange: boolean }
```

- `inRate`: `effectiveRateMilli = rateIncludesGuarantee ? inputRateMilli : inputRateMilli + addMilli`、`lumpYen = 0`。要件 C9: 1.0%＋0.2% → 1200。
- `lump`: `effectiveRateMilli = inputRateMilli`。`lumpMode === 'manual'` なら `lumpYen` をそのまま、`auto` なら `Math.round(loanYen * unit / 1_000_000 / 1000) * 1000`（1,000 円未満四捨五入）。
- `none`: `effectiveRateMilli = inputRateMilli`、`lumpYen = 0`。
- `guaranteeUnitPerMillion`: `js/data/guarantee-table.js` の点列 `[[10,8500],[15,12000],[20,14800],[25,17300],[30,19100],[35,20600]]` を使う。
  - 10〜35 年: 前後の点で線形補間（`unit` は小数のまま。最終の金額で丸める）。
  - 10 年未満: `8500 * years / 10`。35 年超: `20600`、`outOfRange: true`。
  - 例: 35 年・3,500 万円 → 721,000 円。

### 3.4 `js/calc/prepay.js`

```js
export function normalizePrepayments(
  list: Array<{ afterYears: number, afterMonths: number, amountYen: Yen, type: PrepayType }>,
  totalCount: number,
) => {
  items: Array<{ atNo: number, amountYen: Yen, type: PrepayType, inputIndex: number }>,
  warnings: Array<{ inputIndex: number, message: string }>,
}
export function splitPrepayment(amountYen: Yen, monthlyBal: Yen, bonusBal: Yen)
  => { toMonthly: Yen, toBonus: Yen, full: boolean }
export function prepayEffect(withPrepay: ScheduleResult, without: ScheduleResult)
  => { interestSaved: Yen, monthsShortened: number, reducedPayment: Yen|null, reducedBonus: Yen|null }
```

- `atNo = afterYears * 12 + afterMonths`。`atNo < 1` または `atNo >= totalCount` は除外して警告（「実行時期は 1 か月以上・最終回より前にしてください」）。
- 並べ替え: `atNo` 昇順、同値は `inputIndex` 昇順（安定ソート）。
- `splitPrepayment`: `total = monthlyBal + bonusBal`。
  - `amountYen >= total` → `{ toMonthly: monthlyBal, toBonus: bonusBal, full: true }`（全額繰上返済）。
  - それ以外 → `toMonthly = Math.floor(amountYen * monthlyBal / total)`、`toBonus = amountYen - toMonthly`。`toBonus > bonusBal` になったら `toBonus = bonusBal; toMonthly = amountYen - bonusBal`（逆も同様に調整）。
- `prepayEffect`: `interestSaved = without.totalInterest - withPrepay.totalInterest`、`monthsShortened = without.lastNo - withPrepay.lastNo`、`reducedPayment` は最後に適用された返済額軽減型の後の毎月返済額（無ければ null）。

### 3.5 `js/calc/schedule.js`（中核）

```js
export function buildSchedule({
  loanYen: Yen,            // P
  bonusYen: Yen,           // Pb（0 可）
  rateMilli: RateMilli,    // R（保証料上乗せ後）
  years: number,
  method: Method,
  startYm: Ym,
  prepayments?: NormalizedPrepay[],   // normalizePrepayments().items
}) => ScheduleResult

type Row = {
  no: number, ym: Ym, year: number, month: number,
  monthlyPayment: Yen, monthlyPrincipal: Yen, monthlyInterest: Yen,
  bonusPayment: Yen, bonusPrincipal: Yen, bonusInterest: Yen,   // ボーナス月以外は 0
  payment: Yen,           // monthlyPayment + bonusPayment（繰上返済額は含まない）
  principal: Yen, interest: Yen,
  prepay: Yen,            // この回の直後に行った繰上返済額
  monthlyBalance: Yen, bonusBalance: Yen,
  balance: Yen,           // 返済・繰上返済後の残高合計
}
type ScheduleResult = {
  rows: Row[],
  lastNo: number, lastYm: Ym,
  initialMonthly: Yen,  lastMonthly: Yen,        // 毎月分（通常回）の初回と最終回の返済額
  initialBonus: Yen,    lastBonus: Yen,          // ボーナス加算額の初回と最終回（Pb=0 なら 0）
  monthlyAfterReduce: Yen|null, bonusAfterReduce: Yen|null,
  firstYearPayment: Yen,  // 1〜12 回の payment 合計（繰上返済額は含まない）。n<12 なら全回
  totalPayment: Yen,      // Σpayment + Σprepay
  totalInterest: Yen,     // Σinterest（= totalPayment − loanYen とも一致すること）
  totalPrepay: Yen,
  prepayLog: Array<{ atNo, amountYen(実際に充当した額), type, full: boolean, ignored?: string }>,
}
export function annualize(result: ScheduleResult) => Array<{
  year: number, elapsed: number,       // elapsed: 1 始まり（返済開始年 = 1）
  months: number,                      // その年の返済回数
  payment: Yen, principal: Yen, interest: Yen, prepay: Yen,
  endBalance: Yen,
}>
export function yearEndBalanceMap(result: ScheduleResult, loanYen: Yen) => (year: number) => Yen
```

**アルゴリズム**（毎月分とボーナス分を別々の「口」として並行に進める）

```
Pm = loanYen − bonusYen, Pb = bonusYen
n = years×12, nb = years×2
口 M: bal=Pm, count=n,  rateDiv=1_200_000, 支払回 = 毎回
口 B: bal=Pb, count=nb, rateDiv=200_000,   支払回 = no % 6 === 0 のときだけ
各口の状態: { bal, pay(元利均等の定額) or unit(元金均等の元金), endNo（予定最終回）}
  元利均等: pay = levelPayment(bal, R, count, 12 or 2)
  元金均等: unit = equalPrincipalUnit(bal, count)
  endNo: 口 M = n、口 B = n（no = 6×nb = n が最終ボーナス回）

for no = 1, 2, ... while (M.bal > 0 || B.bal > 0):
  口ごとに（その回が支払回で bal > 0 の場合）:
    interest = floor(bal × R / rateDiv)
    元利均等: principal = pay − interest
    元金均等: principal = unit
    最終判定: no >= endNo  または  principal >= bal  → principal = bal（最終回。端数はここで調整）
    principal < 0 のとき（理論上起きない。安全策）→ principal = 0 として警告
    bal −= principal; payment = principal + interest
  繰上返済（atNo === no のものを順に）:
    splitPrepayment → 各口の bal を減らす
    full なら両口 bal=0 → ループ終了（prepayLog に full: true）
    shorten: pay / unit を維持。endNo は「現在の返済額で bal が尽きる回」を前方シミュレーションで求め直す
    reduce : 残り回数 = endNo_M − no（口 M）、口 B は floor(endNo_B/6) − floor(no/6)
             元利均等: pay = levelPayment(bal, R, 残り回数, 12|2)
             元金均等: unit = equalPrincipalUnit(bal, 残り回数)
             口 B の残り回数が 0 で bal > 0 の場合 → 口 B の bal を口 M に移して口 M を再計算（警告を付ける）
  atNo が既に完済後（no > lastNo）のものは ignored: '完済後のため適用しません'
  安全弁: no が n を超えたら例外（バグ検出）
row を記録
```

- 前方シミュレーション（endNo の算出）は「同じ pay/unit・同じ利息式で bal が 0 になる回」を単純ループで数える（最大 600 回なので十分速い）。口 B は 6 の倍数の回だけ進む。
- **通常の最終回**（繰上返済なし）は `no === n` で残高全額を払うため、元利均等では最終回の返済額が定額より数円〜数十円少なくなる（利息を毎回切り捨てるため。実装・要件 C2 どおり）。要件 C2 の総返済額 40,139,745 円はこの処理で一致することを確認済み。
- 期間短縮型では通常 `endNo < n` となり、短縮月数 = `n − lastNo`（要件 6.8 の「当初の最終回 − 新しい最終回」）。
- `rateMilli === 0`: 利息は常に 0。`pay = floor(P/n)`、最終回で端数（例: 100 万円・35 年 → 毎回 2,380 円、最終回 2,780 円）。
- `bonusYen === 0`: 口 B は bal=0 で何もしない。ボーナス加算額 0。
- `annualize`: rows を `year` でグループ化。`endBalance` はその年の最後の行の `balance`。`elapsed` は「返済開始年を 1」とする連番。年の途中で完済した場合も、その年の行で終わる（以後の年は出さない）。
- `yearEndBalanceMap`: 返す関数は `year < 開始年` → `loanYen`、行がある年 → その年の最後の残高、`year > 最終年` → `0`。

### 3.6 `js/calc/funding.js`

```js
export function computeFunding({
  priceYen: Yen, expensesYen: Yen, depositYen: Yen,
  loanYen: Yen, guaranteeLumpYen: Yen,
  ownFundsMode: 'auto' | 'manual', ownFundsYen: Yen | null,
}) => {
  expensesTotal: Yen,     // expensesYen + guaranteeLumpYen
  required: Yen,          // priceYen + expensesTotal
  ownFunds: Yen,          // auto: required − loanYen（負もあり得る）、manual: 入力値
  raised: Yen,            // loanYen + ownFunds
  diff: Yen,              // raised − required
  status: 'match' | 'short' | 'over',   // diff 0 / 負 / 正
  deposit: Yen,
  cashAtSettlement: Yen,  // ownFunds − deposit（負もあり得る）
  depositReturned: Yen,   // cashAtSettlement < 0 のとき −cashAtSettlement、それ以外 0
  warnings: string[],     // 'loanExceedsRequired'（借入額 > 必要資金）, 'notTenThousandUnit' 等のコード
  fillOwnFunds: Yen,      // 「差額を自己資金に反映」で入れる値 = required − loanYen
}
```

- 要件 F1: 3,800＋150、借入 3,500、auto → required 39,500,000、ownFunds 4,500,000、cashAtSettlement 3,500,000、match。
- 要件 F2: manual 4,000,000 → diff −500,000、short。
- 要件 F3: 借入 3,900 万円 → ownFunds 500,000、cashAtSettlement −500,000、depositReturned 500,000。
- 警告コードは UI 側（`format.js`）で日本語文言に変換する（計算モジュールに文言を散らさない）。ただし短い固定文言を返しても可。どちらかに統一すること。

### 3.7 `js/calc/tax-credit.js`

```js
export function resolveDeductionDefaults({ houseKind: HouseKind, perf: Perf, moveInYear: number, childcare: boolean })
  => { limitYen: Yen, years: number, eligible: boolean, notes: string[], needsCheck: boolean }

export function computeTaxCredit({
  balanceAt: (year: number) => Yen,   // yearEndBalanceMap の戻り値
  moveInYear: number,
  limitYen: Yen,
  rateMilli: RateMilli,               // 0.7% → 700
  years: number,                      // 控除期間
  incomeTaxYen: Yen | null,           // null → 所得税での頭打ちなし
  residentCapYen: Yen,                // 初期 97,500
}) => {
  rows: Array<{
    year: number, nth: number, balance: Yen, target: Yen,
    capable: Yen, fromIncomeTax: Yen, fromResident: Yen, credit: Yen,
    cappedByLimit: boolean, cappedByTax: boolean,
  }>,
  total: Yen,
}
```

- `resolveDeductionDefaults` は `js/data/deduction-table.js` を引くだけ（要件 9.3 の表を 1 対 1 でデータ化）。対象外（新築・その他）は `{limitYen: 0, years: 0, eligible: false}`。
- `computeTaxCredit` は要件 9.1 の式どおり:
  - `target = min(balance, limitYen)`、`cappedByLimit = balance > limitYen`
  - `capable = floor(floor(target × rateMilli / 100000) / 100) × 100`
  - `fromIncomeTax = incomeTaxYen === null ? capable : min(capable, incomeTaxYen)`
  - `fromResident = min(capable − fromIncomeTax, residentCapYen)`
  - `credit = fromIncomeTax + fromResident`、`cappedByTax = credit < capable`
  - `years === 0` または `limitYen === 0` → rows 空、total 0。
- 入居年の扱い（要件 9.1）: 返済開始が入居年の翌年以降なら入居年の残高 = 借入額（`yearEndBalanceMap` が自動でそうなる）。
- 控除はケースごとの残高で計算する（借入額・繰上返済が違えば控除も違う）。
- 要件 D6: capable 245,000、所得税 100,000、住民税上限 97,500 → credit 197,500。

### 3.8 `js/calc/scenario.js`

```js
export function computeCase(common: CommonValues, deduction: DeductionValues, c: CaseValues) => CaseResult
export function compareCases(results: Array<CaseResult|null>, baseIndex: number) => CompareTable
export function burdenRatio(firstYearPaymentYen: Yen, incomeYen: Yen|null) => number|null
```

- 入力 `CommonValues` / `CaseValues` / `DeductionValues` は**検証済み・円／ミリ%換算済み**の値（`js/model/validate.js` の出力）。
- `computeCase` の処理順:
  1. `resolveGuarantee` → `R`, `lumpYen`
  2. `normalizePrepayments`
  3. `buildSchedule`（繰上返済あり）と、繰上返済が 1 件以上あれば `buildSchedule`（なし）を作り `prepayEffect`
  4. `annualize`
  5. `computeFunding`
  6. 控除: `deduction.enabled` なら、上書き値（`limitOverride` 等）があればそれを、無ければ `resolveDeductionDefaults` の値で `computeTaxCredit`。年次表の各年に控除額を付ける。
  7. `burdenRatio`: `income` が null または 0 → `null`。それ以外 `Math.round(first / income × 1000) / 10`（小数第 1 位）。
  8. 戻り値 `CaseResult`: `{ effectiveRateMilli, schedule, annual, funding, guarantee, prepay: {log, effect}, taxCredit: {rows,total,limitYen,years,eligible,notes,overridden}, summary: { initialMonthly, lastMonthly, initialBonus, lastBonus, firstYearPayment, totalPayment, totalInterest, lumpYen, totalPaid(=totalPayment+lumpYen), burdenRatio, burdenLevel: 'normal'|'caution'|'warning'|null, lastYm, monthsShortened, realBurden(=totalPaid − 控除合計) } }`
  - `burdenLevel`: ≤25 normal、≤35 caution、>35 warning。
- `compareCases`: 要件 8 章の行を返す。各セルは `{ value, diff|null, diffDirection: 'more'|'less'|'same'|null }`。基準ケースまたはエラーのケース（`null`）は diff なし。返済負担率の差はポイント差（小数第 1 位）。

---

## 4. データ・検証モジュール

### 4.1 `js/data/defaults.js`

- `MAX_CASES = 3`、`MAX_PREPAYMENTS = 3`
- `DEFAULT_COMMON = { price: 3800, expenses: 150, deposit: 100, income: 600, startYm: '2027-02' }`（万円）
- `DEFAULT_DEDUCTION` = 要件 10.4 の `deduction` と同じ値
- `DEFAULT_CASE`（新規追加時のひな形）と `DEFAULT_CASES`（A: 「A：手付金を頭金に」3,500、B: 「B：手付金分も借りる」3,600、他は要件 4.2 の初期値。繰上返済は**初期は空配列**。要件 10.4 の例は繰上返済 1 件だが、画面初期値は要件 4.2 の「なし」を採用）
- `DEFAULT_PREPAY = { afterYears: 10, afterMonths: 0, amount: 100, type: 'shorten' }`

### 4.2 `js/data/deduction-table.js`

- `CONFIRMED_AT = '2026-11-15'`
- `SOURCES = [{ id: 1, title, url }, ...]`（要件 9.2 の [1]〜[6]。画面には [1][3][5] を表示）
- `RULES`: 要件 9.3 の 9 行を `{ houseKind, perf, fromYear, toYear, limitMan: {general, childcare}, years, note, needsCheck }` の配列で持つ。
- `DEFAULT_RATE_MILLI = 700`、`DEFAULT_RESIDENT_CAP_MAN = 9.75`

### 4.3 `js/data/guarantee-table.js`

- `LUMP_UNIT_TABLE = [[10,8500],[15,12000],[20,14800],[25,17300],[30,19100],[35,20600]]`
- `DEFAULT_ADD_PERCENT = 0.2`、注記文（「一般的な目安。金融機関の提示額に置き換えること」）

### 4.4 `js/model/validate.js`

```js
export function normalizeNumberText(s: string) => string   // 全角→半角、カンマ・全角カンマ・空白除去、全角マイナス/ピリオド対応
export function parseNumber(s: string) => { ok: true, value: number } | { ok: false, empty: boolean }
export function validateCommon(raw: Record<string,string>) => { values: CommonValues|null, errors: Record<string,string> }
export function validateDeduction(raw, ...) => { values: DeductionValues|null, errors }
export function validateCase(raw: CaseRaw, commonValues: CommonValues|null) => { values: CaseValues|null, errors: Record<string,string>, notices: Record<string,string> }
```

- 範囲・必須・小数桁は要件 4 章の表どおり。**範囲外を丸めない**（エラーにする）。
- 金利・上乗せ幅は小数第 3 位まで（正規化後の文字列で小数部の桁数を確認）。`years` は整数。
- `bonusPrincipal × 2 > loan` → エラー「ボーナス返済分は借入額の 50% 以内にしてください」（要件 C8）。
- `loan % 10 !== 0` → `notices.loan`（エラーにしない）。
- `deposit > price` → エラー。
- 繰上返済の各行: `afterYears`(0〜years)、`afterMonths`(0〜11)、`amount`(≥1)、合計 1 か月以上・最終回より前。エラーのキーは `prepayments.0.amount` のような形。
- 出力 `values` は円・ミリ%に換算済み（`loanYen`, `rateMilli`, `addMilli`, `bonusYen`, `ownFundsYen`, `lumpYen`, `prepayments[].amountYen` ...）。`income` 空欄は `null`。
- エラーメッセージは日本語で、何をどう直すか分かる文にする。

### 4.5 `js/model/preset-schema.js`

```js
export const SCHEMA_VERSION = 1
export function createPayload(sets: PresetSet[], now?: Date) => Payload          // {schemaVersion, updatedAt, sets}
export function normalizePayload(obj: unknown) => { payload: Payload, warnings: string[] }   // 例外を投げずに読める範囲で
export function normalizeSet(set: unknown) => { set: PresetSet, warnings: string[] }
export function setFromRawState(state) => PresetSet       // 画面の生入力 → 平文スキーマ（数値化済み）
export function rawStateFromSet(set: PresetSet) => RawState  // 平文スキーマ → 画面の生入力文字列
export function validatePayloadStrict(obj) => string[]    // CLI 用。致命的な問題の一覧（空なら OK）
```

- 要件 10.4 のとおり: 未知フィールドは無視、欠けたフィールドは `defaults.js` で補う、`schemaVersion` が 1 より大きければ警告して続行、`cases` は 1〜3 件（4 件以上は先頭 3 件＋警告、0 件は既定ケース 1 件＋警告）、列挙値が不正なら既定値＋警告、`baseCaseIndex` は範囲外なら 0。
- 反映時は `rawStateFromSet` の結果をさらに `validate.js` に通す（範囲外の値は入力欄に入るがエラー表示され、計算には使われない）。
- 警告文言・エラー文言に**設定の値そのものを含めない**（フィールド名だけ）。CLI でも同じ関数を使うため。

---

## 5. 暗号モジュール

### 5.1 定数（`js/crypto/presets-crypto.js`）

```js
export const FORMAT = 'housing-loan-simulator/presets'
export const CONTAINER_VERSION = 1
export const AAD_TEXT = 'housing-loan-simulator/presets/v1'
export const DEFAULT_ITERATIONS = 600_000
export const MIN_ITERATIONS = 600_000
export const MAX_ITERATIONS = 10_000_000
export const SALT_BYTES = 16, IV_BYTES = 12, TAG_BYTES = 16, ID_BYTES = 12
```

### 5.2 公開関数

```js
export class PresetCryptoError extends Error { code: 'BAD_FORMAT'|'BAD_PARAMS'|'WEAK_PARAMS'|'DECRYPT_FAILED'|'BAD_PLAINTEXT'|'NO_CRYPTO'|'EMPTY_PASSWORD' }

export function getSubtle() => SubtleCrypto       // globalThis.crypto?.subtle が無ければ NO_CRYPTO（HTTP 配信時など）
export function bytesToBase64(u8: Uint8Array) => string        // 標準 base64・パディングあり（btoa を 0x8000 バイトずつ）
export function base64ToBytes(s: string) => Uint8Array         // /^[A-Za-z0-9+/]*={0,2}$/ かつ長さ%4===0 を検査。不正は BAD_FORMAT
export function randomId() => string                           // 12 バイト乱数 → base64url（パディングなし）
export function encodePassword(pw: string) => Uint8Array       // pw.normalize('NFKC') → UTF-8。空文字は EMPTY_PASSWORD。trim しない
export function validateEntry(entry: unknown) => { ok: true } | { ok: false, code, reason }
export async function deriveKey(password: string, salt: Uint8Array, iterations: number) => CryptoKey
export async function encryptPayload(payload: object, password: string, opts?: { iterations?: number, id?: string }) => Entry
export async function decryptEntry(entry: Entry, password: string) => object   // 失敗時 PresetCryptoError
export async function tryDecryptEntries(
  items: Array<{ entry: Entry, source: 'repo'|'local' }>,
  password: string,
  opts?: { onProgress?: (done: number, total: number) => void, signal?: AbortSignal },
) => { opened: Array<{ entry, source, payload }>, skipped: Array<{ id, source, code }> }
```

**鍵導出**: `importKey('raw', encodePassword(pw), 'PBKDF2', false, ['deriveKey'])` → `deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['encrypt','decrypt'])`。鍵は抽出不可。

**暗号化** `encryptPayload`:
1. `iterations` は `MIN_ITERATIONS` 以上 `MAX_ITERATIONS` 以下の整数でなければ `WEAK_PARAMS` / `BAD_PARAMS`（暗号化側でも下限を強制）。
2. `salt`(16)・`iv`(12) を `crypto.getRandomValues` で**毎回新規生成**。`id` は指定があれば流用（既存エントリの再暗号化）、無ければ `randomId()`。
3. 平文 = `new TextEncoder().encode(JSON.stringify(payload))`。
4. `subtle.encrypt({ name: 'AES-GCM', iv, additionalData: TextEncoder(AAD_TEXT), tagLength: 128 }, key, 平文)`（結果は暗号文＋16 バイトのタグ）。
5. `{ id, kdf: 'PBKDF2', hash: 'SHA-256', iterations, salt: b64, cipher: 'AES-GCM', iv: b64, ciphertext: b64 }` を返す。キー順はこのとおり（差分が読みやすい）。**他のフィールドは付けない。**

**復号** `decryptEntry`:
1. `validateEntry`: `kdf === 'PBKDF2'`、`hash === 'SHA-256'`、`cipher === 'AES-GCM'`、`iterations` が整数で `MIN..MAX`（下限未満は `WEAK_PARAMS`：**鍵導出を実行しないで拒否**）、salt 16 バイト・iv 12 バイト・ciphertext 17 バイト以上、`id` が文字列。
2. 鍵導出 → `subtle.decrypt`（同じ AAD）。例外（`OperationError`）は `DECRYPT_FAILED` に変換。**パスワード誤り・改ざん・AAD 不一致は区別しない**。
3. `new TextDecoder('utf-8', { fatal: true }).decode` → `JSON.parse`。失敗は `BAD_PLAINTEXT`（JSON のパースエラー文言は平文の断片を含みうるので、元の message を捨てて固定文言にする）。
4. 戻り値はオブジェクトのまま（スキーマ正規化は呼び出し側で `normalizePayload`）。

**全エントリ試行** `tryDecryptEntries`（要件 J19）:
- パスワード照合はハッシュを使わず、全エントリの復号を順に試す。1 つ成功しても**残りも試す**（同じパスワードで複数エントリがありうる。成功時点で止めると他のエントリを取りこぼす）。
- エントリごとに salt が違うため、**導出鍵の使い回し（同一 salt 最適化）はできない**。所要時間 ≒ エントリ数 × 1 回の PBKDF2（60 万回で端末により 0.3〜1.5 秒程度）。
- 逐次実行（並列にすると iPhone で UI が固まりやすく、進捗も出しにくい）。各エントリの前に `onProgress(done, total)` を呼び、`await new Promise(r => setTimeout(r, 0))` で描画の機会を与える。
- `signal.aborted` なら次のエントリに進まず、それまでの結果を返す（UI の「中止」ボタン）。
- `validateEntry` で弾いたものは鍵導出せず `skipped` に入れる。`DECRYPT_FAILED` も `skipped` に入れるが、UI では件数も含め「どのエントリが惜しかったか」を出さない（要件 P2）。形式不正・弱いパラメータの件数だけは「読み込めないエントリが N 件あります（形式が不正）」と警告してよい。

### 5.3 `js/crypto/container.js`

```js
export function emptyContainer() => { format, version: 1, entries: [] }
export function parseContainer(text: string) => { container, warnings: string[] }
  // JSON 不正・format 違い・version 違いは例外（BAD_FORMAT）。entries の各要素は validateEntry し、不正なものは除外して警告
export function serializeContainer(c) => string     // JSON.stringify(c, null, 2) + '\n'
export function upsertEntry(c, entry) => Container  // 同じ id があれば置換、無ければ末尾に追加（新しいオブジェクトを返す）
export function removeEntry(c, id) => Container
export function mergeContainers(base, overlay) => Container  // id で重複排除。同じ id は overlay を優先。順序は base の順 → overlay の新規
```

- エクスポート（全体形式）= `mergeContainers(同梱, localStorage)`（要件 10.6。編集したものはローカルが優先）。
- 「追加分のみ」= localStorage のエントリだけのコンテナ。
- コンテナには **entries 以外の平文メタデータを置かない**（要件 10.3・J17）。

### 5.4 `data/presets.enc.json`（初期内容）

```json
{
  "format": "housing-loan-simulator/presets",
  "version": 1,
  "entries": []
}
```

---

## 6. `scripts/encrypt-preset.mjs`（オーナー用 CLI）

### 6.1 使い方

```
node scripts/encrypt-preset.mjs [オプション]

  （オプションなし）       平文 JSON を暗号化し、エントリ 1 件のコンテナを標準出力に出す
  --merge <path>           既存コンテナ <path> にエントリを追加して上書き保存（標準出力には概要のみ）
  --replace-id <id>        --merge と併用。指定 id のエントリを新しい暗号文で置き換える（id は維持）
  --iterations <n>         反復回数（既定 600000。600000 未満・10000000 超はエラー）
  --entry-only             標準出力にエントリ 1 件の JSON だけを出す（コンテナで包まない）
  --check <path>           平文を読まずに、パスワードで復号できるエントリの id とセット数だけを表示（平文は表示しない）
  -h, --help               使い方
```

### 6.2 入力の受け取り

- **パスワード**: 環境変数 `PRESET_PASSWORD` があればそれを使う。無ければ**標準入力の 1 行目**をパスワードとする（末尾の `\r?\n` だけ除く。前後の空白は除去しない＝ブラウザと同じ）。
- **平文 JSON**: 標準入力（`PRESET_PASSWORD` 使用時は標準入力全体、そうでなければ 2 行目以降）。`--check` のときは平文を読まない。
- コマンドライン引数でパスワードを受け取らない。`--password` 等の引数が来たら「パスワードは環境変数 PRESET_PASSWORD か標準入力で渡してください」と表示して終了コード 2。未知のオプションもエラー。
- 標準入力が TTY の場合は、標準エラーに「平文 JSON を貼り付けて Ctrl-D で終了してください」と案内する（エコー抑止の対話入力は実装しない。簡潔さを優先）。
- 平文 JSON は `normalizePayload` で正規化し、`validatePayloadStrict` が問題を返したら終了コード 1（値を表示しない。フィールドのパスだけ）。トップレベルが `sets` 配列を持たず単一の set オブジェクトだった場合は `{ sets: [それ] }` として受け付ける。`updatedAt` は現在時刻で上書きする。
- パスワードが 8 文字未満、または英字・数字の片方しか含まない場合は標準エラーに警告（処理は続ける）。

### 6.3 出力と安全性

- 暗号化後、**メモリ上でただちに復号して元の正規化済み JSON と一致することを検証**（不一致なら書き込まずに終了コード 1）。
- `--merge` の書き込み: 既存ファイルを `parseContainer` で検証（ファイルが無ければ空コンテナから作る）→ `upsertEntry` → 同じディレクトリに一時ファイル（例 `.presets.enc.json.tmp-<乱数>`、中身は暗号文のコンテナのみ）を書いて `rename`。**平文は一切ディスクに書かない**（一時ファイルにも書かない）。
- 標準出力・標準エラーに平文の値・パスワードを出さない。成功時の表示例: `エントリを追加しました: id=xxxxx（設定セット 2 件、反復 600000 回）`。
- 例外時は `PresetCryptoError.code` と固定文言だけを表示し、スタックトレースや `JSON.parse` の元メッセージを出さない（V8 のメッセージは入力の断片を含むことがある）。
- `--check`: `parseContainer` → `tryDecryptEntries` → 成功したエントリの `id` と `sets.length` のみ表示。
- 終了コード: 0 成功、1 入力・検証・復号エラー、2 使い方の誤り。
- 実装は `js/crypto/presets-crypto.js`・`js/crypto/container.js`・`js/model/preset-schema.js` を相対 import して使う（ブラウザと同じコード）。

### 6.4 README に載せる実行例（ダミー）

```bash
# パスワードを履歴に残さず環境変数へ（入力は表示されない）
read -rs PRESET_PASSWORD && export PRESET_PASSWORD
# 平文 JSON を貼り付けて Ctrl-D。結果を同梱ファイルに追加
node scripts/encrypt-preset.mjs --merge data/presets.enc.json
unset PRESET_PASSWORD
# 確認（平文は表示されない）
read -rs PRESET_PASSWORD && export PRESET_PASSWORD
node scripts/encrypt-preset.mjs --check data/presets.enc.json
unset PRESET_PASSWORD
```

- 平文 JSON をファイルに保存してリダイレクトする方法は「平文がディスクに残る」ため README では推奨しない（使う場合は作業後に確実に削除し、リポジトリ内に置かない旨を書く）。

---

## 7. UI 設計

### 7.1 `index.html`

- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">`（`maximum-scale` / `user-scalable=no` は**付けない**：拡大を妨げない。ズーム防止は 16px 以上のフォントで行う）
- `<meta name="color-scheme" content="light dark">`
- CSP: `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'">`
  - `style-src 'self'` のため、HTML の `style="..."` 属性と `el.setAttribute('style', ...)` は使わない。動的な見た目は class の付け替えか `el.style.prop = ...`（CSSOM 経由は CSP の対象外）で行う。
- `<script type="module" src="./js/main.js"></script>`、`<link rel="stylesheet" href="./css/style.css">`
- 要件 3 章のセクション 1〜11 を静的に置く（見出し・説明文・注意書き・出典の枠）。入力欄はセクション 2・控除・ケースのコンテナを空で置き、`form.js` が `fields.js` の定義から生成する。
- `<noscript>` に「JavaScript を有効にしてください」。
- マイ設定は `<dialog id="presets-dialog">`。
- ルート要素に `lang="ja"`。

### 7.2 状態管理（`js/ui/state.js`）

```js
state = {
  raw: {                         // 入力欄の生の文字列（入力途中の値を失わないため）
    common: { price: '3800', ... },
    deduction: { enabled: true, moveInYear: '2027', houseKind: 'new', perf: 'zeh', childcare: true,
                 limitOverride: '', rateOverride: '', yearsOverride: '', incomeTax: '', residentCap: '9.75' },
    cases: [ { label, loan, ownFundsMode, ownFunds, rate, years, method, bonusPrincipal,
               guaranteeType, guaranteeRateAdd, rateIncludesGuarantee, guaranteeLumpMode, guaranteeLump,
               prepayments: [ {afterYears, afterMonths, amount, type} ] }, ... ],
  },
  baseCaseIndex: 0,
  activeCaseIndex: 0,
  errors: { common: {}, deduction: {}, cases: [ {} ] },
  notices: { cases: [ {} ] },
  lastValid: { common: null, deduction: null, cases: [ null ] },   // 直近の有効な検証済み値
  results: [ CaseResult|null ],
}
export function createStore(initialRaw) => { get(), update(mutator, { recompute: boolean }), subscribe(fn) }
```

- 入力イベント（`input` / `change`）→ 該当 `raw` を更新 → `requestAnimationFrame` で 1 フレームに 1 回だけ再計算（連続入力をまとめる）。
- 再計算: `validateCommon` / `validateDeduction` / 各 `validateCase`。有効なら `lastValid` を更新、無効ならエラーを記録して `lastValid` を据え置き。`results[i] = computeCase(lastValid.common, lastValid.deduction, lastValid.cases[i])`。
  - 要件 3.1「入力途中の不正値では直前の有効な結果を残す」に対応。ただし**比較表では、現在エラーがあるケースは「—」**（要件 4.5）。サマリー等は直前の有効結果を薄く表示し「入力エラーのため前回の結果を表示中」と添える。
  - 共通項目がエラーのときは共通の `lastValid` を使い続ける。
- 再描画は結果系（サマリー・資金計画・比較・グラフ・控除・年次表）だけ。**入力フォームは再生成しない**（フォーカス・カーソル位置を失わないため）。フォームの再生成はタブ切替・ケース追加／削除・マイ設定反映のときだけ。
- 自己資金「自動」のときは自己資金欄を読み取り専用にし、計算値（万円）を表示する。「差額を自己資金に反映」ボタンは手入力時のみ表示し、`fillOwnFunds` を万円で入れる。
- 一括保証料「自動」のときも同様に計算値を読み取り専用で表示。
- 控除の限度額・期間は選択から自動の値をプレースホルダー（または補足表示）に出し、上書き欄に値があれば「手入力の値で計算中」と表示。
- 入力値は**自動保存しない**（要件 10.5・J20）。

### 7.3 ケース操作（`form.js`）

- タブ: ケース A／B／C（ラベルが空なら「ケース A」）。`role="tablist"`、`aria-selected`。
- 「ケースを追加」（3 件で無効化）・「このケースを複製」（3 件で無効化）・「このケースを削除」（1 件のとき無効化）。削除で `baseCaseIndex` がずれる場合は補正（基準を削除したら 0）。
- 基準ケースの選択（比較表の上の `<select>`）。
- 繰上返済: ケース内に 0〜3 行。「繰上返済を追加」「この行を削除」。
- 全入力に `<label for>`、単位は `<span>` で表示、エラーは入力欄直下の `<p class="error" id="...-err">` に出し `aria-describedby` と `aria-invalid` を設定。エラー表示領域全体に `aria-live="polite"` の要約を 1 つ置く。
- 入力欄: 金額・金利は `type="text" inputmode="decimal"`、年数・年は `inputmode="numeric"`（`type="number"` は全角・カンマの正規化ができず iOS で扱いにくいため使わない）。`autocomplete="off"`、`enterkeyhint="next"`。返済開始年月は `type="month"`（Safari 非対応環境では `YYYY-MM` テキストとして検証）。

### 7.4 表示（`format.js` と各ビュー）

- 円: `Intl.NumberFormat('ja-JP')` で 3 桁区切り＋「円」。大きい金額（1 万円以上）は `（約 3,500 万円）` を添える（万円は小数第 1 位まで、末尾の .0 は省略）。
- 差額: `+2,730 円（基準より多い）` / `−1,000 円（基準より少ない）` / `±0 円（同じ）`。色クラス `diff-more` / `diff-less` を付けるが、文言だけで意味が通ること。
- 返済負担率: `21.3%` と目安ラベル（「目安内」「注意」「警告」＋アイコン文字）。注記「審査上の返済負担率とは一致しません」。
- 資金計画: 要件 7.3 の表を `<table>` で。判定は「✓ 一致」「⚠ 調達資金が 50 万円 不足」「⚠ 調達資金が ○ 万円 超過」。決済時必要現金が負なら「手付金のうち ○ 万円が手元に戻る計算」。借入額 > 必要資金なら警告。ケース切替は資金計画セクション内の小さなタブまたは `<select>`。
- 比較表: 要件 8 章の行。`<div class="table-scroll">` で表だけ横スクロール、項目名列は `position: sticky; left: 0`。
- 控除: 区分・世帯・入居年の選択、自動値と注記（要確認・原則対象外など）、年別表（年・残高・対象残高・控除額・頭打ち表示）、合計。出典 [1][3][5] の URL（`<a href rel="noopener noreferrer" target="_blank">`）と確認日 2026-11-15、「最新の制度は国土交通省・国税庁の情報で確認してください」。
- 年次表: `<details>` で折りたたみ（初期は閉じる）。列は要件 5.2。最下行に合計。
- 注意書き: 要件 11 章の 7 項目を常時表示（フッター）。

### 7.5 マイ設定（`presets-view.js` / `presets-storage.js`）

**`presets-storage.js`**

```js
export async function loadRepoContainer() => { container, warnings, error?: string }
  // fetch('./data/presets.enc.json', { cache: 'no-cache' })。失敗・404・形式不正 → 空コンテナ＋警告（アプリは動き続ける）
export function loadLocalContainer() => { container, available: boolean, warnings }
  // localStorage.getItem('hls.presets.v1')。try/catch。使えない環境は available: false
export function saveLocalContainer(c) => { ok: boolean, message?: string }
  // 失敗時「この端末には保存できません。エクスポートを使ってください」
export function downloadJson(filename, text)     // Blob + a[download]。URL.revokeObjectURL を忘れない
export async function copyText(text) => boolean  // navigator.clipboard.writeText、失敗時は textarea を表示して手動コピー案内
```

**画面の状態遷移**

```
[ロック中] パスワード入力 + 「開く」
   │ 開く
   ▼
[確認中] 「設定を確認しています（2 / 3 件目）… この処理には数秒かかることがあります」 <progress>、「中止」ボタン
   │ tryDecryptEntries 完了
   ├─ 0 件 → 「該当する設定が見つかりません」（ロック中に戻る。パスワード欄は空にしない）
   ▼
[解錠済み] エントリごとに設定セットの一覧（名前・メモ・更新日時・出どころ「同梱」/「この端末」）
   各セット: 「反映」「現在の入力で上書き」「名前変更」「削除」
   エントリごと: 「現在の入力を新しいセットとして追加」「保存（この端末）」「パスワード変更」
                 「この端末から削除」（local のみ。同梱は「リポジトリ側で削除してください」と表示）
   全体: 「エクスポート（全体形式）」「エクスポート（追加分のみ）」それぞれダウンロード／コピー
         「ロック」（メモリ上のパスワードと平文を破棄）
別タブ: [新規作成] セット名・メモ・新しいパスワード・確認入力 → 強度警告（8 文字未満・単一文字種）→ 作成
```

- 読み込み対象は「同梱 + localStorage」。同じ `id` が両方で開けた場合は平文の `updatedAt` が新しい方を採用（要件 10.5）。
- 解錠済みエントリはメモリ上で `{ id, source, password, payload, dirty }` として保持。パスワードはモジュール内変数にだけ置き、ロック・`pagehide` で `null` にする。localStorage・URL・`console` に書かない。
- 編集（追加・上書き・名前変更・削除）は `dirty = true` にし、「保存（この端末）」で `encryptPayload(payload, password, { id })`（**同じ id、新しい salt / IV**）→ `upsertEntry(local, entry)` → `saveLocalContainer`。保存前に `updatedAt` を現在時刻に。
- 未保存の変更があるままロック・ダイアログを閉じる場合は `confirm` で確認。
- セットを全部削除したエントリは保存時に「このエントリを削除しますか」と確認し、OK なら local から `removeEntry`（同梱のものは削除不可の案内）。
- パスワード変更: 新パスワード＋確認 → 同じ id で再暗号化して local に保存。README の注意（過去の暗号文は git 履歴に残る）を画面にも短く表示。
- 新規作成: `createPayload([setFromRawState(state)])` → `encryptPayload`（新しい id）→ local に保存 → そのまま解錠済み一覧に加える。入力にエラーがある場合は作成させず理由を表示。
- 「反映」: `normalizeSet` → `rawStateFromSet` → `state.raw` を置き換え（共通・控除・全ケース・基準ケース）→ フォーム再生成 → 再計算（要件 P6）。正規化の警告は一覧の上に表示。
- 暗号処理中は二重実行を防ぐためボタンを無効化。
- `crypto.subtle` が無い（HTTP 配信・古い端末）場合はマイ設定ボタンを押したときに「この環境では暗号機能が使えません（HTTPS で開いてください）」。
- 画面にもセキュリティ上の注意（要件 10.7 の要約）を表示する。

### 7.6 グラフ（`js/chart.js`）

```js
export function renderBalanceChart(container: HTMLElement, {
  series: Array<{ label: string, points: Array<{ year: number, balanceYen: Yen }>, styleIndex: 0|1|2 }>,
  limitYen: Yen | null,         // 控除の借入限度額の補助線（控除有効時）
}) => void
```

- SVG を `createElementNS` で生成（Canvas より DOM で扱え、CSS 変数でダークモードに追従しやすい）。`viewBox="0 0 W H"` で W は親要素の幅（`ResizeObserver` で再描画、最小 300）、H は幅に応じ 220〜320。
- 系列ごとに**色＋線種＋マーカー**を変える: 0=実線・●、1=破線（`stroke-dasharray: 6 4`）・■、2=点線（`2 3`）・▲。色は CSS クラス `.series-0` 等に `stroke: var(--series-0)`。
- 配色（CSS 変数。ダークでは明度を上げた別値）: `--series-0` 青系、`--series-1` 橙系、`--series-2` 緑系。軸・グリッドは `--chart-grid`、文字は `--text-muted`。背景はページ背景を透過。
- 軸: 横 = 年（間引いて 5 年ごと程度）、縦 = 万円（0 からの「きりの良い」目盛り 4〜6 本。最大は全系列の最大残高と限度額の大きい方）。
- 点の位置: 各年の年末残高（`annualize().endBalance`）。年の始点として返済開始前（開始年の前年末＝借入額）を先頭に入れて始点を揃える。
- 補助線: 限度額に水平の細い破線＋「控除の借入限度額 4,500 万円」ラベル。
- 操作: 透明な `<rect>` に `pointermove` / `pointerdown`（タップ）→ 最寄りの年に縦線を引き、グラフ下のツールチップ領域（`aria-live="polite"` の `<div>`、`textContent`）に「2037 年末: A 2,612 万円 / B 2,687 万円」と表示。ポインタが離れても最後の値を残す（スマホで読めるように）。
- 凡例: SVG の外に HTML で（線種のミニ SVG＋ケース名）。
- `<svg role="img" aria-label="残高推移グラフ">` とし、同内容は年次表で読めることを補足。

### 7.7 CSS（`css/style.css`）

- `:root` に色トークン（`--bg`, `--surface`, `--text`, `--text-muted`, `--border`, `--accent`, `--ok`, `--warn`, `--danger`, `--series-0..2`, `--chart-grid`）。`@media (prefers-color-scheme: dark)` で上書き。`body { background: var(--bg); color: var(--text); }`。
- フォント: `font-family: system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif`（外部フォントなし）。`html { -webkit-text-size-adjust: 100%; }`。
- **`input, select, textarea, button { font-size: 16px; }` 以上**（iOS のフォーカス時自動ズーム防止。要件 U1）。`max(16px, 1rem)` を推奨。
- タップ領域: ボタン・タブ・チェックボックスのラベル `min-height: 44px; min-width: 44px`。
- セーフエリア: `body { padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left); }`、本文の左右余白は `max(16px, env(safe-area-inset-left))`。固定ヘッダーを使う場合はその高さ＋`env(safe-area-inset-top)`。
- 横スクロール防止: `html, body { overflow-x: hidden }` には**頼らず**、表は `.table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch }`、長い数値は `overflow-wrap: anywhere`、`img, svg { max-width: 100% }`、grid の子に `min-width: 0`。
- レイアウト: 1 カラム。`@media (min-width: 768px)` で `grid-template-columns: minmax(320px, 420px) 1fr`（左: 入力、右: 結果。右は `position: sticky` にしない＝長いので）。
- 数値は `font-variant-numeric: tabular-nums`、右寄せ。
- エラー: `--danger` の文字＋「⚠」等の文字で表示（色だけに頼らない）。
- `@media print`: ボタン・タブ操作・ダイアログを非表示、`<details>` を開いた状態で印刷できるよう案内（`details:not([open]) > *:not(summary)` は印刷時表示できないため、印刷ボタンを置くなら `beforeprint` で `open` を付ける）、背景色なし。
- `@media (prefers-reduced-motion: reduce)` でトランジション無効。
- 200% 拡大で崩れない（固定 px 幅を避け、`rem` と `minmax`）。

### 7.8 `js/main.js`

1. `defaults.js` から初期 `raw` を作り `createStore`。
2. `form.js` でフォーム生成、`results.js` 等のビューを初期化、`store.subscribe(renderAll)`。
3. 初回の再計算と描画。
4. マイ設定ボタンで `presets-view.js` を開く（同梱 JSON の fetch は**ダイアログを開いたとき**に行う。起動を遅くしない）。
5. 未捕捉の例外は画面上部に「計算中にエラーが発生しました」と表示（値は出さない）。

---

## 8. テスト計画（`node --test "test/*.test.mjs"`）

テストは Node 22 の `node:test` と `node:assert/strict` のみ。値はすべて一般例・ダミー。パスワードは `'dummy-Passw0rd-for-tests'` のように**明らかにダミーと分かる文字列**だけを使う。

| ファイル | 主なケース |
|---|---|
| `units.test.mjs` | `manToYen(3500.5) === 35005000`、`percentToMilli(0.8) === 800`・`(1.2) === 1200`・`(0.123) === 123`、`addMonths('2027-11', 3) === '2028-02'`、利息関数の切り捨て（`monthlyInterest(35_000_000, 800) === 23333`） |
| `loan.test.mjs` | **C1** `levelPayment(1e6,1200,420,12) === 2917`、**C2** 95571、**C3** 98301（差 2730）、**C6** `levelPayment(5e6,800,70,2) === 82036`、**C4** 金利 0: `levelPayment(1e6,0,420,12) === 2380`、元金 0 → 0 |
| `schedule.test.mjs` | **C2** 3,500 万・0.8%・35 年: `initialMonthly 95571`、`totalPayment 40139745`、`totalInterest 5139745`、`lastNo 420`、最終残高 0。**C3** 3,600 万: `totalPayment 41286634`。**C5** 元金均等 3,500 万・0.8%: 1 回目 元金 83333・利息 23333。ボーナス 500 万（3,500 万のうち）: 6・12 回目に `bonusPayment 82036`、それ以外の回は 0、1 回目の毎月分は 3,000 万での `levelPayment`。金利 0%: 毎回 2380・最終回 2780・利息合計 0。**C7 不変条件**（下記）を「方式 2 × ボーナス有無 2 × 繰上返済なし／短縮／軽減／全額 × 金利 0・0.8・3.0」の全組合せで検査。`annualize`: 開始 2027-02 → 初年 11 か月、年末残高が該当年最後の行と一致、合計 = 全行の合計。`yearEndBalanceMap`: 開始前年 = 借入額、完済後 = 0 |
| `prepay.test.mjs` | `normalizePrepayments` の並べ替え（同時期は入力順）・`atNo` 0 と `≥n` の除外と警告。`splitPrepayment` の按分（合計一致、各口の残高を超えない）。**C11** 期間短縮: 10 年後 100 万円 → 以後の `monthlyPayment` は 95571 のまま、`lastNo < 420`、総利息が減る、`monthsShortened > 0`。**C12** 返済額軽減: `lastNo === 420`、繰上返済後の毎月返済額 < 95571。全額繰上返済（金額 ≥ 残高）: その回で終了、`full: true`、最終残高 0、充当額 = その時点の残高。完済後の繰上返済は ignored。複数件（短縮→軽減）でも不変条件が成り立つ |
| `guarantee.test.mjs` | **C9** 内包型 1.0%+0.2% → 1200、上乗せ済み → 1000。一括型 35 年 3,500 万 → 721,000。補間（例 12 年）、10 年未満の按分、35 年超の `outOfRange`。none → lump 0 |
| `funding.test.mjs` | **F1**〜**F3**、**C10** 一括保証料が `expensesTotal`・`required` に加わる、借入額 > 必要資金の警告 |
| `tax-credit.test.mjs` | **D1** 新築・ZEH・子育て・2027 → 45,000,000・13 年。**D2** 新築・省エネ・一般・2027 → 20,000,000・13。**D3** 新築・省エネ・2028 → 20,000,000・10・`needsCheck`・注記あり。**D4** 新築・その他 → eligible false・0。既存住宅の 4 区分。**D5** 残高 > 限度額 → `target = limit`、`cappedByLimit`。**D6** capable 245,000・所得税 100,000・住民税上限 97,500 → 197,500、`cappedByTax`。100 円未満切り捨て（例 残高 12,345,678 × 0.7% = 86,419 → 86,400）。入居年 < 返済開始年 → 入居年の残高 = 借入額。完済後の年は 0 |
| `scenario.test.mjs` | 初期値の A/B: 月額差・総利息差の符号と `diffDirection`、エラーケース（null）の列は diff なし。**C13** `burdenRatio`: 年収 null・0 → null、小数第 1 位丸め。`totalPaid = totalPayment + lumpYen`、`realBurden = totalPaid − 控除合計` |
| `validate.test.mjs` | 全角数字・カンマ・空白の正規化（`'３，５００'` → 3500）、数値でない文字列はエラー、範囲外を丸めずエラー、金利の小数第 4 位はエラー、**C8** ボーナス 50% 超はエラー（ちょうど 50% は可）、10 万円単位でない借入は notice、繰上返済の時期エラー |
| `preset-schema.test.mjs` | `setFromRawState` → `rawStateFromSet` の往復で値が保たれる。未知フィールド無視、欠落フィールドの補完、`cases` 0 件・4 件、不正な列挙値、`schemaVersion: 2` で警告。警告文に値が含まれない |
| `crypto.test.mjs` | **P1** 往復（ダミー payload）で `deepStrictEqual`。**P2** 誤パスワード → `DECRYPT_FAILED`。**P3** 同じ内容を 2 回 → salt・iv・ciphertext・id がすべて異なる。**P4** ciphertext の 1 バイト改変・iv 改変・salt 改変 → `DECRYPT_FAILED`、AAD 不一致（`AAD_TEXT` と異なる AAD で暗号化したエントリをテスト内で `subtle` 直接で作る）→ `DECRYPT_FAILED`。**P5** `iterations: 599999` → `WEAK_PARAMS` かつ**鍵導出が呼ばれない**（`deriveKey` の呼び出し回数を数えるか、所要時間ではなくコード構造で確認：`validateEntry` を単体でテスト）。`iterations: 10000001` → `BAD_PARAMS`。暗号化側で `iterations: 1000` を指定 → 拒否。`kdf`/`hash`/`cipher` 不一致 → `BAD_FORMAT`。base64 不正・salt 長不正。NFKC: 全角英数字のパスワードで暗号化 → 半角で復号できる。空パスワード → `EMPTY_PASSWORD`。エントリのキーが 8 個だけ（平文メタデータなし）。`tryDecryptEntries`: 3 件中 2 件が同じパスワード → 2 件開く、`onProgress` が呼ばれる、`AbortSignal` で途中停止 |
| `container.test.mjs` | `emptyContainer` の形、`parseContainer` で format・version 違いは例外、不正エントリは除外＋警告、`upsertEntry` の置換・追加、`mergeContainers` の重複排除と優先、`data/presets.enc.json` を読んで空コンテナとして妥当 |
| `encrypt-script.test.mjs` | `child_process.spawn` で CLI を実行（`env: { ...process.env, PRESET_PASSWORD: 'dummy-…' }`、stdin にダミー JSON）。標準出力のコンテナを `decryptEntry` で復号できる（**P10**）。`PRESET_PASSWORD` なし＋stdin 1 行目パスワードでも動く。`--merge` で一時ディレクトリ（`fs.mkdtemp(os.tmpdir())`）のコンテナにエントリが追加され、既存エントリは保持される。`--replace-id` で id 維持・暗号文変化。`--password xxx` → 終了コード 2。不正 JSON → 終了コード 1 で、標準出力・標準エラーにダミー平文の特徴的な文字列（例 `'dummy-marker-123'`）が**含まれない**。成功時も出力にパスワード・平文の値が含まれない。`--merge` 後に一時ディレクトリ内に平文を含むファイルが無い。`--check` が id とセット数だけを表示 |

**C7 不変条件**（`schedule.test.mjs` で共通ヘルパー化）:
- Σ(principal) + Σ(prepay) === loanYen
- 最終行の balance === 0、途中の balance は単調非増加かつ 0 以上
- 各行 `payment === principal + interest`、`principal >= 0`、`interest >= 0`
- `totalInterest === totalPayment − loanYen`
- 元利均等で繰上返済なしの場合、最終回以外の `monthlyPayment` は一定

PBKDF2（60 万回）は 1 回 0.3〜1 秒かかるため、暗号テストは鍵導出の回数を最小限にまとめる（全体で 30 秒以内を目安）。テストのタイムアウトは既定のままでよい。

---

## 9. GitHub Pages ワークフロー（`.github/workflows/pages.yml`）

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: false

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: node --test "test/*.test.mjs"

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - name: 公開ファイルを集める
        run: |
          mkdir -p _site
          cp -R index.html css js data .nojekyll _site/
      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

- 公開物は `index.html`・`css/`・`js/`・`data/`・`.nojekyll` だけ（`test/`・`scripts/`・`docs/` は公開しない。秘密は含まないが不要なため）。
- アクションのメジャー版は上記で動作する組み合わせ。より新しいメジャー版がある場合は、各アクションのリリースノートで互換性（特に `upload-pages-artifact` の隠しファイルの扱い）を確認してから上げる。
- README に「Settings → Pages → Build and deployment → Source を **GitHub Actions** にする」手順を書く。

---

## 10. README.md の構成

1. 概要（何ができるか。すべて概算である旨）・公開 URL（`https://amonohno.github.io/housing-loan-simulator/`）
2. 使い方（入力、ケース比較、資金計画、控除、繰上返済）
3. 計算の前提（要件 6 章の要約・端数処理・保証料の目安）
4. 住宅ローン控除の出典と確認日（2026-11-15）、要確認事項
5. マイ設定
   - 画面から新規作成 → この端末に保存 → エクスポート → `data/presets.enc.json` に置き換えてコミット → 全端末で使える
   - 既存エントリへの追加・削除・上書き（解錠 → 編集 → 保存 → エクスポート）
   - パスワード変更（再暗号化）の手順
   - Node スクリプト（6.4 の例。平文をファイルに置かない）
   - JSON の形式（要件 10.3・10.4 へのリンク）
6. **セキュリティ上の注意**（要件 10.7: 公開リポジトリの暗号文は誰でもオフライン総当たり可能、**4 桁など短いパスワードは容易に破られる**、8 文字以上の英数字混在を推奨（より長いパスフレーズが望ましい）、git 履歴に古い暗号文が残る、忘れたら復元不可、パスワード・平文をコミットしない）
7. GitHub Pages の設定（Source を GitHub Actions に）
8. 開発（`node --test "test/*.test.mjs"`、`python3 -m http.server` での確認、ディレクトリ構成）
9. 設計メモ（本書・要件へのリンク、判断の記録）

---

## 11. 実装フェーズと完了条件

実装エージェントは 3 回に分けて呼ぶ想定。各フェーズは前のフェーズの成果物を前提とし、各フェーズの最初に本書と要件を読み直すこと。

### フェーズ 1: 計算ロジック＋テスト

- 作るもの: `package.json`、`js/calc/*.js`（8 ファイル）、`js/data/*.js`（3 ファイル）、`js/model/validate.js`、`test/` の units / loan / schedule / prepay / guarantee / funding / tax-credit / scenario / validate。
- 完了条件:
  - `node --test "test/*.test.mjs"` がすべて成功。
  - 要件 13.1 の C1〜C13（C8 は validate、C13 は burdenRatio）、13.2 の F1〜F3、13.3 の D1〜D6 に対応するテストがある。
  - `js/calc` / `js/model` / `js/data` に `document`・`window`・`localStorage` の参照がない（`grep` で確認）。
  - 3 ケース × 50 年 × 繰上返済 3 件の `computeCase` を 3 回実行して 100ms 以内（簡易計測をテストに入れてよいが、CI で不安定なら `console` 出力だけにする）。

### フェーズ 2: 暗号＋スキーマ＋CLI＋テスト

- 作るもの: `js/crypto/presets-crypto.js`、`js/crypto/container.js`、`js/model/preset-schema.js`、`data/presets.enc.json`（空コンテナ）、`scripts/encrypt-preset.mjs`、`test/` の crypto / container / preset-schema / encrypt-script。
- 完了条件:
  - 全テスト成功（フェーズ 1 分も含む）。
  - 要件 13.4 の P1〜P5、P10、P12 に対応するテストがある。
  - `js/crypto` が `globalThis.crypto` 以外（`node:crypto` 等）を import していない。
  - CLI がパスワード引数を拒否し、平文をディスク・標準出力に出さないことをテストで確認。
  - `data/presets.enc.json` が `entries: []`。

### フェーズ 3: UI＋グラフ＋Pages＋README

- 作るもの: `index.html`、`css/style.css`、`js/main.js`、`js/chart.js`、`js/ui/*.js`、`.github/workflows/pages.yml`、`.nojekyll`、`README.md`。
- 完了条件:
  - 全テスト成功。
  - 12 章のヘッドレス確認がすべて通る（コンソールエラー 0、外部通信 0、375px で横スクロールなし、入力変更で結果が更新、ケース追加・削除、グラフのタップで値表示、マイ設定の新規作成 → リロード → 解錠 → 反映、誤パスワードで「該当する設定が見つかりません」、エクスポート JSON が 10.3 形式）。
  - スクリーンショット（iPhone 幅・ライト／ダーク、PC 幅）を scratchpad に保存して目視確認。
  - リポジトリ内に実データやダミー以外のパスワードが無い（`grep -ri password` の結果がコード・ダミー・説明文だけ）。
  - `git status` は確認だけ。**commit / push はしない。**

---

## 12. ヘッドレス確認手順

Playwright は CommonJS の `require('playwright')` でだけ解決できる（`NODE_PATH` 経由。ES モジュールの `import` は不可）。確認スクリプトは**リポジトリに置かず** scratchpad に `.cjs` で作る（リポジトリを npm パッケージに依存させないため）。

```bash
# 1) 静的サーバー（サブパス配信の確認のため親ディレクトリから配信）
cd /home/claude && python3 -m http.server 8765 --bind 127.0.0.1 &
# → http://127.0.0.1:8765/housing-loan-simulator/ で開く（U4: サブパスで相対参照が効くこと）
#    localhost は secure context なので crypto.subtle が使える

# 2) 確認スクリプト（scratchpad/check.cjs）を実行
node <scratchpad>/check.cjs
```

`check.cjs` で行うこと（Chromium、`devices['iPhone 13']` から `viewport`・`userAgent`・`deviceScaleFactor`・`isMobile`・`hasTouch` を流用。`defaultBrowserType` は使わない）:

1. `page.on('console')` / `page.on('pageerror')` を収集し、エラー 0 を確認。
2. `page.on('request')` で URL を収集し、`127.0.0.1:8765` 以外への通信が 0 であることを確認（U3）。
3. 幅 375・390 で `document.documentElement.scrollWidth <= window.innerWidth`（U1）。
4. 全 `input, select, button` の `getComputedStyle().fontSize` が 16px 以上。
5. 初期表示で資金計画が「一致」、比較表に月額差が表示される。借入額欄に `3,700` を入力 → `waitForFunction` で結果が変わる（U2）。
6. ケース追加で C が現れ、4 つ目は追加ボタンが無効（F5）。
7. グラフ領域を `page.tap` → ツールチップに年と金額（U5）。
8. マイ設定: 新規作成（ダミーのセット名・パスワード `dummy-Passw0rd-for-tests`）→ `page.reload()` → 解錠 → 一覧に表示 → 反映で入力欄が変わる（P6・P7）。誤パスワードで「該当する設定が見つかりません」（P2）。localStorage の中身に平文のセット名・パスワードが含まれない（P12）。
9. エクスポート（コピー用テキストエリアまたはダウンロード）の JSON が `format`・`version`・`entries` を持つ（P9）。
10. `colorScheme: 'light'` と `'dark'` でスクリーンショット（`fullPage: true`）、PC 幅 1280 でも 1 枚。保存先は scratchpad。
11. 終了後に http.server を停止する。

---

## 13. 判断の記録（本書で決めたこと）

| # | 論点 | 判断 | 理由 |
|---|---|---|---|
| I1 | 金利の内部表現 | ミリ%の整数 | 利息の切り捨てを整数演算で正確に行う |
| I2 | ボーナス分の回数管理 | 毎月分と独立した「口」として並行計算 | 要件 6.4 の分離計算と 6.8 の按分をそのまま表現できる |
| I3 | 期間短縮型の終了判定 | 現在の返済額で残高が尽きる回を前方シミュレーション | 実装が単純で、毎月分・ボーナス分の両方に同じ方法が使える |
| I4 | 返済額軽減型でボーナス残り回数 0 | ボーナス残高を毎月分に移して再計算＋警告 | まれなケース。残高が取り残されるのを防ぐ |
| I5 | 入力欄の type | `text` + `inputmode` | 全角・カンマの正規化（要件 4.5）と iPhone のテンキー表示を両立 |
| I6 | グラフ | SVG 自前描画 | CSS 変数でダークモードに追従、タップ処理と a11y が容易 |
| I7 | 復号の並列度 | 逐次 | 進捗表示と中止が容易、iPhone で UI が固まりにくい |
| I8 | 同梱 JSON の取得時期 | マイ設定を開いたとき | 起動を速くし、マイ設定を使わない人に通信を発生させない |
| I9 | CLI のパスワード入力 | 環境変数か stdin 1 行目（エコー抑止の対話入力は作らない） | 依存なしで簡潔。README で `read -rs` を案内 |
| I10 | 公開物 | `_site` に必要ファイルだけ集める | テスト・スクリプト・文書を公開しない |
| I11 | `package.json` | 依存なしで `"type": "module"` だけ | Node で `js/*.js` を ES モジュールとして読むため |
| I12 | Playwright スクリプトの置き場所 | scratchpad（コミットしない） | リポジトリを npm パッケージに依存させない |
| I13 | 画面初期値の繰上返済 | なし（要件 4.2） | 要件 10.4 の例（1 件）より画面の初期値表を優先 |
