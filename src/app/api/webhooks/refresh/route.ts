import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { 
  subscribeYouTube, 
  subscribeTwitch, 
  getCallbackBaseUrl,
  checkTwitchLiveStatus,
  checkYouTubeLiveStatus
} from '@/lib/webhooks';

// リトライ付きの実行関数（指数バックオフ）
async function withRetry<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    console.log(`[Retry] エラー発生。残りリトライ回数: ${retries}。${delay}ms待機中...`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return withRetry(fn, retries - 1, delay * 2);
  }
}

// Basic認証チェック
function checkAuth(req: Request): boolean {
  const auth = req.headers.get('authorization');
  if (!auth?.startsWith('Basic ')) return false;
  const [user, pass] = Buffer.from(auth.slice(6), 'base64').toString().split(':');
  return user === (process.env.ADMIN_USER || 'admin') && pass === (process.env.ADMIN_PASS || 'tracker');
}

export async function POST(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: '認証が必要です' }, { status: 401 });
  }

  const host = req.headers.get('host') || '';
  const isProduction = !host.includes('localhost');

  if (!isProduction) {
    return NextResponse.json({ error: 'ローカル環境では実行できません（本番URLが必要です）' }, { status: 400 });
  }

  const baseUrl = getCallbackBaseUrl(host);
  const secret = process.env.TWITCH_WEBHOOK_SECRET || 'default-secret-change-me';

  // 全配信者を取得
  const { data: streamers, error } = await supabaseAdmin.from('streamers').select('*');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: { name: string; platform: string; success: boolean; error?: string }[] = [];

  for (const streamer of streamers || []) {
    try {
      let isLiveNow = false;
      let subscribeSuccess = false;

      if (streamer.platform === 'youtube') {
        const result = await withRetry(() => subscribeYouTube(streamer.channel_id, baseUrl));
        subscribeSuccess = result.success;
        isLiveNow = await withRetry(() => checkYouTubeLiveStatus(streamer.channel_id));
      } else if (streamer.platform === 'twitch') {
        const result = await withRetry(() => subscribeTwitch(streamer.channel_id, baseUrl, secret));
        subscribeSuccess = result.success;
        isLiveNow = await withRetry(() => checkTwitchLiveStatus(streamer.channel_id));
      }

      // データベースの状態を最新のライブ状況に同期
      const wasLive = streamer.is_live;
      await supabaseAdmin.from('streamers').update({ 
        is_live: isLiveNow,
        last_sync_status: 'success',
        last_sync_error: null,
        last_sync_at: new Date().toISOString()
      }).eq('id', streamer.id);

      // 配信終了を検知した場合、履歴を閉じる
      if (wasLive && !isLiveNow) {
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
      }

      results.push({ 
        name: streamer.name, 
        platform: streamer.platform, 
        success: subscribeSuccess 
      });
    } catch (e: any) {
      // エラー情報をDBに記録
      await supabaseAdmin.from('streamers').update({ 
        last_sync_status: 'error',
        last_sync_error: e.message,
        last_sync_at: new Date().toISOString()
      }).eq('id', streamer.id);

      results.push({ 
        name: streamer.name, 
        platform: streamer.platform, 
        success: false, 
        error: e.message 
      });
    }
  }

  const successCount = results.filter(r => r.success).length;
  const failCount = results.filter(r => !r.success).length;

  return NextResponse.json({
    message: `${successCount}件成功 / ${failCount}件失敗 (ライブ状況も同期しました)`,
    results,
  });
}
