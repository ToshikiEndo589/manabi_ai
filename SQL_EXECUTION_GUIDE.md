# SQL実行ガイド

## 「実行」とは？

Supabaseダッシュボードの**SQL Editor**でSQLを実行することです。

## 実行手順（詳細）

### ステップ1: 基本テーブルの作成

1. Supabaseダッシュボードにアクセス
   - https://supabase.com/dashboard
   - プロジェクトを選択

2. **SQL Editor**を開く
   - 左メニューから「**SQL Editor**」をクリック

3. **新しいクエリを作成**
   - 「**New query**」ボタンをクリック

4. **SQLをコピー＆ペースト**
   - `supabase/complete_setup.sql`の内容をすべてコピー
   - SQL Editorのテキストエリアに貼り付け

5. **実行**
   - 右下の「**Run**」ボタンをクリック（または `Ctrl+Enter` / `Cmd+Enter`）

6. **結果を確認**
   - 成功メッセージが表示されればOK
   - エラーが出た場合は、エラーメッセージを確認

### ステップ2: Storageバケットの作成

1. Supabaseダッシュボードで、左メニューから「**Storage**」をクリック

2. 「**Create bucket**」ボタンをクリック

3. 設定を入力：
   - **Name**: `reference-books`
   - **Public bucket**: ✅ **チェックを入れる**（重要！）
   - その他はデフォルトのままでOK

4. 「**Create bucket**」をクリック

### ステップ3: Storageポリシーの設定

**ステップ1と同じ場所（SQL Editor）で実行します**

1. **SQL Editor**を開く（ステップ1と同じ場所）

2. **新しいクエリを作成**
   - 「**New query**」ボタンをクリック
   - または、既存のクエリをクリア

3. **SQLをコピー＆ペースト**
   - `supabase/storage_policies.sql`の内容をすべてコピー
   - SQL Editorのテキストエリアに貼り付け

4. **実行**
   - 右下の「**Run**」ボタンをクリック

5. **結果を確認**
   - 成功メッセージが表示されればOK

## まとめ

- **ステップ1**: SQL Editorで `complete_setup.sql` を実行
- **ステップ2**: Storage画面でバケットを作成（SQL Editorではない）
- **ステップ3**: SQL Editorで `storage_policies.sql` を実行（ステップ1と同じ場所）

すべて同じSupabaseダッシュボード内で行いますが、場所が違います：
- **SQL Editor**: SQLを実行する場所
- **Storage**: バケットを作成する場所
