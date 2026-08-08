/* ============================================================
   script.js
   1) data/darts.json を読んでスタッツを画面に出す
   2) 目標日までの残り日数を計算して出す
   3) ダーツボードをクリックした場所の得点を出す
   4) data/posts.json を読んで LOG のタイムラインを組み立てる
   5) スクロールで見えた要素をふわっと出す
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

  // ラウンド表示（無くても盤だけは動くようにしておく）
  const roundEl  = document.querySelector('.round');
  const slots    = document.querySelectorAll('.round__dart');
  const total    = document.getElementById('round-total');
  const awardEl  = document.getElementById('round-award');
  const boardCol = document.querySelector('.status__board');
  const flash    = board.querySelector('.board__flash');

  let round = [];   // このラウンドで投げた3本を貯めていく
  let timer;
  let awardTimer;

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

    // (5) 1本ぶんの結果を出す
    const hit = judgeHit(r, number);

    label.textContent = hit.label;
    label.classList.toggle('is-hi', isPremium(hit.area));   // 色分け
    label.classList.remove('is-on');
    void label.offsetWidth;   // ★一度レイアウトを読ませて、アニメを最初から再生させる
    label.classList.add('is-on');

    // 浮き上がって消えるアニメ（1.15秒）が終わってからクラスを外す
    clearTimeout(timer);
    timer = setTimeout(() => label.classList.remove('is-on'), 1200);

    // (6) ラウンドに積む。3投終わっていたら、次の1投目として仕切り直す
    if (round.length >= 3) round = [];
    round.push(hit);
    renderRound();
  });

  // ラウンドの見た目を更新する
  function renderRound() {
    if (!slots.length) return;

    slots.forEach((slot, i) => {
      const hit = round[i];
      slot.textContent = hit ? hit.short : '';     // 空の枠は線だけにする
      slot.classList.toggle('is-filled', Boolean(hit));
      slot.classList.toggle('is-hi', Boolean(hit) && isPremium(hit.area));
    });

    // 合計点は、1投でも投げてから出す（0 を置きっぱなしにしない）
    if (total) {
      total.textContent = round.length
        ? round.reduce((sum, h) => sum + h.points, 0)
        : '';
    }

    // 表示全体の状態。CSSはこの2つのクラスを見て濃さを変える
    if (roundEl) {
      roundEl.classList.toggle('is-live', round.length > 0);
      roundEl.classList.toggle('is-complete', round.length === 3);
    }

    if (!awardEl) return;
    awardEl.classList.remove('is-on');

    if (round.length < 3) {
      // 前のラウンドのアワードは、消えるアニメが終わってから中身も片付ける
      clearTimeout(awardTimer);
      awardTimer = setTimeout(() => {
        if (round.length < 3) awardEl.replaceChildren();
      }, 320);
      return;                                 // 3投そろってから判定
    }
    clearTimeout(awardTimer);

    const award = judgeAward(round);
    if (!award) return;

    // アワードごとの色をCSSへ渡す。
    // 盤の閃光と文字の両方が使うので、共通の親（.status__board）に載せる
    if (boardCol) {
      boardCol.style.setProperty('--award-color', award.color);
      boardCol.style.setProperty('--award-glow', award.glow || award.color);
    }

    // 盤を光らせる
    if (flash) {
      flash.classList.remove('is-on');
      void flash.offsetWidth;
      flash.classList.add('is-on');
    }

    awardEl.replaceChildren();
    const name = document.createElement('b');
    name.textContent = award.name;
    awardEl.append(name);

    void awardEl.offsetWidth;                 // アニメを最初から再生させる
    awardEl.classList.add('is-on');
  }
}

// 盤が今何度回っているかを、実際に適用されているCSSから読み取る
function rotationOf(el) {
  const t = getComputedStyle(el).transform;
  if (t === 'none') return 0;            // アニメを切っている人の場合
  const m = new DOMMatrixReadOnly(t);    // "matrix(...)" を扱いやすい形にする
  return Math.atan2(m.b, m.a) * 180 / Math.PI;
}

/* 中心からの距離で、1本ぶんの結果を決める。
   アワード判定で「どのエリアの何番か」が必要なので、
   文字列ではなくデータのかたまりで返します。
     area  … IBULL(インナーブル) / OBULL(アウターブル) / T / D / S / MISS
     label … 盤の真ん中に大きく出す文字
     short … ラウンド表示の枠に出す短い文字            */
function judgeHit(r, n) {
  if (r <= R_BULL)
    return { area: 'IBULL', number: 25, points: 50, label: 'D-BULL 50',  short: 'D-BULL' };
  if (r <= R_OUTER_BULL)
    return { area: 'OBULL', number: 25, points: 50, label: 'S-BULL 50', short: 'S-BULL' };
  if (r > 1)
    return { area: 'MISS',  number: 0,  points: 0,  label: 'MISS',     short: 'MISS' };
  if (r >= R_DOUBLE_IN)
    return { area: 'D', number: n, points: n * 2, label: 'D' + n + ' = ' + (n * 2), short: 'D' + n };
  if (r >= R_TRIPLE_IN && r <= R_TRIPLE_OUT)
    return { area: 'T', number: n, points: n * 3, label: 'T' + n + ' = ' + (n * 3), short: 'T' + n };
  return { area: 'S', number: n, points: n, label: String(n), short: String(n) };
}

/* 得点表示を色分けするための判定。
   トリプル・ダブル・ブルは「おいしい場所」なのでアンバー、
   シングルとミスは白。CSS側は .is-hi が付いているかどうかだけ見ます。 */
function isPremium(area) {
  return area === 'T' || area === 'D' || area === 'IBULL' || area === 'OBULL';
}

