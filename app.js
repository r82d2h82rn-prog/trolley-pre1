/* ============================================================
 * trolley-pre1 — 分岐型インタラクティブ映像プレイヤー
 *
 * 【動画の置き場所】
 *   videos/ フォルダに以下の5本を置いてください（拡張子は .mp4 / .mov / .webm いずれも可）
 *     videos/IMG_pre1.mp4
 *     videos/IMG_pre2.mp4
 *     videos/IMG_pre3.mp4
 *     videos/IMG_pre4.mp4
 *     videos/IMG_bakuhatsu.mp4
 *
 * 【分岐の流れ】
 *   pre1 ─A→ pre2 ─A→ pre3 ─B→ pre4 → Congratulations!
 *     └B──────┴B──────┴A──→ bakuhatsu → Game Over
 * ============================================================ */

/* ---- シーン定義：ここを書き換えれば分岐を変えられます ---- */
const SCENES = {
  pre1: {
    file: 'pre1',
    choices: { a: { label: '', next: 'pre2' }, b: { label: '', next: 'bakuhatsu' } }
  },
  pre2: {
    file: 'pre2',
    choices: { a: { label: '', next: 'pre3' }, b: { label: '', next: 'bakuhatsu' } }
  },
  pre3: {
    file: 'pre3',
    choices: { a: { label: '', next: 'bakuhatsu' }, b: { label: '', next: 'pre4' } }
  },
  bakuhatsu: {
    file: 'bakuhatsu',
    onEnd: { result: 'gameover' }
  },
  pre4: {
    file: 'pre4',
    onEnd: { result: 'clear' }
  }
};

const FIRST_SCENE = 'pre1';

const RESULTS = {
  gameover: { title: 'Game Over', gameover: true },
  clear: { title: 'Congratulations!', gameover: false }
};

/* 選択肢つきのシーンで、選ばれないまま動画が終わったときの挙動
   true = 最後のフレームで静止 / false = ループ再生 */
const HOLD_LAST_FRAME = true;

/* ---- 要素参照 ---- */
const el = {
  loadingScreen: document.getElementById('loading-screen'),
  progressBar: document.getElementById('progress-bar'),
  progressLabel: document.getElementById('progress-label'),
  startButton: document.getElementById('start-button'),
  loadError: document.getElementById('load-error'),
  stageScreen: document.getElementById('stage-screen'),
  videoStage: document.getElementById('video-stage'),
  choices: document.getElementById('choices'),
  resultScreen: document.getElementById('result-screen'),
  resultTitle: document.getElementById('result-title'),
  restartButton: document.getElementById('restart-button')
};

const videos = {};          // シーンキー → <video>
const objectUrls = [];      // 解放用
let currentScene = null;
let busy = false;           // 遷移中の多重入力を防ぐ

/* ============================================================
 * 動画ファイルの探索
 * ============================================================ */

/** 1シーンぶんの候補パス（IMG_ 有無 × 拡張子違い）を並べる */
function candidatePaths(base) {
  const names = [`IMG_${base}`, `IMG ${base}`, base];
  const exts = ['mp4', 'MP4', 'mov', 'MOV', 'webm'];
  const paths = [];
  for (const name of names) {
    for (const ext of exts) paths.push(`videos/${encodeURIComponent(`${name}.${ext}`)}`);
  }
  return paths;
}

/** HEAD で存在するパスを1つ選ぶ。fetch 自体が使えない環境では null を返す */
async function resolvePath(base) {
  for (const path of candidatePaths(base)) {
    try {
      const res = await fetch(path, { method: 'HEAD' });
      if (res.ok) return path;
    } catch (err) {
      return null; // file:// などで fetch がブロックされた → 要素読み込みにフォールバック
    }
  }
  return '';   // fetch は使えたがファイルが見つからなかった
}

/* ============================================================
 * プリロード：再生前に全動画をダウンロードしきる
 * ============================================================ */

const loadState = {};   // シーンキー → { loaded, total }

