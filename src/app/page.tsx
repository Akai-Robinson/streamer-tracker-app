import { supabaseAdmin } from '@/lib/supabase';
import DashboardClient from '@/components/DashboardClient';

export const revalidate = 0; // SSRモード（常に最新のデータを表示）

export default async function Dashboard() {
  // DBから配信者一覧を取得（Live状態を上に表示）
  const { data: streamers } = await supabaseAdmin
    .from('streamers')
    .select('*')
    .order('is_live', { ascending: false });

  // DBから最新の配信履歴100件を取得 (フィルタリング用に少し多めに取得)
  const { data: history } = await supabaseAdmin
    .from('stream_history')
    .select(`
      *,
      streamers (
        name,
        platform
      )
    `)
    .order('started_at', { ascending: false })
    .limit(100);

  return (
    <main className="container">
      <header className="header">
        <h1>Streamer Tracker</h1>
        <p>クリッパー向け リアルタイム配信ステータス＆アーカイブツール</p>
      </header>

      <DashboardClient 
        initialStreamers={streamers || []} 
        initialHistory={history || []} 
      />
    </main>
  );
}
