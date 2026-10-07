# 余白 Windows 版

ZIPをフォルダーごと展開し、`Yohaku.exe`を起動します。Windows 10/11の64ビット版に対応しています。.NETの実行環境は配布物に含まれています。

画面の表示には[Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)を使います。起動時にRuntimeが見つからないというエラーが出た場合は、Microsoftの公式サイトからEvergreen Runtimeをインストールしてください。

## 保存とファイルの受け渡し

作品、タグ、メモ、コメント、キャンバス上の位置はSQLiteの`.db`ファイルへ保存します。変更は操作のたびに保存されるため、保存ボタンを押す必要はありません。初回の保存先は`%LocalAppData%\Yohaku\library.db`です。ブラウザーのキャッシュを削除しても作品データは消えません。

画面のデータベース操作から、別の`.db`を開く、新しいデータベースを作る、別名で保存することができます。次回の起動時には最後に開いたファイルを使います。そのファイルが移動・削除されている場合は、初回の保存先を開きます。

`.db`はWeb版と共通形式です。受け渡すときは「別名で保存」でコピーを作り、相手に送ります。同じファイルをWeb版とWindows版で同時に編集しないでください。ファイルの受け渡しでは変更を自動で統合しません。二人で同時編集する場合は、Supabaseを設定したWeb版を使います。Windows版の保存先はローカルファイルです。

リンク先の作品は通常のブラウザーで開きます。リンクや外部画像を表示するときはインターネット接続が必要です。画像そのものや元の動画はデータベースにダウンロードしません。

## ソースからビルド

Node.js 24以降と.NET 10 SDKを用意し、リポジトリのルートで実行します。

```powershell
npm ci
npm run test:desktop
npm run desktop:publish
```

配布物は`desktop/publish/win-x64/`に生成されます。`Yohaku.exe`、DLL、`wwwroot`など、生成されたフォルダー全体を配布します。

画面はReactで実装し、C#のWPFアプリからWebView2で表示しています。データベース操作はC#とMicrosoft.Data.Sqliteが担当します。WebView2から呼び出せる操作を限定し、ページの送信元、入力値、更新前のリビジョンを確認します。データベースの形式は`docs/schema.sqlite.sql`が定義しています。
