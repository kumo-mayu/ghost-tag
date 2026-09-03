# ghost-tag

一人鬼ごっこ GPS Webゲーム（最小プロトタイプ）。詳細な設計方針は [CLAUDE.md](./CLAUDE.md) を参照。

スマホを持って屋外を走り、GPS上の仮想の「鬼」から音を頼りに逃げるゲーム。地図は表示しない。

## 遊び方

1. デプロイ済みのURL（GitHub Pages）をAndroid Chromeで開く
2. 位置情報の利用を許可する
3. 必要ならパラメータを調整してSTART
4. 音の頻度で鬼との距離を判断しながら走って逃げる
5. 捕獲距離以下で鬼に追いつかれるとゲームオーバー

**安全のため**、河川敷や広い空き地など、車や障害物のない安全な場所で、周囲を確認しながら遊ぶこと。走行中に画面を注視しないこと。

## なぜGitHub Pages（HTTPS）が必要か

Android ChromeのGeolocation APIとWake Lock APIは secure context（`https://` または `localhost`）でのみ動作する。`file://` で直接HTMLを開く方式では位置情報が取得できない可能性が高いため、このプロジェクトはGitHub Pagesでの配信を前提にしている。

## デプロイ（GitHub Pages）

```
gh repo create ghost-tag --public --source=. --push
gh api repos/{owner}/ghost-tag/pages -X POST -f "source[branch]=master" -f "source[path]=/"
```

有効化後、`https://<owner>.github.io/ghost-tag/` で公開される（反映まで数分かかる場合あり）。

## ローカルでの動作確認（PC上）

GPSは実機屋外でしか本質的にテストできないが、コードの動作確認だけなら任意の静的サーバーで良い。

```
npx serve .
# もしくは
python -m http.server 8000
```

`http://localhost:PORT/` はsecure context扱いなのでPCのChrome DevToolsでGeolocationをシミュレートしながら確認できる。

## 既知の制約

- 画面OFF/バックグラウンド移行時、ブラウザ側の制限でGPS更新・タイマー・音声が止まる可能性がある。プレイ中はWake Lock APIで画面点灯を維持する（対応端末のみ）。
- GPS精度は数m〜十数m程度の誤差がある前提。捕獲距離を極端に小さくしないこと。
- 詳細な設計判断・未確定パラメータは [CLAUDE.md](./CLAUDE.md) を参照。
