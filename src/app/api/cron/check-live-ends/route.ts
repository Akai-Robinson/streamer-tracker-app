import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { 
  checkTwitchLiveStatus,
  checkYouTubeLiveStatus
} from '@/lib/webhooks';

// リトライ付きの実行関数
async function withRetry<T>(fn: () => Promise<T>, retries = 2, delay = 500): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    await new Promise(resolve => setTimeout(resolve, delay));
    return withRetry(fn, retries - 1, delay * 1.5);
  }
}

/**
 * 終了検知専用API (軽量版)
 * 現在LIVE中の配信者のみをチェックして、終わっていたら履歴を閉じる
 */
export async function GET(req: Request) {
  // セキュリティチェック (Authorizationヘッダーの確認)
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    console.warn('[Security] 不正なCronアクセスをブロックしました');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 1. 現在LIVE中の配信者のみを取得
  const { data: streamers, error } = await supabaseAdmin
    .from('streamers')
    .select('*')
    .eq('is_live', true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!streamers || streamers.length === 0) {
    return NextResponse.json({ message: '現在LIVE中の配信者はいません。' });
  }

  console.log(`[*] ${streamers.length} 名のライブ継続を確認中...`);
  const results = [];

  for (const streamer of streamers) {
    try {
      let isStillLive = true;

      if (streamer.platform === 'youtube') {
        isStillLive = await withRetry(() => checkYouTubeLiveStatus(streamer.channel_id));
      } else if (streamer.platform === 'twitch') {
        isStillLive = await withRetry(() => checkTwitchLiveStatus(streamer.channel_id));
      }

      if (!isStillLive) {
        // 配信終了を検知
        console.log(`[!] ${streamer.name} の終了を検知しました。`);
        
        // 1. ステータス更新
        await supabaseAdmin.from('streamers').update({ 
          is_live: false,
          last_sync_status: 'success',
          last_sync_at: new Date().toISOString()
        }).eq('id', streamer.id);

        // 2. 履歴を閉じる
        const { data: history } = await supabaseAdmin
          .from('stream_history')
          .select('*')
          .eq('streamer_id', streamer.id)
          .is('ended_at', null)
          .order('started_at', { ascending: false })
          .limit(1);

        if (history && history.length > 0) {
          const endedAt = new Date();
          const startedAt = new Date(history[0].started_at);
          const durationSeconds = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);

          await supabaseAdmin
            .from('stream_history')
            .update({
              ended_at: endedAt.toISOString(),
              duration_seconds: durationSeconds
            })
            .eq('id', history[0].id);
        }
        
        results.push({ name: streamer.name, status: 'ended' });
      } else {
        results.push({ name: streamer.name, status: 'still_live' });
      }
    } catch (e: any) {
      // エラー時はログに残すが、is_liveは変えない
      console.error(`[Error] ${streamer.name} のチェックに失敗:`, e.message);
      await supabaseAdmin.from('streamers').update({ 
        last_sync_status: 'error',
        last_sync_error: e.message,
        last_sync_at: new Date().toISOString()
      }).eq('id', streamer.id);
      
      results.push({ name: streamer.name, status: 'error', error: e.message });
    }
  }

  return NextResponse.json({
    checked_count: streamers.length,
    results
  });
}

// POSTも受け付けるようにする
export const POST = GET;
