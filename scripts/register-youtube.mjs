import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
// デプロイ済みのVercel URL
const webhookCallbackUrl = 'https://streamer-tracker-app.vercel.app/api/webhooks/youtube';

if (!supabaseUrl || !supabaseKey) {
  console.error("エラー: .env.local に Supabase の環境変数が見つかりません。");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const name = process.argv[2];
let channelIdOrHandle = process.argv[3];

if (!name || !channelIdOrHandle) {
  console.error("使い方: node scripts/register-youtube.mjs <配信者名> <YouTubeチャンネルID または @ハンドル名>");
  console.error("例: node scripts/register-youtube.mjs 渋谷ハル UC8JbL...");
  console.error("例: node scripts/register-youtube.mjs 葛葉 @kuzuha");
  process.exit(1);
}

// @ユーザーネームから、裏側の本当のチャンネルID(UC...)を自動取得する関数
async function resolveChannelId(handle) {
  try {
    const res = await fetch(`https://www.youtube.com/${handle}`);
    if (!res.ok) throw new Error(`YouTubeへのアクセスに失敗 (Status: ${res.status})`);
    
    const html = await res.text();
    // ページのソースコードから channelId を引っこ抜く
    const match = html.match(/channelId":"(UC[^"]+)"/) || 
                  html.match(/<meta itemprop="channelId" content="(UC[^"]+)">/) || 
                  html.match(/https:\/\/www\.youtube\.com\/channel\/(UC[a-zA-Z0-9_-]+)/);
    
    if (match && match[1]) {
      return match[1];
    } else {
      throw new Error("チャンネルIDが見つかりませんでした。手動でUCから始まるIDをお試しください。");
    }
  } catch (err) {
    console.error("❌ アカウントIDの自動変換エラー:", err.message);
    process.exit(1);
  }
}

async function register() {
  console.log(`\n========================================`);
  console.log(`📡 [YouTube] 配信者トラッキング登録`);
  console.log(`========================================`);

  let channelId = channelIdOrHandle;
  
  // 入力が「@」から始まっていたら自動変換処理を走らせる
  if (channelIdOrHandle.startsWith('@')) {
    console.log(`\n🔍 ${channelIdOrHandle} の本当のID (UC...) を解析中...`);
    channelId = await resolveChannelId(channelIdOrHandle);
    console.log(`✅ 解析完了！チャンネルIDは [ ${channelId} ] です`);
  }
  
  // 1. Supabaseへ登録
  console.log(`\n1. データベースに [${name}] さんを登録しています...`);
  const { data, error } = await supabase.from('streamers').upsert({
    name: name,
    platform: 'youtube',
    channel_id: channelId
  }, { onConflict: 'channel_id' }).select();

  if (error) {
    console.error("❌ DB登録エラー:", error.message);
    return;
  }
  console.log("✅ DB登録完了！(ダッシュボードに反映されます)");

  // 2. YouTube WebSubへ購読リクエスト
  console.log(`\n2. YouTube (WebSub) へWebhookの購読を申請しています...`);
  const topicUrl = `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`;
  
  const payload = new URLSearchParams({
    'hub.callback': webhookCallbackUrl,
    'hub.topic': topicUrl,
    'hub.verify': 'async',
    'hub.mode': 'subscribe'
  });

  try {
    const response = await fetch('https://pubsubhubbub.appspot.com/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: payload.toString()
    });

    if (response.ok || response.status === 202) {
      console.log("✅ Webhook購読リクエスト送信成功！");
      console.log(`\n🎉 完了: 以降、[${name}] さんが配信や動画投稿をするたびに自動でDBに保存されます。`);
    } else {
      const errText = await response.text();
      console.error(`❌ Webhook購読エラー (Status: ${response.status}):`, errText);
    }
  } catch (fetchError) {
    console.error("❌ ネットワークエラー:", fetchError);
  }
}

register();
