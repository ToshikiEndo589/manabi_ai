-- quiz_attemptsテーブルのUPDATEポリシーを追加
CREATE POLICY "Users can update own quiz attempts"
  ON quiz_attempts FOR UPDATE
  USING (auth.uid() = user_id);
