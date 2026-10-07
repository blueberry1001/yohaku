# Yohaku の保存と共同編集

## まず使う：SQLite ファイル

Windows 版は C# と SQLite で動きます。初回起動時の保存先は `%LocalAppData%\Yohaku\library.db` です。「DBを開く」「DBを作成」「名前を付けて保存」で保存先を選べます。インストール・起動方法は `desktop/README.md` を参照してください。

Web 版も実体のある `.db` ファイルに保存できます。PC の Chrome または Edge で開き、DBファイルを作成するか、既存のファイルを選びます。以後、変更を保存するたびにファイルへ書き込みます。「DBを作成」は空のライブラリを作り、「名前を付けて保存」は現在の内容をコピーします。Web版を開き直したときは、もう一度ファイルを選びます。ファイルへの許可やパスをブラウザに永続保存しません。ブラウザの対応状況は [Chrome の File System Access API 解説](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access)を参照してください。

ファイル未選択のデモはメモリ上だけで動きます。タブを閉じると変更が消えます。作品・メモ・コメントの保存に localStorage や IndexedDB は使いません。

Windows 版とWeb版は `docs/schema.sqlite.sql` の同じ形式を使います。Web版の読み込み上限は25 MBです。別のソフトがファイルを書き換えていた場合、Web版は上書きを止めてエラーを表示します。同じDBファイルをWindows版とWeb版で同時に編集せず、片方を閉じてから開き直してください。ファイルをOneDrive等で共有する場合も同時編集には使わず、受け渡し用にしてください。

JSON書き出しも使えます。読み込みは既存データにコピーを追加し、上書きしません。上限は5 MB、作品5,000件、コメント20,000件です。バックアップは自分で保管してください。画像・動画の本体はDBに入れず、出典リンクと任意の画像URLを記録します。公開終了した作品や削除済みのリンクは復元できません。

## 2人で使う：任意の Supabase 連携

共同編集が必要になったら、Web版に Supabase を接続できます。DB・Googleログイン・変更通知をまとめて使えます。Windows版はローカルSQLiteを優先する設計です。クラウドへの切り替えはローカルDBの自動同期ではありません。移行するときはJSON書き出し・読み込みを使います。

2026年10月7日時点の [Supabase Free](https://supabase.com/pricing) はDB 500 MB、月間転送5 GB、認証50,000 MAU、Realtime月200万メッセージ・同時200接続です。1週間使われないプロジェクトは停止されることがあり、無料枠に自動バックアップは含まれません。2人でURLとテキストを保存する使い方なら、無料枠に収まる見込みです。画像や動画本体のアップロード、有料AI APIは使いません。料金と上限は変更されるため、利用開始時に公式ページを確認してください。

### 必要な設定

1. 自分の Supabase アカウントで **Free** プロジェクトを1つ作成します。
2. Supabase の SQL Editor で `supabase/schema.sql` 全体を一度実行します。新規プロジェクト用です。
3. 続けて、実際に使う2つのGoogleメールアドレスを管理者として登録します。実アドレスを公開Gitリポジトリへ記載しないでください。

```sql
insert into private.library_members (slot, email) values
  (1, 'you@gmail.com'),
  (2, 'friend@gmail.com');
```

登録は小文字のアドレスで行います。2つの枠以外はDBの制約で追加できません。変更時は管理者が `update private.library_members set email = 'new@gmail.com' where slot = 2;` を実行します。利用者からメンバー表は読み書きできません。

4. Google Cloud Console でプロジェクトとOAuthクライアントを作成します。種類は **Web application** です。Google Auth Platform の Audience に2人をテストユーザーとして登録します。必要なスコープは `openid`、メール、プロフィールだけです。
5. Googleの **Authorized JavaScript origins** に `https://YOUR_NAME.github.io` を登録します。**Authorized redirect URIs** には Supabase の Google Provider 画面に表示されるコールバックURL（通常 `https://PROJECT_REF.supabase.co/auth/v1/callback`）を登録します。
6. GoogleのClient IDとClient Secretを **Supabase側の Google Provider** に登録し、有効にします。不要なメール・匿名ログイン方式は無効にします。Client SecretはアプリのコードやGitHubには入れません。
7. Supabase **Authentication → URL Configuration** のSite URLとRedirect URLsに、GitHub Pagesの正確なURLを設定します。例：`https://YOUR_NAME.github.io/yohaku/`。末尾のスラッシュとリポジトリ名も合わせます。開発用は `http://localhost:5173/` を必要に応じて追加します。
8. `.env.example` を `.env.local` にコピーし、プロジェクトURLと **Publishable key** を入力してビルドします。古いプロジェクトのanon keyにも対応しています。

```dotenv
VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

GitHub Actionsを使う場合は、同じ名前のリポジトリVariablesからビルド時に環境変数を渡します。これら2つはブラウザへ配信する公開設定です。**service_role、Secret key、DBパスワード、Google Client Secretは使いません。** Googleの設定手順は [Supabase公式ドキュメント](https://supabase.com/docs/guides/auth/social-login/auth-google)にも載っています。

### アクセス制御と同時編集

SQLはRLSを有効にし、管理者が登録したGoogleアドレスと、Supabase側で確認済みのGoogle identityを照合します。未ログインの人や、登録されていないアカウントは作品・メモ・コメントを読み書きできません。画面でログインボタンを隠すだけの制御ではありません。根拠となる機能は [SupabaseのRLS解説](https://supabase.com/docs/guides/database/postgres/row-level-security)を参照してください。

作品ごとに更新番号を持ち、2人が同じ作品を変更した場合は古い更新番号の保存を拒否します。画面に競合メッセージが出たら、最新内容を開き直して保存します。コメントは1投稿1行で保存されるため、別の人の投稿をまとめて上書きしません。コメントの削除は投稿本人のみです。変更通知で一覧を読み直し、画面に戻ったときや通信復帰時にも取得します。文字入力中のカーソル共有やCRDTによる同時文章編集は実装していません。

クラウドのJSONインポートでは、追加操作を行ったメンバーが作品とコメントの作成者になります。元ファイルはバックアップとして残してください。Googleログインのセッション情報はSupabase SDKがブラウザに保存しますが、作品データの保存先はDBです。

### 接続後に確認すること

- 登録した2人はログインして同じ作品を読めること。
- 未ログイン状態と、登録していない別のGoogleアカウントからDBを読めないこと。
- 2画面で同じ作品を開き、片方を保存した後、もう片方の古い内容を保存すると競合になること。
- 双方がコメントを追加しても、両方の投稿が残ること。
- JSONを書き出し、コピーした環境で読み込めること。

現時点で外部のSupabaseプロジェクトやGoogle OAuth資格情報は作成していません。クラウドの接続確認には、この設定と2人のアカウントが必要です。

## 検索の範囲

タイトル・作者・タグ・説明・メモ・コレクション・コメント・種類・URLを横断検索します。空白区切りはAND検索で、全角半角、英字の大小、ひらがなとカタカナを吸収します。「青」と「ブルー」、「静か」と「静けさ」など、色・印象・構図の一部は同義語として扱います。タグとタイトルの一致を優先して表示します。

画像や動画の中身をAIで自動解析する機能は含めていません。覚えている色・構図・印象をメモやタグに残すほど探しやすくなります。X等の外部ページからのサムネイル・タイトル自動取得も行わず、公開リンクと任意の画像URLを扱います。
