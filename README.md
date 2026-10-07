# 余白 — Yohaku

気になった絵・映像・写真・デザインを集めて、見返すための作品ノートです。XやYouTubeなどのリンクに、タグ、作者、観察メモ、コメントを添えられます。

[Web版を開く](https://blueberry1001.github.io/yohaku/) · [Windows版をダウンロード](https://github.com/blueberry1001/yohaku/releases/latest) · [保存・共同編集の設定](docs/SETUP.md)

## 保存先を選ぶ

| 使い方 | 保存先 |
| --- | --- |
| Windows版 | C#とSQLite。初回は `%LocalAppData%\Yohaku\library.db`。保存先を変更できます。 |
| Web版・DBファイルを選択 | PCのChrome / Edgeで、自分で選んだ `.db` ファイルに保存します。 |
| Web版・デモ | メモリ上だけで動きます。タブを閉じると変更が消えます。 |
| Web版・任意の共同編集 | SupabaseのDB。Googleログインと2人のアカウント登録が必要です。 |

作品データをブラウザのlocalStorageやIndexedDBには保存しません。Web版とWindows版は同じSQLiteファイルを使えます。同じファイルを両方で同時に編集せず、片方を閉じてから開き直してください。

設定の「新しいDB」は空のライブラリを作成します。「DBを書き出す」は現在の内容を別ファイルへ保存します。デモで試した変更を残す場合は「DBを書き出す」を選びます。Web版は開き直すたびにDBファイルを選択します。JSONでのバックアップ・追加読み込みもできます。

Windows版はリリースのZIPをフォルダーごと展開し、`Yohaku.exe`を起動します。詳しくは[Windows版の説明](desktop/README.md)を参照してください。

## 作品を整理する

- 「作品を追加」で出典リンク、タイトル、作者、種類、タグ、任意の画像URLを登録します。
- 一覧とボードを切り替え、コレクションやお気に入りで絞り込みます。
- 作品の詳細で、色・光・構図・質感などの観察メモとコメントを残します。
- 検索はタイトル、作者、タグ、メモ、コメントなどを横断します。`青 静か`のような空白区切りはAND検索です。全角半角やひらがな・カタカナの違い、一部の同義語にも対応します。

ボードではカードをドラッグして配置し、ダブルクリックで詳細を開きます。空白のドラッグ、Spaceを押しながらのドラッグ、スクロールで画面を移動できます。Ctrl＋スクロールまたは`＋`・`−`で拡大縮小し、`0`で全体を表示します。カードの位置もDBに保存します。

タイトル・タグ・分析メモは自分で入力する形式です。画像や動画のAI自動解析、X等のリンクからのサムネイル・説明の自動取得は実装していません。作品の本体を複製せず、出典リンクと任意の画像URLを保存します。

## 共同編集と無料枠

Supabaseを接続すると、許可した2人がGoogleアカウントでログインし、同じ作品・コメントを共有できます。同じ作品の変更が競合した場合は、古い内容での上書きを止めます。クラウドは初期状態では未設定です。Supabaseプロジェクトの作成とGoogle OAuthの設定手順は[SETUP.md](docs/SETUP.md)にまとめています。

2人でURLとテキストを保存する規模なら、Supabaseの無料枠で運用できる見込みです。無料プランには休止や容量の制限があるため、[公式料金表](https://supabase.com/pricing)を確認してください。外部の有料AI APIは不要です。

## 開発

Web版はNode.js 24以降、Windows版のビルドは.NET 10 SDKを使います。

```sh
npm ci
npm run dev
npm test
npm run build
```

```powershell
npm run test:desktop
npm run desktop:publish
```

画面はReact・TypeScript・Vite、Webのファイル操作はsql.js、Windowsの保存処理はC#・Microsoft.Data.Sqliteで実装しています。SQLiteのスキーマは[docs/schema.sqlite.sql](docs/schema.sqlite.sql)、任意のクラウド設定は[supabase/schema.sql](supabase/schema.sql)です。

サンプル作品の画像、アイコン、フォントの出典は[素材クレジット](docs/MEDIA-CREDITS.md)をご覧ください。サンプルの観察メモとタグは使い方を示す記入例です。
