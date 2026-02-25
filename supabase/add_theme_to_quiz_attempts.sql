-- AIクイズ履歴で正しいテーマを表示するために、テーマを記録するカラムを追加します

ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS theme TEXT;