function updateProgress() {
  const entries = Object.values(loadState);
  const totals = entries.reduce((sum, s) => sum + (s.total || 0), 0);
  const loaded = entries.reduce((sum, s) => sum + (s.loaded || 0), 0);

  let percent;
  if (totals > 0) {
    percent = Math.min(100, Math.round((loaded / totals) * 100));
  } else {
    const done = entries.filter((s) => s.done).length;
    percent = Math.round((done / Object.keys(SCENES).length) * 100);
  }

  el.progressBar.style.width = `${percent}%`;
  el.progressLabel.textContent = `${percent}%`;
}

/** fetch でバイトを全部落としてから Blob URL を張る（＝再生時の待ちがゼロになる） */
async function loadViaFetch(key, path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

  const total = Number(res.headers.get('content-length')) || 0;
  loadState[key].total = total;

  let blob;
  if (res.body && typeof res.body.getReader === 'function') {
    const reader = res.body.getReader();
    const chunks = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.length;
      loadState[key].loaded = loaded;
      updateProgress();
    }
    blob = new Blob(chunks, { type: res.headers.get('content-type') || 'video/mp4' });
  } else {
    blob = await res.blob();
  }

  loadState[key].total = blob.size;
  loadState[key].loaded = blob.size;
  updateProgress();

  const url = URL.createObjectURL(blob);
  objectUrls.push(url);
  return url;
}

/** src を張って canplaythrough を待つ（fetch が使えない file:// 用のフォールバック） */
function loadViaElement(video, src) {
  return new Promise((resolve, reject) => {
    const onReady = () => { cleanup(); resolve(); };
    const onError = () => { cleanup(); reject(new Error(`読み込めませんでした: ${src}`)); };
    const cleanup = () => {
      video.removeEventListener('canplaythrough', onReady);
      video.removeEventListener('loadeddata', onReady);
      video.removeEventListener('error', onError);
    };
    video.addEventListener('canplaythrough', onReady);
    video.addEventListener('loadeddata', onReady);   // 一部ブラウザは canplaythrough を出さない
    video.addEventListener('error', onError);
    video.preload = 'auto';
    video.src = src;
    video.load();
  });
}

/** decode 完了まで待つ（張り替え直後の一瞬の黒画面を防ぐ） */
function waitReady(video) {
  if (video.readyState >= 3) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      video.removeEventListener('canplaythrough', done);
      video.removeEventListener('loadeddata', done);
      resolve();
    };
    video.addEventListener('canplaythrough', done);
    video.addEventListener('loadeddata', done);
    setTimeout(done, 8000);
  });
}

async function preloadScene(key) {
  const scene = SCENES[key];
  const video = document.createElement('video');
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', '');
  video.preload = 'auto';
  video.dataset.scene = key;
  el.videoStage.appendChild(video);
  videos[key] = video;

  loadState[key] = { loaded: 0, total: 0, done: false };

  const path = await resolvePath(scene.file);

  if (path === '') {
    throw new Error(`${scene.file} の動画が videos/ に見つかりません（例: videos/IMG_${scene.file}.mp4）`);
  }

  if (path === null) {
    // fetch が使えない環境：候補を順に <video> へ直接読ませる
    let lastError = null;
    for (const candidate of candidatePaths(scene.file)) {
      try {
        await loadViaElement(video, candidate);
        loadState[key].done = true;
        updateProgress();
        return;
      } catch (err) {
        lastError = err;
      }
    }
    throw new Error(`${scene.file} の動画を読み込めません（例: videos/IMG_${scene.file}.mp4）`);
  }

  const url = await loadViaFetch(key, path);
  video.src = url;
  video.load();
  await waitReady(video);
  loadState[key].done = true;
  updateProgress();
}

async function preloadAll() {
  const keys = Object.keys(SCENES);
  const results = await Promise.allSettled(keys.map((key) => preloadScene(key)));
  const errors = results.filter((r) => r.status === 'rejected').map((r) => r.reason.message);

  if (errors.length > 0) {
    el.loadError.hidden = false;
    el.loadError.textContent =
      '以下の動画が読み込めませんでした。\n\n' +
      errors.map((message) => `・${message}`).join('\n') +
      '\n\nvideos/ フォルダにファイルを置いて、ページを再読み込みしてください。' +
      '\n（ファイルを開くのではなく、簡易サーバー経由で開く必要があります。README を参照）';
    el.progressLabel.textContent = '読み込み失敗';
    return;
  }

  el.progressLabel.textContent = '準備完了';
  el.startButton.hidden = false;
  el.startButton.focus();
}

