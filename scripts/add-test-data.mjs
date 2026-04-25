import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const DUMMY_PREFIX = '【TEST】';

async function run() {
  const argument = process.argv[2];

  // 削除モード
  if (argument === 'delete') {
    console.log("🗑️ テストデータを削除しています...");
    // 名前に 【TEST】 が含まれる配信者を削除（CASCADEで履歴も一緒に消えます）
    const { error } = await supabase.from('streamers').delete().like('name', `${DUMMY_PREFIX}%`);
    if (error) {
      console.error("❌ 削除エラー:", error.message);
    } else {
      console.log("✅ 削除完了！ダッシュボードからテストデータが消えました。");
    }
    return;
  }

  // 挿入モード
  console.log("🧪 テストデータ（架空の箱と配信者）を注入しています...");
  
  const testStreamers = [
    { name: `${DUMMY_PREFIX}にじさんじ太郎`, platform: 'youtube', channel_id: 'test_nijs_1', agency: 'にじさんじ', is_live: true, last_live_at: new Date().toISOString() },
    { name: `${DUMMY_PREFIX}ぶいすぽ花子`, platform: 'youtube', channel_id: 'test_vspo_1', agency: 'ぶいすぽっ！', is_live: true, last_live_at: new Date().toISOString() },
    { name: `${DUMMY_PREFIX}ホロライブ次郎`, platform: 'twitch', channel_id: 'test_holo_1', agency: 'ホロライブ', is_live: false, last_live_at: new Date(Date.now() - 1000000).toISOString() },
    { name: `${DUMMY_PREFIX}個人丸`, platform: 'twitch', channel_id: 'test_indie_1', agency: '個人勢', is_live: false, last_live_at: new Date(Date.now() - 5000000).toISOString() },
    { name: `${DUMMY_PREFIX}にじさんじ三郎`, platform: 'youtube', channel_id: 'test_nijs_2', agency: 'にじさんじ', is_live: false, last_live_at: new Date(Date.now() - 8000000).toISOString() },
  ];

  for (const s of testStreamers) {
    // 配信者を登録
    const { data: streamer, error } = await supabase.from('streamers').upsert(s, { onConflict: 'channel_id' }).select().single();
    
    if (!error && streamer) {
      // ダミーの配信履歴を追加
      await supabase.from('stream_history').insert([
        {
          streamer_id: streamer.id,
          title: `テスト配信 - ${streamer.name} がゲームやってるよ`,
          archive_url: 'https://youtube.com/watch?v=TEST_VIDEO_123',
          started_at: new Date(Date.now() - 7200000).toISOString(), // 2時間前スタート
          ended_at: streamer.is_live ? null : new Date(Date.now() - 3600000).toISOString(), // 1時間前終了（オフライン時）
          duration_seconds: streamer.is_live ? null : 3600,
          download_status: 'pending',
          transcribe_status: 'pending'
        }
      ]);
    }
  }

  console.log("\n✅ テストデータの注入が完了しました！");
  console.log("👉 `localhost:3000` などのダッシュボードをリロードして確認してみてください。");
  console.log("\n💡 テストデータを一括削除したい場合は以下のコマンドを実行してください:");
  console.log("   node scripts/add-test-data.mjs delete");
}

run();
