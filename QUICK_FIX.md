# クイック修正: exam_dateカラムの追加

## エラーについて
「policy "Users can view own profile" for table "profiles" already exists」というエラーは、既にテーブルとポリシーが存在するためです。

## 解決方法

既にテーブルが作成されている場合は、**exam_dateカラムの追加部分だけ**を実行してください。

### 手順

1. Supabaseダッシュボード → SQL Editor
2. 「New query」をクリック
3. 以下のSQLをコピー＆ペースト：

```sql
-- profilesテーブルに試験日（exam_date）カラムを追加
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS exam_date DATE;

-- 既存のユーザーにはデフォルトで2026年2月1日を設定（必要に応じて変更）
UPDATE profiles 
SET exam_date = '2026-02-01' 
WHERE exam_date IS NULL;
```

4. 「Run」をクリック

これで`exam_date`カラムが追加され、既存のユーザーにはデフォルトで2026年2月1日が設定されます。
