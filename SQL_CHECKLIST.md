# SQL実行チェックリスト

## あなたのSQLについて

提供されたSQLは**ほぼ正しい**ですが、以下の点を確認・修正してください：

### ✅ 正しい部分
- テーブル作成
- RLSポリシー
- インデックス
- exam_dateの追加

### ⚠️ 修正が必要な部分

1. **Storageポリシー**
   - バケット「reference-books」が存在しない場合、エラーになります
   - **先にStorageバケットを作成してから**、Storageポリシーを実行してください
   - または、Storageポリシー部分を別のSQLファイルに分ける

2. **reference_booksテーブルのupdated_at自動更新**
   - トリガーが不足しています
   - 追加が必要です

3. **Storageポリシーの削除権限**
   - 削除ポリシーも追加することを推奨します

## 推奨実行手順

### ステップ1: 基本テーブルとポリシー
```sql
-- あなたのSQLから、Storageポリシー部分を除いたものを実行
```

### ステップ2: Storageバケットの作成
1. Supabaseダッシュボード → Storage
2. 「Create bucket」をクリック
3. バケット名: `reference-books`
4. Public bucket: **有効にする**
5. 作成

### ステップ3: Storageポリシー
```sql
-- ユーザーは自分の画像のみアップロード可能
CREATE POLICY IF NOT EXISTS "Users can upload own images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'reference-books' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- ユーザーは自分の画像のみ読み取り可能
CREATE POLICY IF NOT EXISTS "Users can view own images"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'reference-books' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- ユーザーは自分の画像のみ削除可能
CREATE POLICY IF NOT EXISTS "Users can delete own images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'reference-books' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
```

## 完全版SQL

`supabase/complete_setup.sql`に完全版を作成しました。こちらを使用することを推奨します。
