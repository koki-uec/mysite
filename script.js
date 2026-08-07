/* ============================================================
   script.js
   1) data/darts.json を読んでスタッツを画面に出す
   2) 目標日までの残り日数を計算して出す
   3) ダーツボードをクリックした場所の得点を出す
   ============================================================ */

/* --- 1. ダーツのスタッツを読み込む --------------------------
   fetch は「ファイルを取ってくる」命令。
   時間がかかる処理なので async / await をつけて「待つ」と書きます。
   ※ index.html をダブルクリックで開くとここは失敗します。
     必ず Live Server 経由で開いてください（理由は後述）。
------------------------------------------------------------ */
async function loadDarts() {
  try {
    const res = await fetch('data/darts.json');   // ファイルを取りに行く
    const data = await res.json();                // JSONを JavaScript の形に変換

    // id が一致する要素を探して、中身を書き換える
    document.getElementById('dl-rating').textContent  = data.rating;
    document.getElementById('dl-flight').textContent  = data.flight;
    document.getElementById('dl-stats01').textContent = data.stats01;
    document.getElementById('dl-cricket').textContent = data.cricket;
    document.getElementById('dl-updated').textContent = 'UPDATED ' + data.updated;

  } catch (err) {
    // 読み込みに失敗したときは、何が起きたかコンソールに出す
    console.error('darts.json が読み込めませんでした:', err);
    document.getElementById('dl-updated').textContent = 'DATA UNAVAILABLE';
  }
}

/* --- 2. 目標日までの残り日数 --------------------------------
   data-deadline="2026-10-12" と書いた要素をすべて探して、
   今日との差を日数に直して表示します。
------------------------------------------------------------ */
function updateCountdowns() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);   // 時刻を切り捨てて日付だけで比べる

  document.querySelectorAll('[data-deadline]').forEach(el => {
    // "2026-09-04" を数値3つに分けて渡す。
    // 文字列のまま new Date() に渡すと協定世界時として読まれ、日本時間とズレるため。
    // （月は0始まりなので m - 1）
    const [y, m, d] = el.dataset.deadline.split('-').map(Number);
    const target = new Date(y, m - 1, d);

    const diffMs = target - today;                         // ミリ秒の差
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24)); // 日に直す

    el.textContent = days > 0 ? days + ' days' : 'done';
  });
}

/* --- 3. ダーツボードのクリック判定 --------------------------
   考え方は2つだけ。
   ・中心からの「距離」  → シングル / ダブル / トリプル / ブル
   ・中心から見た「角度」→ 何番のところか
------------------------------------------------------------ */

// 真上から時計回りの、実物と同じ数字の並び（HTMLの --i と同じ順番）
const BOARD_NUMBERS = [20,1,18,4,13,6,10,15,2,17,3,19,7,16,8,11,14,9,12,5];

// 中心からの距離の境目。半径を 1 としたときの値。
// ★style.css の board__band / board__bull の % と対応しています。
//   片方だけ変えると見た目と判定がズレるので、必ずセットで直すこと。
const R_BULL       = 0.06;   // インナーブル（.board__bull      の width 6%）
const R_OUTER_BULL = 0.13;   // アウターブル（.board__bull-out  の width 13%）
const R_TRIPLE_IN  = 0.55;   // トリプル内側（64% × mask 86% ≒ 0.55）
const R_TRIPLE_OUT = 0.64;   // トリプル外側（.board__band--triple の width 64%）
const R_DOUBLE_IN  = 0.91;   // ダブル内側  （100% × mask 91%）

function setupBoard() {
  const board = document.querySelector('.board');
  if (!board) return;                       // 盤が無いページでも落ちないように

  const spin  = board.querySelector('.board__spin');
  const play  = board.querySelector('.board__play');
  const label = board.querySelector('.board__score');
  let timer;

  // pointerdown はマウスのクリックもスマホのタップも両方拾ってくれる
  board.addEventListener('pointerdown', (e) => {

    // (1) 得点エリアの中心から、クリック位置がどれだけズレているか
    const rect = play.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width  / 2);
    const dy = e.clientY - (rect.top  + rect.height / 2);

    // ★半径は offsetWidth から取る★
    //   getBoundingClientRect() が返すのは「回転した正方形を囲む四角形」なので、
    //   回転中は幅が最大 1.41倍 まで膨らんでしまい、距離の基準に使えない。
    //   offsetWidth は回転前のレイアウト上の幅なので常に一定。
    //   （中心は回転しても動かないので、位置だけは rect から取ってOK）
    const r = Math.hypot(dx, dy) / (play.offsetWidth / 2);

    // (2) 真上を0度とした時計回りの角度。
    //     atan2(dx, -dy) と入れ替えて渡すのが、真上を0度にするコツ
    const screenDeg = Math.atan2(dx, -dy) * 180 / Math.PI;

    // (3) 盤は回り続けているので、今の回転ぶんを引いて盤基準の角度に戻す
    const deg = (((screenDeg - rotationOf(spin)) % 360) + 360) % 360;

    // (4) 18度ごとに区切って、何番のところかを決める
    const number = BOARD_NUMBERS[Math.round(deg / 18) % 20];

    // (5) 表示する
    label.textContent = judge(r, number);
    label.classList.remove('is-on');
    void label.offsetWidth;   // ★一度レイアウトを読ませて、アニメを最初から再生させる
    label.classList.add('is-on');

    clearTimeout(timer);      // 連打されても、最後の1回から900ms後に消える
    timer = setTimeout(() => label.classList.remove('is-on'), 900);
  });
}

// 盤が今何度回っているかを、実際に適用されているCSSから読み取る
function rotationOf(el) {
  const t = getComputedStyle(el).transform;
  if (t === 'none') return 0;            // アニメを切っている人の場合
  const m = new DOMMatrixReadOnly(t);    // "matrix(...)" を扱いやすい形にする
  return Math.atan2(m.b, m.a) * 180 / Math.PI;
}

// 中心からの距離で、シングル / ダブル / トリプル / ブルを決める
function judge(r, n) {
  if (r <= R_BULL)       return 'BULL 50';
  if (r <= R_OUTER_BULL) return 'OUTER 25';
  if (r >  1)            return 'MISS';
  if (r >= R_DOUBLE_IN)                      return 'D' + n + ' = ' + (n * 2);
  if (r >= R_TRIPLE_IN && r <= R_TRIPLE_OUT) return 'T' + n + ' = ' + (n * 3);
  return String(n);
}

/* --- 4. ページが読み込まれたら実行 -------------------------- */
loadDarts();
updateCountdowns();
setupBoard();
