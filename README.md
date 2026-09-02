# trolley-pre1

Minecraft のトロッコ映像を使った、選択肢で展開が変わる分岐型クイズです。
再生開始前に全素材を読み込みきるので、選択したあとの画面の切り替わりに待ち時間が出ません。

## 分岐の流れ

```
pre1 ──A──> pre2 ──A──> pre3 ──B──> pre4(静止画) ──> Congratulations! ──> 最初に戻る
 │           │           │
 └─B─┐       └─B─┐       └─A─┐
     └───────────┴───────────┴──> bakuhatsu ──> Game Over ──> 最初に戻る
```

| シーン | 出題内容 | 正解（先に進む方） |
| --- | --- | --- |
| pre1 | 大山　夕の本名は？ | **A** だいざん　た |
| pre2 | 石橋　生の本名は | **A** せきはし　なま |
| pre3 | 富士山は世界一高い山である | **B** ✗ |

不正解を選ぶと `bakuhatsu`（爆発）が流れて `Game Over`、
3問正解すると `pre4`（とんかつの写真）が出て `Congratulations!` になります。

## 使い方

### そのまま開く

このリポジトリを取得して、フォルダ内で簡易サーバーを起動します。

```bash
git clone -b claude/large-video-branching-sz05rn https://github.com/r82d2h82rn-prog/trolley-pre1.git
cd trolley-pre1
python3 -m http.server 8000
```

ブラウザで <http://localhost:8000> を開き、読み込み完了後に「スタート」を押します。
素材はリポジトリに含まれているので、別途用意するものはありません。

> `index.html` を直接ダブルクリックしても動きますが、ブラウザの制限で
> 読み込み進捗が出ないことがあるため、簡易サーバー経由を推奨します。

### スマホから見られるように公開する（GitHub Pages）

1. GitHub のリポジトリページ → **Settings** → **Pages**
2. Source を **Deploy from a branch**、Branch を `claude/large-video-branching-sz05rn` の `/ (root)` に設定して Save
3. 数分後に `https://r82d2h82rn-prog.github.io/trolley-pre1/` で公開されます

※ Pages で公開したページは誰でも見られる状態になります。

### 操作

- 画面下部の **A / B** ボタンをタップ（PC ではキーボードの `A` `B` キーでも選択可）
- 結末画面の「最初に戻る」で最初から

## 素材について

| ファイル | 内容 | 尺 |
| --- | --- | --- |
| `videos/IMG_pre1.mp4` | 第1問 | 16.6秒 |
| `videos/IMG_pre2.mp4` | 第2問 | 15.1秒 |
| `videos/IMG_pre3.mp4` | 第3問 | 10.0秒 |
| `videos/IMG_bakuhatsu.mp4` | 不正解時の爆発 | 1.6秒 |
| `videos/IMG_pre4.jpg` | クリア時のとんかつ | 静止画 |

元素材（iPhone の .MOV、HEVC、計40MB）に対して以下の処理を施してあります。

- **H.264 に変換**: HEVC のままだと Safari 以外で再生できないため
- **末尾2秒をカット**: CapCut のアウトロが入っていたため
- **圧縮**: 計40MB → 約12MB

差し替えるときは同じファイル名で `videos/` に置けば動きます。
ファイル名は `IMG_pre1.mp4` / `IMG pre1.mp4` / `pre1.mp4` のいずれでも自動で見つけます
（動画は `.mp4` `.mov` `.webm`、静止画は `.jpg` `.png` `.webp` に対応）。

再圧縮したいときは ffmpeg で:

```bash
ffmpeg -i input.mov -c:v libx264 -crf 31 -preset slow -c:a aac -b:a 96k -movflags +faststart output.mp4
```

## 分岐やシーンを変えたいとき

`app.js` の先頭にある `SCENES` を書き換えるだけです。

```js
const SCENES = {
  pre1: {
    file: 'pre1',                                 // videos/ 内のファイル名（拡張子なし）
    choices: {
      a: { label: '', next: 'pre2' },             // label に文字を入れるとボタンに説明が付く
      b: { label: '', next: 'bakuhatsu' }
    }
  },
  pre4: {
    file: 'pre4',
    type: 'image',                                // 静止画シーン
    hold: 1600,                                   // 何ミリ秒見せてから結末を出すか
    onEnd: { result: 'clear' }
  }
};
```

- シーンを増やす → `SCENES` にキーを追加して `next` でつなぐ
- 選択肢ボタンに説明を出す → `label` に文字を入れる（動画内に選択肢が写っているので既定は空）
- 結末の文言を変える → `RESULTS` を編集
- 選択されないまま動画が終わったときの挙動 → `HOLD_LAST_FRAME`
  （`true` = 最後のフレームで静止 / `false` = ループ再生）

## ファイル構成

| ファイル | 役割 |
| --- | --- |
| `index.html` | 画面の骨組み（読み込み / ステージ / 結末） |
| `styles.css` | 見た目 |
| `app.js` | シーン定義・プリロード・分岐制御 |
| `videos/` | 動画と静止画 |

## 仕組みのメモ

- **プリロード**: 起動時に全素材を `fetch` で最後までダウンロードし、Blob URL として
  各要素に割り当てます。進捗バーは実バイト数ベースです。
- **遅延ゼロの切り替え**: 全シーンぶんの `<video>` / `<img>` を最初から重ねて配置し、
  切り替えは再生開始後に不透明度を入れ替えるだけ。黒画面や再バッファが挟まりません。
  （実測の切り替え遅延は約 1〜3ms）
- **結末表示**: 最後のフレームを背景に残したまま文字を重ねます。クリア時は
  とんかつが見えるよう暗幕を薄くしています。
