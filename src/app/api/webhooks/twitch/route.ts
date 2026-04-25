import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Twitch EventSub からのリクエストを受け取るWebhook
export async function POST(req: Request) {
  try {
    const bodyText = await req.text();
    const messageType = req.headers.get('Twitch-Eventsub-Message-Type');
    
    const body = JSON.parse(bodyText);

    // 1. TwitchからのWebhook登録時の「疎通テスト（Challenge）」への応答
    if (messageType === 'webhook_callback_verification') {
      const challenge = body.challenge;
      return new NextResponse(challenge, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }

    // 2. 実際の「配信通知 (Notification)」への応答
    if (messageType === 'notification') {
      const event = body.event;
      const subscriptionType = body.subscription.type;
      const broadcasterUserId = event.broadcaster_user_id;

      // 対象の配信者がDBに登録されているか確認
      const { data: streamer } = await supabaseAdmin
        .from('streamers')
        .select('*')
        .eq('channel_id', broadcasterUserId)
        .eq('platform', 'twitch')
        .single();

      if (!streamer) {
        // 対象でなければ無視してOKを返す（Twitch側にリトライさせないため）
        return NextResponse.json({ message: 'Ignore: Streamer not tracked' }, { status: 200 });
      }

      // --- 配信開始イベント ---
      if (subscriptionType === 'stream.online') {
        // 生配信中フラグを立てる
        await supabaseAdmin
          .from('streamers')
          .update({ is_live: true, last_live_at: new Date().toISOString() })
          .eq('id', streamer.id);

        // 新しい履歴（stream_history）を作成する
        await supabaseAdmin
          .from('stream_history')
          .insert({
            streamer_id: streamer.id,
            title: 'Twitch Live Stream', 
            archive_url: `https://www.twitch.tv/${streamer.name}`,
            agency: streamer.agency, // その瞬間の所属を記録！
            started_at: new Date().toISOString(),
            download_status: 'pending',
            transcribe_status: 'pending'
          });
      } 
      
      // --- 配信終了イベント ---
      else if (subscriptionType === 'stream.offline') {
        // 生配信中フラグを下げる
        await supabaseAdmin
          .from('streamers')
          .update({ is_live: false })
          .eq('id', streamer.id);

        // 該当配信者の「終了していない最新の履歴」を取り出し、終了時刻を入れる
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

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ message: 'Unhandled message type' }, { status: 200 });
  } catch (err) {
    console.error('Twitch Webhook Error:', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
