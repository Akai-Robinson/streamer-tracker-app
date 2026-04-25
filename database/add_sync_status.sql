-- streamersテーブルに、同期の状態を保存するためのカラムを追加します
ALTER TABLE public.streamers ADD COLUMN IF NOT EXISTS last_sync_status TEXT DEFAULT 'success'; -- 'success' or 'error'
ALTER TABLE public.streamers ADD COLUMN IF NOT EXISTS last_sync_error TEXT; -- エラーメッセージの詳細
ALTER TABLE public.streamers ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMP WITH TIME ZONE; -- 最後に同期を試みた時間
