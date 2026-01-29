# 参考書機能への移行ガイド

## データベース変更

### 1. reference_booksテーブルの作成
`supabase/add_reference_books.sql`を実行してください。

### 2. Supabase Storageの設定
参考書の画像を保存するために、Supabase Storageにバケットを作成する必要があります：

1. Supabaseダッシュボード → Storage
2. 「Create bucket」をクリック
3. バケット名: `reference-books`
4. Public bucket: 有効にする
5. 作成

### 3. Storageポリシーの設定
SQL Editorで以下を実行：

```sql
-- ユーザーは自分の画像のみアップロード可能
CREATE POLICY "Users can upload own images"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'reference-books' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- ユーザーは自分の画像のみ読み取り可能
CREATE POLICY "Users can view own images"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'reference-books' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
```

## 機能変更

### 学習画面
- 科目選択 → 参考書選択に変更
- 参考書追加機能を実装
- 計測の永続化（localStorage + バックグラウンド計測）

### ホーム画面
- ストリーク表示を学習記録の下に移動
- バッジ表示を削除

### Q&A画面
- 過去の記録をlocalStorageに保存
