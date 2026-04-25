import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// 1. YouTube WebSub (PubSubHubbub) からの「疎通確認 (GET)」に応答する
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get('hub.mode');
  const challenge = searchParams.get('hub.challenge');

  if (mode === 'subscribe' || mode === 'unsubscribe') {
    return new NextResponse(challenge, {
      status: 200,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  return new NextResponse('OK', { status: 200 });
}

// 2. 実際の「動画公開/配信通知 (POST)」を受け取る
export async function POST(req: Request) {
  try {
    const xmlText = await req.text();
    console.log("YouTube Webhook Payload Received:", xmlText);
    
    // YouTubeの通知はXMLで届くため、MVPとして正規表現で簡易的にIDを抽出します。
    // （将来的に xml2js などで本格パース可能）
    const channelIdMatch = xmlText.match(/<yt:channelId>(.*?)<\/yt:channelId>/);
    const videoIdMatch = xmlText.match(/<yt:videoId>(.*?)<\/yt:videoId>/);

    if (!channelIdMatch) {
        return new NextResponse('Ignore: No channel ID included', { status: 200 });
    }

    const channelId = channelIdMatch[1];
    const videoId = videoIdMatch?.[1] || null;
    
    // DBから対象の配信者か確認
    const { data: streamer } = await supabaseAdmin
      .from('streamers')
      .select('*')
      .eq('channel_id', channelId)
      .eq('platform', 'youtube')
      .single();

    if (!streamer) {
        return new NextResponse('Ignore: Streamer not tracked', { status: 200 });
    }

    // YouTube WebSub は「配信開始時」ならず「動画のメタデータ更新時」にもPingが飛んできます。
    // そのため「配信終了」を厳密に検知するのは難しい仕様です。（別途YouTube Data APIのポーリングが必要）
    // 今回のMVPでは、Pingが飛んできたら「アクティブ」とみなし履歴を起こしておきます。
    if (videoId) {
        // すでに保存済みのVODリンクではないかチェック
        const { data: existing } = await supabaseAdmin
          .from('stream_history')
          .select('id')
          .eq('archive_url', `https://youtube.com/watch?v=${videoId}`)
          .single();
          
        if (!existing) {
            // 新規の動画・配信通知として履歴に追加
            await supabaseAdmin.from('stream_history').insert({
                streamer_id: streamer.id,
                title: 'YouTube Stream / Upload', // 本格実装ならAPIから取得
                archive_url: `https://youtube.com/watch?v=${videoId}`,
                agency: streamer.agency, // その瞬間の所属を記録！
                started_at: new Date().toISOString()
            });
            // 配信中フラグを建てる (YouTubeの特性上終了は自動で検知しにくいため簡易実装)
            await supabaseAdmin.from('streamers').update({ 
              is_live: true, 
              last_live_at: new Date().toISOString() 
            }).eq('id', streamer.id);
        }
    }

    return new NextResponse('OK', { status: 200 });
  } catch (err) {
    console.error('YouTube Webhook Error:', err);
    return new NextResponse('Error', { status: 500 });
  }
}
