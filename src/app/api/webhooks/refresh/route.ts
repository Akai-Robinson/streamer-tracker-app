import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { 
  subscribeYouTube, 
  subscribeTwitch, 
  getCallbackBaseUrl,
  checkTwitchLiveStatus,
  checkYouTubeLiveStatus
} from '@/lib/webhooks';

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
        const result = await subscribeYouTube(streamer.channel_id, baseUrl);
        subscribeSuccess = result.success;
        isLiveNow = await checkYouTubeLiveStatus(streamer.channel_id);
      } else if (streamer.platform === 'twitch') {
        const result = await subscribeTwitch(streamer.channel_id, baseUrl, secret);
        subscribeSuccess = result.success;
        isLiveNow = await checkTwitchLiveStatus(streamer.channel_id);
      }

      // データベースの状態を最新のライブ状況に同期
      await supabaseAdmin.from('streamers').update({ is_live: isLiveNow }).eq('id', streamer.id);

      results.push({ 
        name: streamer.name, 
        platform: streamer.platform, 
        success: subscribeSuccess 
      });
    } catch (e: any) {
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
