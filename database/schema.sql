-- 拡張機能「uuid-ossp」が有効になっていない場合は有効にする
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- streamers テーブル: 追跡対象の配信者を管理するテーブル
CREATE TABLE public.streamers (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    name TEXT NOT NULL,                                           -- 配信者の名前
    platform TEXT NOT NULL CHECK (platform IN ('youtube', 'twitch')), -- プラットフォーム
    channel_id TEXT NOT NULL UNIQUE,                              -- YouTubeのチャンネルID または TwitchのユーザーID
    is_live BOOLEAN DEFAULT FALSE,                                -- 現在配信中かどうかのフラグ
    last_live_at TIMESTAMP WITH TIME ZONE,                        -- 最後に配信を開始(または状態が変わった)日時
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- stream_history テーブル: 配信の履歴と関連メタデータ(機能拡張用)を持たせるテーブル
CREATE TABLE public.stream_history (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    streamer_id UUID REFERENCES public.streamers(id) ON DELETE CASCADE NOT NULL,
    title TEXT,                                                   -- 配信のタイトル
    archive_url TEXT,                                             -- VOD / アーカイブのリンク
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,                 -- 配信開始日時
    ended_at TIMESTAMP WITH TIME ZONE,                            -- 配信終了日時
    duration_seconds INTEGER,                                     -- 総配信時間（秒）
    -- 将来の拡張用フラグ（ダウンロードや文字起こし連携用）
    download_status TEXT DEFAULT 'pending' CHECK (download_status IN ('pending', 'processing', 'completed', 'failed')),
    transcribe_status TEXT DEFAULT 'pending' CHECK (transcribe_status IN ('pending', 'processing', 'completed', 'failed')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- RLS (Row Level Security) の設定（必要に応じて）
-- 今回はWebhookAPIから安全に書き込み、フロントから読み取るため一時的に無効（または適切なポリシー）に設定します。
-- 初期設定では無効化して利用します（Supabaseのダッシュボードで設定可能）