/* ============================================================
 * 再生制御
 * ============================================================ */

function showScreen(name) {
  el.loadingScreen.classList.toggle('is-active', name === 'loading');
  el.stageScreen.classList.toggle('is-active', name === 'stage' || name === 'result');
  el.resultScreen.classList.toggle('is-active', name === 'result');
}

/** 先頭に巻き戻す。シーク完了を待つので再生開始が前フレームからにならない */
function rewind(video) {
  if (video.currentTime === 0) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => { video.removeEventListener('seeked', done); resolve(); };
    video.addEventListener('seeked', done);
    video.currentTime = 0;
    setTimeout(done, 400);
  });
}

function setActiveVideo(key) {
  for (const [sceneKey, video] of Object.entries(videos)) {
    video.classList.toggle('is-active', sceneKey === key);
  }
}

function showChoices(scene) {
  const buttons = el.choices.querySelectorAll('.choice');
  buttons.forEach((button) => {
    const choice = scene.choices[button.dataset.choice];
    button.querySelector('.choice-label').textContent = choice.label || '';
  });
  el.choices.hidden = false;
}

function hideChoices() {
  el.choices.hidden = true;
}

async function playScene(key) {
  const scene = SCENES[key];
  const video = videos[key];
  const previous = currentScene ? videos[currentScene] : null;

  currentScene = key;
  hideChoices();

  // 音が重ならないよう、前の動画は止めてから（画は出したまま）差し替える
  if (previous && previous !== video) previous.pause();

  video.loop = Boolean(scene.choices) && !HOLD_LAST_FRAME;
  await rewind(video);

  try {
    await video.play();
  } catch (err) {
    // 自動再生がブロックされた場合は静止画のまま次の操作を待つ
  }

  setActiveVideo(key);
  if (previous && previous !== video) previous.currentTime = 0;

  if (scene.choices) showChoices(scene);
}

function handleEnded(event) {
  const key = event.target.dataset.scene;
  if (key !== currentScene) return;

  const scene = SCENES[key];
  if (scene.onEnd && scene.onEnd.result) {
    showResult(scene.onEnd.result);
  }
  // 選択肢つきシーンは最後のフレームで静止したまま選択を待つ
}

async function choose(which) {
  if (busy || el.choices.hidden) return;
  const scene = SCENES[currentScene];
  if (!scene || !scene.choices) return;

  const choice = scene.choices[which];
  if (!choice) return;

  busy = true;
  try {
    await playScene(choice.next);
  } finally {
    busy = false;
  }
}

function showResult(name) {
  const result = RESULTS[name];
  el.resultTitle.textContent = result.title;
  el.resultTitle.classList.toggle('is-gameover', result.gameover);
  hideChoices();
  showScreen('result');
  el.restartButton.focus();
}

async function restart() {
  if (busy) return;
  busy = true;
  try {
    showScreen('stage');
    await playScene(FIRST_SCENE);
  } finally {
    busy = false;
  }
}

/* ============================================================
 * 入力
 * ============================================================ */

el.startButton.addEventListener('click', async () => {
  if (busy) return;
  busy = true;
  try {
    showScreen('stage');
    await playScene(FIRST_SCENE);
  } finally {
    busy = false;
  }
});

el.choices.querySelectorAll('.choice').forEach((button) => {
  button.addEventListener('click', () => choose(button.dataset.choice));
});

el.restartButton.addEventListener('click', restart);

document.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (!el.resultScreen.classList.contains('is-active') && !el.choices.hidden) {
    if (key === 'a' || key === 'b') {
      event.preventDefault();
      choose(key);
    }
  }
});

window.addEventListener('beforeunload', () => {
  objectUrls.forEach((url) => URL.revokeObjectURL(url));
});

/* ============================================================
 * 起動
 * ============================================================ */

el.videoStage.addEventListener('ended', handleEnded, true);
showScreen('loading');
preloadAll();
