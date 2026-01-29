-- ============================================
-- Storageポリシー（参考書画像用）
-- 注意: この部分は、Storageバケット「reference-books」を作成した後に実行してください
-- ============================================

-- 既存のポリシーを削除（存在する場合）
DROP POLICY IF EXISTS "Users can upload own images" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own images" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own images" ON storage.objects;

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

-- ユーザーは自分の画像のみ削除可能
CREATE POLICY "Users can delete own images"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'reference-books' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );
