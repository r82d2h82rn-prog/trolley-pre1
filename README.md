# trolley-pre1

選択肢で展開が変わる、分岐型インタラクティブ映像プレイヤーです。
再生開始前に全動画を読み込みきるので、選択したあとの画面の切り替わりに待ち時間が出ません。

## 分岐の流れ

```
pre1 ──A──> pre2 ──A──> pre3 ──B──> pre4 ──> Congratulations! ──> 最初に戻る
 │           │           │
 └─B─┐       └─B─┐       └─A─┐
     └───────────┴───────────┴──> bakuhatsu ──> Game Over ──> 最初に戻る
```

- **pre1** 再生中、画面下部に選択肢 A / B を表示
  - A → pre2 へ
  - B → bakuhatsu へ
- **pre2** 再生中、同じく A / B を表示
  - A → pre3 へ
  - B → bakuhatsu へ
- **pre3** 再生中、同じく A / B を表示（ここだけ **A が爆発**）
  - A → bakuhatsu へ
  - B → pre4 へ
- **bakuhatsu** 再生終了 → `Game Over` と「最初に戻る」ボタン
- **pre4** 再生終了 → `Congratulations!` と「最初に戻る」ボタン

「最初に戻る」を押すと pre1 から再スタートします。動画は読み込み済みなので再ダウンロードは発生しません。

## 使い方

### 1. 動画を置く

`videos/` フォルダに5本のファイルを置きます。

```
videos/IMG_pre1.mp4
videos/IMG_pre2.mp4
videos/IMG_pre3.mp4
videos/IMG_pre4.mp4
videos/IMG_bakuhatsu.mp4
```

ファイル名は `IMG_pre1.mp4` / `IMG pre1.mp4` / `pre1.mp4` のいずれでも自動で見つけます。
拡張子は `.mp4` `.mov` `.webm` に対応（`.mp4` が最優先）。

> **注意**: 動画ファイルは Git にコミットされません（`.gitignore` で除外）。
> 容量が大きくリポジトリが膨らむためで、共有するときは動画だけ別途受け渡してください。

### 2. ローカルサーバーで開く

`index.html` を直接ダブルクリックしても動きますが、ブラウザの制限で読み込み進捗が出なかったり
動画を読めない場合があるため、簡易サーバー経由での起動を推奨します。

```bash
# Python が入っていれば
python3 -m http.server 8000

# または Node.js
npx http-server -p 8000
```

ブラウザで <http://localhost:8000> を開き、読み込み完了後に「スタート」を押します。

### 操作

- 画面下部の **A / B** ボタンをクリック（キーボードの `A` `B` キーでも選択可）
- 結末画面の「最初に戻る」で最初から

## 動画が30MBを超えるとき

このプレイヤー自体にサイズ上限はありませんが、全動画を先読みする都合上、
5本の合計が大きいほど最初の読み込み時間が延びます。共有やアップロードの制限に
引っかかる場合も含め、ffmpeg で軽くしておくのがおすすめです。

```bash
# 画質を保ちつつ圧縮（-crf の数値を上げるほど軽くなる: 23 → 28 → 32）
ffmpeg -i input.mp4 -c:v libx264 -crf 28 -preset slow -c:a aac -b:a 128k output.mp4

# 解像度も下げる（720p 化）。効果が大きい
ffmpeg -i input.mp4 -vf scale=-2:720 -c:v libx264 -crf 28 -c:a aac -b:a 128k output.mp4
```

Web 公開時に元動画の容量が問題になる場合は、Cloudflare Stream や Mux などの
配信サービスに置き、`app.js` の読み込み先をその URL に差し替える方法もあります。

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
  bakuhatsu: {
    file: 'bakuhatsu',
    onEnd: { result: 'gameover' }                 // 再生終了で結末画面へ
  }
};
```

- シーンを増やす → `SCENES` にキーを追加して `next` でつなぐ
- 選択肢ボタンに説明を出す → `label` に文字を入れる
- 結末の文言を変える → `RESULTS` を編集
- 選択されないまま動画が終わったときの挙動 → `HOLD_LAST_FRAME`
  （`true` = 最後のフレームで静止 / `false` = ループ再生）

## ファイル構成

| ファイル | 役割 |
| --- | --- |
| `index.html` | 画面の骨組み（読み込み / 映像ステージ / 結末） |
| `styles.css` | 見た目 |
| `app.js` | シーン定義・プリロード・分岐制御 |
| `videos/` | 動画の置き場所（Git 管理外） |

## 仕組みのメモ

- **プリロード**: 起動時に全動画を `fetch` で最後までダウンロードし、Blob URL として
  各 `<video>` に割り当てます。進捗バーは実バイト数ベースです。
- **遅延ゼロの切り替え**: 全シーンぶんの `<video>` を最初から重ねて配置し、
  切り替えは再生開始後に不透明度を入れ替えるだけ。黒画面や再バッファが挟まりません。
  （実測の切り替え遅延は約 1ms）
- **結末表示**: 最後のフレームを背景に残したまま、暗いオーバーレイの上に文字を出します。
