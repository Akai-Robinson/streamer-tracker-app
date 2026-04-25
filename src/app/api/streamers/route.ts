import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { 
  subscribeYouTube, 
  subscribeTwitch, 
  resolveTwitchUserId, 
  getCallbackBaseUrl,
  checkTwitchLiveStatus,
  checkYouTubeLiveStatus
} from '@/lib/webhooks';

// @ユーザー名からYouTube ID (UC...) を抽出するユーティリティ関数
async function resolveYouTubeChannelId(handle: string) {
  try {
    const res = await fetch(`https://www.youtube.com/${handle}`);
    if (!res.ok) return null;
    const html = await res.text();
    const match = html.match(/channelId":"(UC[^"]+)"/) || html.match(/<meta itemprop="channelId" content="(UC[^"]+)">/);
    if (match && match[1]) return match[1];
    return null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  try {
    const { name, platform, agency, channelIdOrHandle } = await req.json();

    if (!name || !platform || !channelIdOrHandle) {
      return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400 });
    }

    let channelId = channelIdOrHandle;

    // YouTubeの場合、@から始まっていたら裏側で自動ID変換
    if (platform === 'youtube' && channelId.startsWith('@')) {
      const resolved = await resolveYouTubeChannelId(channelId);
      if (!resolved) {
        return NextResponse.json({ error: 'YouTubeチャンネルIDが自動で見つかりませんでした。' }, { status: 400 });
      }
      channelId = resolved;
    }

    // Twitchの場合、ログイン名から数値のユーザーIDを自動解決
    if (platform === 'twitch' && !/^\d+$/.test(channelId)) {
      const resolved = await resolveTwitchUserId(channelId);
      if (!resolved) {
        return NextResponse.json({ error: 'TwitchユーザーIDの自動取得に失敗しました。TWITCH_CLIENT_IDが設定されているか確認してください。' }, { status: 400 });
      }
      channelId = resolved;
    }

    // 1. Supabaseへ登録
    const { data: streamer, error } = await supabaseAdmin.from('streamers').upsert({
      name,
      platform,
      channel_id: channelId,
      agency: agency || '未設定'
    }, { onConflict: 'channel_id' }).select().single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 2. Webhook購読と初期状態の確認
    const host = req.headers.get('host') || '';
    const isProduction = !host.includes('localhost');
    let isLiveNow = false;

    // 現在のライブ状況を即座に確認
    try {
      if (platform === 'youtube') {
        isLiveNow = await checkYouTubeLiveStatus(channelId);
      } else if (platform === 'twitch') {
        isLiveNow = await checkTwitchLiveStatus(channelId);
      }

      // ライブ中ならデータベースの状態を即座に更新
      if (isLiveNow) {
        await supabaseAdmin.from('streamers').update({ is_live: true }).eq('id', streamer.id);
        streamer.is_live = true;
      }
    } catch (e) {
      console.error('Initial status check failed:', e);
    }

    // Webhook登録（本番環境のみ）
    if (isProduction) {
      const baseUrl = getCallbackBaseUrl(host);
      const secret = process.env.TWITCH_WEBHOOK_SECRET || 'default-secret-change-me';

      if (platform === 'youtube') {
        const result = await subscribeYouTube(channelId, baseUrl);
        if (!result.success) console.warn('[YouTube Webhook]', result.error);
        else console.log(`[YouTube Webhook] ${name} の購読を登録しました`);
      }

      if (platform === 'twitch') {
        const result = await subscribeTwitch(channelId, baseUrl, secret);
        if (!result.success) console.warn('[Twitch Webhook]', result.error);
        else console.log(`[Twitch Webhook] ${name} の購読を登録しました`);
      }
    }

    return NextResponse.json({ success: true, streamer });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 配信者一覧を取得するAPI
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('streamers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 配信者を削除するAPI (カンマ区切りで複数ID対応)
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const ids = searchParams.get('id')?.split(',') || [];

    if (ids.length === 0) return NextResponse.json({ error: 'IDが必要です' }, { status: 400 });

    const { error } = await supabaseAdmin.from('streamers').delete().in('id', ids);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 配信者の所属などを更新するAPI (PATCH)
export async function PATCH(req: Request) {
  try {
    const { id, agency } = await req.json();
    if (!id || !agency) return NextResponse.json({ error: 'IDと所属先が必要です' }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from('streamers')
      .update({ agency })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, streamer: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
