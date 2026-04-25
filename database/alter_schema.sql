-- `streamers` テーブルに所属箱（グループ）を管理するための `agency` カラムを追加します。
ALTER TABLE public.streamers ADD COLUMN IF NOT EXISTS agency TEXT DEFAULT '未設定';

-- すでに登録されているデータがあれば、とりあえず「未設定」か「個人勢」として初期化します
UPDATE public.streamers SET agency = '未設定' WHERE agency IS NULL;