/* 3投からアワードを判定する。
   条件は DARTSLIVE 公式のアワード紹介ページに合わせています。
   ★上に書いたものが優先★ 強いアワードから順に判定して、最初に当たったものを返します。
   （例：T20×3 は THREE IN A BED でもありますが、TON 80 が勝ちます）
   ※ブルはインナー50点・アウター25点（セパブル）で計算しています。 */
function judgeAward(round) {
  const points = round.reduce((sum, h) => sum + h.points, 0);
  const areas  = round.map(h => h.area);
  const nums   = round.map(h => h.number);
  const bulls  = areas.filter(a => a === 'IBULL' || a === 'OBULL').length;

  const allSame = (arr) => arr.every(v => v === arr[0]);

  // 20のトリプル3本（180点）
  if (allSame(areas) && areas[0] === 'T' && allSame(nums) && nums[0] === 20)
    return { name: 'TON 80', color: '#F0662A' };

  // インナーブル3本
  if (allSame(areas) && areas[0] === 'IBULL')
    // 「黒」は暗い背景だと文字が消えてしまうので、
    // 文字は銀白・光だけを黒にして「黒のアワード」に見せています
    return { name: 'THREE IN THE BLACK', color: '#CFCBD6', glow: '#000000' };

  // ブル3本（インナー・アウター問わず）
  if (bulls === 3)
    return { name: 'HAT TRICK', color: '#E2503F' };

  // 同じナンバーのトリプル、またはダブルに3本
  if (allSame(areas) && (areas[0] === 'T' || areas[0] === 'D') && allSame(nums))
    return { name: 'THREE IN A BED', color: '#B79BE0' };

  // 異なるクリケットナンバー（15〜20）のトリプルに3本
  if (allSame(areas) && areas[0] === 'T'
      && new Set(nums).size === 3
      && nums.every(n => n >= 15 && n <= 20))
    return { name: 'WHITE HORSE', color: '#F2ECE2' };

  if (points >= 151) return { name: 'HIGH TON', color: '#E8C15A' };  // 151〜177
  if (points >= 100) return { name: 'LOW TON',  color: '#4FA3E3' };  // 100〜150

  // ブルが1本でも入っていれば
  if (bulls >= 1) return { name: 'NICE ONE', color: '#9BD14E' };

  return null;
}

/* --- 4. LOG のタイムライン ----------------------------------
   HTMLに直接書く代わりに、data/posts.json から <li> を組み立てます。
   これで記録を1件足すときは JSON に3行書くだけで済みます。
------------------------------------------------------------ */
async function loadPosts() {
  const list  = document.getElementById('posts');
  const error = document.getElementById('posts-empty');
  if (!list) return;

  try {
    const res  = await fetch('data/posts.json');
    const data = await res.json();
    const posts = data.posts || [];

    // 日付の新しい順に並べ替える（JSONの並び順に頼らない）
    posts.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

    list.replaceChildren();
    posts.forEach(p => list.appendChild(buildPost(p)));

    // 記録は今この場で作ったので、スクロール演出の対象に登録し直す
    setupReveal();

    // フッターの最終更新日 ＝ 一番新しい記録の日付
    const latest = document.getElementById('last-updated');
    if (latest && posts.length) {
      latest.textContent = 'LAST UPDATED ' + p2dots(posts[0].date);
    }

  } catch (err) {
    console.error('posts.json が読み込めませんでした:', err);
    if (error) error.hidden = false;
  }
}

// 記録1件から <li> を作る
function buildPost(p) {
  const li = document.createElement('li');
  li.classList.add('reveal');            // スクロールで浮かび上がらせる

  const time = document.createElement('time');
  time.dateTime    = p.date;            // 機械向けの日付（2026-08-08）
  time.textContent = p2dots(p.date);    // 人間向けの日付（2026.08.08）

  const src = document.createElement('span');
  // "DARTS" → class="src src--darts"。想定外の文字は落として安全なclass名にする
  const kind = String(p.src || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  src.className   = 'src' + (kind ? ' src--' + kind : '');
  src.textContent = p.src || '';

  const text = document.createElement('span');
  text.className   = 'post__text';
  text.textContent = p.text || '';

  li.append(time, src, text);
  return li;
}

// "2026-08-08" → "2026.08.08"
function p2dots(date) {
  return String(date).replaceAll('-', '.');
}

/* --- 5. スクロールで浮かび上がらせる ------------------------
   IntersectionObserver は「この要素、画面に入った？」を
   ブラウザに監視してもらう仕組みです。
   スクロールのたびに位置を計算する昔のやり方より、ずっと軽く動きます。
------------------------------------------------------------ */
let revealObserver = null;

function setupReveal() {
  // まだ出していないものだけを集める
  const targets = document.querySelectorAll('.reveal:not(.is-in)');

  // 対応していない古いブラウザでは、演出せずに全部出す（消えたままにしない）
  if (!('IntersectionObserver' in window)) {
    targets.forEach(el => el.classList.add('is-in'));
    return;
  }

  if (!revealObserver) {
    revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry, i) => {
        if (!entry.isIntersecting) return;

        // 同時に入ってきたものは少しずつ遅らせる＝カードが順番に出る
        setTimeout(() => entry.target.classList.add('is-in'), i * 90);

        // 一度出したら監視をやめる。戻ってもチカチカしないように
        revealObserver.unobserve(entry.target);
      });
    }, {
      threshold: 0.15,                     // 15%見えたら「入った」とみなす
      rootMargin: '0px 0px -40px 0px'      // 画面の下ぎりぎりでは反応させない
    });
  }

  targets.forEach(el => revealObserver.observe(el));
}

/* --- 6. ページが読み込まれたら実行 -------------------------- */
loadDarts();
loadPosts();
updateCountdowns();
setupBoard();
setupReveal();
