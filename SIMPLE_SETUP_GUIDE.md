# 簡単セットアップガイド

## 実行方法

### 方法1: 2回に分けて実行（推奨・安全）

#### 1回目: 基本テーブル
1. Supabaseダッシュボード → **SQL Editor**
2. 「**New query**」をクリック
3. `supabase/setup_without_storage.sql`の内容をコピー＆ペースト
4. 「**Run**」をクリック

#### 2回目: Storageバケット作成
1. Supabaseダッシュボード → **Storage**
2. 「**Create bucket**」をクリック
3. バケット名: `reference-books`
4. **Public bucket**: ✅ チェック
5. 作成

#### 3回目: Storageポリシー
1. Supabaseダッシュボード → **SQL Editor**（1回目と同じ場所）
2. 「**New query**」をクリック
3. `supabase/storage_policies.sql`の内容をコピー＆ペースト
4. 「**Run**」をクリック

### 方法2: 1回で実行（Storageバケット作成後）

**注意**: Storageバケット「reference-books」を**先に作成**してから実行してください。

1. Supabaseダッシュボード → **Storage**
   - バケット「reference-books」を作成（Public bucket: 有効）

2. Supabaseダッシュボード → **SQL Editor**
3. 「**New query**」をクリック
4. `supabase/complete_setup.sql`の内容をコピー＆ペースト
5. 「**Run**」をクリック

## まとめ

- **SQL Editor**: SQLを実行する場所（左メニュー）
- **Storage**: バケットを作成する場所（左メニュー）
- 「**Run**」ボタン: SQL Editorの右下にある実行ボタン

すべて同じSupabaseダッシュボード内で行います。
