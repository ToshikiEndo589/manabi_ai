-- reference_booksテーブルに論理削除用のdeleted_atカラムを追加
ALTER TABLE reference_books
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- インデックスの作成（削除されていない教材の取得を高速化）
CREATE INDEX IF NOT EXISTS idx_reference_books_user_id_deleted_at 
ON reference_books(user_id, deleted_at) 
WHERE deleted_at IS NULL;
