# 最終セットアップ手順

## SQL実行手順

### ステップ1: 基本テーブルとポリシー
SupabaseダッシュボードのSQL Editorで、`supabase/complete_setup.sql`を実行してください。

このSQLには以下が含まれます：
- profilesテーブル
- study_logsテーブル
- reference_booksテーブル
- exam_dateカラム
- すべてのRLSポリシー
- インデックス
- トリガー

**Storageポリシーは含まれていません**（次のステップで実行）

### ステップ2: Storageバケットの作成
1. Supabaseダッシュボード → **Storage**
2. 「**Create bucket**」をクリック
3. バケット名: `reference-books`
4. **Public bucket**: ✅ 有効にする
5. 「**Create bucket**」をクリック

### ステップ3: Storageポリシーの設定
Storageバケット作成後、`supabase/storage_policies.sql`を実行してください。

これで完了です！

## エラーが出た場合

### 「policy already exists」エラー
- 既にポリシーが存在する場合は、`DROP POLICY`文で削除してから再実行してください

### 「bucket does not exist」エラー
- Storageバケット「reference-books」が作成されていない可能性があります
- ステップ2を先に実行してください
