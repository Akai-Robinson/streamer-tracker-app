import { supabaseAdmin } from '@/lib/supabase';
import { CopyButton } from '@/components/CopyButton';

export const revalidate = 0; // SSRモード（常に最新のデータを表示）

export default async function Dashboard() {
  // DBから配信者一覧を取得（Live状態を上に表示）
  const { data: streamers } = await supabaseAdmin
    .from('streamers')
    .select('*')
    .order('is_live', { ascending: false });

  // DBから最新の配信履歴20件を取得
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
    .limit(20);

  // 時間フォーマット関数
  const formatTime = (isoString: string) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleString('ja-JP', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // 配信時間のフォーマット関数
  const formatDuration = (seconds?: number) => {
    if (!seconds) return '計測中...';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  return (
    <main className="container">
      <header className="header">
        <h1>Streamer Tracker</h1>
        <p>クリッパー向け リアルタイム配信ステータス＆アーカイブツール</p>
      </header>

      <div className="dashboard-grid">
        
        {/* Left Column: Live Status */}
        <section className="glass-panel">
          <h2 className="panel-title">📡 ライブ状況</h2>
          <div className="streamer-list">
            {(streamers || []).length === 0 ? (
              <p style={{ color: "var(--text-secondary)", textAlign: "center", padding: "20px 0" }}>
                現在登録されている配信者はいません。
              </p>
            ) : null}

            {streamers?.map((s) => (
              <div key={s.id} className="streamer-card">
                <div className="streamer-info">
                  <div className={`platform-icon ${s.platform}`}>
                    {s.platform === 'twitch' ? 'Tw' : 'Yt'}
                  </div>
                  <span className="streamer-name">{s.name}</span>
                </div>
                {s.is_live ? (
                  <span className="status-badge status-live">Live</span>
                ) : (
                  <span className="status-badge status-offline">Offline</span>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Right Column: Stream History */}
        <section className="glass-panel">
          <h2 className="panel-title">📺 配信履歴</h2>
          <div style={{ overflowX: 'auto' }}>
            <table className="history-table">
              <thead>
                <tr>
                  <th>配信者</th>
                  <th>開始日時</th>
                  <th>総配信時間</th>
                  <th>アーカイブ (VOD)</th>
                </tr>
              </thead>
              <tbody>
                {(history || []).length === 0 ? (
                  <tr>
                    <td colSpan={4} style={{ textAlign: "center", color: "var(--text-secondary)", padding: "40px 0" }}>
                      配信履歴はまだ記録されていません。
                    </td>
                  </tr>
                ) : null}

                {history?.map((record) => (
                  <tr key={record.id}>
                    <td style={{ fontWeight: 600 }}>{record.streamers?.name || 'Unknown'}</td>
                    <td>{formatTime(record.started_at)}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{formatDuration(record.duration_seconds)}</td>
                    <td>
                      {record.archive_url ? (
                        <CopyButton textToCopy={record.archive_url} />
                      ) : (
                        <span style={{ color: 'var(--text-secondary)' }}>N/A</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

      </div>
    </main>
  );
}
