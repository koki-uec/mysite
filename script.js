/* ============================================================
   script.js
   1) data/darts.json を読んでスタッツを画面に出す
   2) 目標日までの残り日数を計算して出す
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
    const target = new Date(el.dataset.deadline);
    const diffMs = target - today;                         // ミリ秒の差
    const days = Math.ceil(diffMs / (1000 * 60 * 60 * 24)); // 日に直す

    el.textContent = days > 0 ? days + ' days' : 'done';
  });
}

/* --- 3. ページが読み込まれたら実行 -------------------------- */
loadDarts();
updateCountdowns();
