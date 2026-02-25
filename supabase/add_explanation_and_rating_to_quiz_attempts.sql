-- AIクイズ履歴に解説と自己評価を保存するためのカラム追加

ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS explanation TEXT;
ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS rating TEXT CHECK (rating IN ('perfect', 'good', 'hard'));

-- 既存アプリケーションでエラーが出ないよう、念のためのポリシー再確認（既存で十分ですが明示的に）
-- quiz_attemptsテーブルのRLSポリシーは既存で設定されている想定です。
