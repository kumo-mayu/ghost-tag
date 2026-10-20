# ghost-tag の仕上げ（harness の wrap-up スキルが読む）

## 確かめ方

ビルドもテストの一式も無い（素の JavaScript を GitHub Pages でそのまま配る）。

```bash
for f in src/*.js; do node --check "$f" || echo "NG: $f"; done   # 構文。NG が出なければよい
```

- 画面や動きに関わる直しをしたら、`npx serve .`（または `python -m http.server 8000`）で localhost を開き、PC の Chrome DevTools で Geolocation をシミュレートして、READY → START → RUNNING → ENDED と再スタートが通るかを見る
- GPS の誤差・音の聞こえ方・Wake Lock・画面OFF時の挙動は実機（Android Chrome）の屋外でしか確かめられない。報告では「確かめていない事」に入れる

## 直す文書

| 変えた物 | 直す文書 |
|---|---|
| 決め事・作り・パラメータの既定値・ログの形式 | `docs/spec.md`（実地テストで決まった事は「未確定事項ログ」から「決定事項ログ」へ） |
| 遊び方・既知の制約・デプロイの手順 | `README.md` |
| 守る決め事・作業の手順 | `CLAUDE.md` |

## 点検（プロジェクトだけの物。**公開リポジトリ**）

- 実地テストのログ（`ghost-tag-log-*.json`）やそれを写した JSON が無いか（`git diff --cached --name-only` に `.json` が無いか）
- 差分に実在の座標・遊んだ場所の名前が入っていないか。`git diff --cached | grep -nE '[0-9]{2,3}\.[0-9]{4,}'` で小数4桁以上の数を拾い、出たら緯度経度でないかを見る（コードの係数なら可）
- 保存したプレイエリア（スロット）の座標を、コード・試験・文書の例に使っていないか
- 外部へ送る処理（`fetch`・`XMLHttpRequest`・`sendBeacon`・`WebSocket`）が足されていないか。`git diff --cached | grep -nE 'fetch\(|XMLHttpRequest|sendBeacon|WebSocket'`（Leaflet と地図タイルの読み込みは既存の例外）
- 手元のフォルダの場所（ドライブ名やユーザー名を含む絶対パス）・IP アドレスが文書やコードに入っていないか

## 報告に書く「確かめていない事」の例

実機の GPS・屋外での音の聞こえ方・Wake Lock・画面OFF/バックグラウンド時の挙動・電池の減り
