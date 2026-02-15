# データベースデバッグ手順

## 1. Supabaseのダッシュボードで以下のクエリを実行してください

```sql
SELECT 
  id,
  subject,
  study_minutes,
  started_at,
  started_at AT TIME ZONE 'UTC' as started_at_utc,
  started_at AT TIME ZONE 'Asia/Tokyo' as started_at_jst,
  created_at
FROM study_logs
ORDER BY created_at DESC
LIMIT 5;
```

## 2. 確認してほしいこと

2月11日を指定して保存した学習記録の`started_at`カラムの値を教えてください。

**期待される値:**
- `started_at_utc`: 2026-02-10 12:00:00
- `started_at_jst`: 2026-02-10 21:00:00

もしこれと違う値になっている場合は、その値を教えてください。

## 3. アプリのコンソールログも確認

アプリで学習記録を保存する際に、コンソールに何かエラーが出ていないか確認してください。
