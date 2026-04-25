'use client';
import { useState, useEffect } from 'react';
import { CopyButton } from './CopyButton';

export default function DashboardClient({ initialStreamers, initialHistory }: { initialStreamers: any[], initialHistory: any[] }) {
  const [filterStreamerId, setFilterStreamerId] = useState<string | null>(null);
  const [filterAgency, setFilterAgency] = useState<string | null>(null);
  const [collapsedAgencies, setCollapsedAgencies] = useState<string[]>([]);
  const [agencyOrder, setAgencyOrder] = useState<string[]>([]);
  const [draggingAgency, setDraggingAgency] = useState<string | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'started_at', direction: 'desc' });

  // 時間フォーマット関数
  const formatTime = (isoString: string) => {
    if (!isoString) return '-';
    return new Date(isoString).toLocaleString('ja-JP', {
      month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  // 配信時間のフォーマット関数
  const formatDuration = (seconds?: number) => {
    if (!seconds) return '計測中...';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  };

  // 初期化時に保存された並び順と折り畳み状態を読み込む
  useEffect(() => {
    const savedOrder = localStorage.getItem('agencyOrder');
    if (savedOrder) setAgencyOrder(JSON.parse(savedOrder));
  }, []);

  // 履歴のソート関数
  const sortHistory = (history: any[]) => {
    return [...history].sort((a, b) => {
      const aVal = a[sortConfig.key];
      const bVal = b[sortConfig.key];
      if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  // データを整理する関数（並び順を考慮）
  const organizeStreamers = (list: any[]) => {
    const grouped = list.reduce((acc, s) => {
      const agency = s.agency || '未設定';
      if (!acc[agency]) acc[agency] = [];
      acc[agency].push(s);
      return acc;
    }, {} as Record<string, any[]>);

    const allAgenciesInList = Array.from(new Set(initialStreamers.map(s => s.agency || '未設定')));
    const completeOrder = [...agencyOrder];
    allAgenciesInList.forEach(a => {
      if (!completeOrder.includes(a)) completeOrder.push(a);
    });

    const sortedKeys = completeOrder.filter(key => grouped[key]);
    return sortedKeys.map(key => ({ agency: key, list: grouped[key] }));
  };

  const liveStreamersGrouped = organizeStreamers(initialStreamers.filter(s => s.is_live));
  const offlineStreamersGrouped = organizeStreamers(initialStreamers.filter(s => !s.is_live));

  const handleDragStart = (agency: string) => {
    setDraggingAgency(agency);
  };

  const handleDragEnter = (targetAgency: string) => {
    if (!draggingAgency || draggingAgency === targetAgency) return;
    const allAgencies = Array.from(new Set(initialStreamers.map(s => s.agency || '未設定')));
    const currentOrder = agencyOrder.length > 0 ? [...agencyOrder] : allAgencies;
    const draggingIndex = currentOrder.indexOf(draggingAgency);
    const targetIndex = currentOrder.indexOf(targetAgency);
    if (draggingIndex === -1 || targetIndex === -1) return;
    const newOrder = [...currentOrder];
    newOrder.splice(draggingIndex, 1);
    newOrder.splice(targetIndex, 0, draggingAgency);
    setAgencyOrder(newOrder);
  };

  const handleDragEnd = () => {
    setDraggingAgency(null);
    localStorage.setItem('agencyOrder', JSON.stringify(agencyOrder));
  };

  // ドラッグ関連のイベント
  const onDragStart = (e: React.DragEvent, agency: string) => {
    e.dataTransfer.setData('agency', agency);
  };

  const onDrop = (e: React.DragEvent, targetAgency: string) => {
    const draggedAgency = e.dataTransfer.getData('agency');
    if (draggedAgency === targetAgency) return;

    // 現在の全ての箱リストを作成
    const allAgencies = Array.from(new Set(initialStreamers.map(s => s.agency || '未設定')));
    const currentOrder = agencyOrder.length > 0 ? agencyOrder : allAgencies;

    const newOrder = [...currentOrder.filter(a => a !== draggedAgency)];
    const targetIndex = newOrder.indexOf(targetAgency);
    newOrder.splice(targetIndex, 0, draggedAgency);

    setAgencyOrder(newOrder);
    localStorage.setItem('agencyOrder', JSON.stringify(newOrder));
  };

  // 履歴をフィルタリング
  let filteredHistory = initialHistory.filter(h => {
    if (filterStreamerId) return h.streamer_id === filterStreamerId;
    if (filterAgency) return h.agency === filterAgency;
    return true;
  });

  // 履歴をソート
  filteredHistory = [...filteredHistory].sort((a, b) => {
    const key = sortConfig.key;
    let valA: any = a[key];
    let valB: any = b[key];

    // 配信者名でソートする場合の特殊処理
    if (key === 'streamer') {
      valA = a.streamers?.name || '';
      valB = b.streamers?.name || '';
    }
    // 終了日時の計算値でソートする場合
    if (key === 'ended_at' && !a.ended_at) {
      valA = new Date(new Date(a.started_at).getTime() + (a.duration_seconds || 0) * 1000).toISOString();
      valB = new Date(new Date(b.started_at).getTime() + (b.duration_seconds || 0) * 1000).toISOString();
    }

    if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
    if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const handleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'desc' ? 'asc' : 'desc'
    }));
  };

  const handleAgencyClick = (agency: string) => {
    setFilterStreamerId(null);
    setFilterAgency(prev => prev === agency ? null : agency);
  };

  const toggleCollapse = (agency: string) => {
    setCollapsedAgencies(prev => 
      prev.includes(agency) ? prev.filter(a => a !== agency) : [...prev, agency]
    );
  };

  const handleStreamerClick = (id: string) => {
    setFilterAgency(null);
    setFilterStreamerId(prev => prev === id ? null : id);
  };

  const SortIcon = ({ k }: { k: string }) => {
    if (sortConfig.key !== k) return <span style={{ opacity: 0.2, marginLeft: '5px', fontSize: '0.7rem' }}>↕</span>;
    return <span style={{ color: 'var(--accent-hover)', marginLeft: '5px', fontSize: '0.7rem' }}>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div className="dashboard-grid">
      
      {/* Left Column: Live Status */}
      <section className="glass-panel">
        <h2 className="panel-title">ライブ状況</h2>
        <div className="streamer-list" style={{ gap: '20px', display: 'flex', flexDirection: 'column' }}>
          
          {/* --- GLOBAL LIVE SECTION --- */}
          <div className="status-container live-container">
            <div className="container-label">
              <span className="status-dot live-dot"></span>Live
            </div>
            {liveStreamersGrouped.length === 0 ? (
              <p style={{ color: "var(--text-secondary)", textAlign: "center", fontSize: '0.85rem', padding: '10px 0' }}>
                現在ライブ中の配信者はいません
              </p>
            ) : (
              liveStreamersGrouped.map(({ agency, list }: any) => (
                <div 
                  key={agency} 
                  className={`agency-sub-group ${draggingAgency === agency ? 'dragging-item' : ''}`} 
                  style={{ marginBottom: '15px' }}
                  draggable
                  onDragStart={() => handleDragStart(agency)}
                  onDragEnter={() => handleDragEnter(agency)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => e.preventDefault()}
                >
                  <div 
                    className={`agency-header-box ${filterAgency === agency ? 'active-filter-agency' : ''}`}
                    onClick={() => handleAgencyClick(agency)}
                    style={{ marginLeft: '10px' }}
                  >
                    <h3 className="agency-title">{agency}</h3>
                  </div>
                  <div className="agency-streamers-wrapper" style={{ marginLeft: '35px' }}>
                    {list.map((s: any) => <StreamerCard key={s.id} s={s} isFilter={filterStreamerId === s.id} onClick={() => handleStreamerClick(s.id)} />)}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* --- GLOBAL OFFLINE SECTION --- */}
          <div className="status-container offline-container">
            <div className="container-label">
              <span className="status-dot offline-dot"></span>Offline
            </div>
            {offlineStreamersGrouped.map(({ agency, list }: any) => {
              const isCollapsed = collapsedAgencies.includes(agency);
              const isDragging = draggingAgency === agency;
              const isAgencyFiltered = filterAgency === agency;
              return (
                <div 
                  key={agency} 
                  className={`agency-sub-group ${isDragging ? 'dragging-item' : ''}`} 
                  style={{ marginBottom: '12px' }}
                  draggable
                  onDragStart={() => handleDragStart(agency)}
                  onDragEnter={() => handleDragEnter(agency)}
                  onDragEnd={handleDragEnd}
                  onDragOver={(e) => e.preventDefault()}
                >
                  <div 
                    className={`agency-header-box collapsible-header ${isAgencyFiltered ? 'active-filter-agency' : ''}`}
                    style={{ paddingRight: '10px', marginLeft: '10px' }}
                  >
                    <h3 className="agency-title" onClick={() => handleAgencyClick(agency)} style={{ flex: 1 }}>{agency}</h3>
                    <button 
                      className="collapse-btn"
                      onClick={(e) => { e.stopPropagation(); toggleCollapse(agency); }}
                    >
                      {isCollapsed ? '▼' : '▲'}
                    </button>
                  </div>
                  {!isCollapsed && (
                    <div className="agency-streamers-wrapper" style={{ marginTop: '5px', marginLeft: '35px' }}>
                      {list.map((s: any) => <StreamerCard key={s.id} s={s} isFilter={filterStreamerId === s.id} onClick={() => handleStreamerClick(s.id)} />)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Right Column: Stream History */}
      <section className="glass-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 className="panel-title" style={{ marginBottom: 0 }}>配信履歴</h2>
        </div>
        
        <div style={{ overflowX: 'auto' }}>
          <table className="history-table">
            <thead>
              <tr>
                <th onClick={() => handleSort('streamer')} style={{ cursor: 'pointer' }}>
                  配信者 <SortIcon k="streamer" />
                </th>
                <th onClick={() => handleSort('started_at')} style={{ cursor: 'pointer' }}>
                  開始日時 <SortIcon k="started_at" />
                </th>
                <th onClick={() => handleSort('ended_at')} style={{ cursor: 'pointer' }}>
                  終了日時 <SortIcon k="ended_at" />
                </th>
                <th onClick={() => handleSort('duration_seconds')} style={{ cursor: 'pointer' }}>
                  総配信時間 <SortIcon k="duration_seconds" />
                </th>
                <th>アーカイブ (VOD)</th>
              </tr>
            </thead>
            <tbody>
              {filteredHistory.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", color: "var(--text-secondary)", padding: "40px 0" }}>
                    配信履歴はまだ記録されていません。
                  </td>
                </tr>
              ) : null}

              {filteredHistory.map((record: any) => {
                // 終了時刻の計算（ended_at がない場合のフォールバック）
                let endTimeDisplay = '-';
                if (record.ended_at) {
                  endTimeDisplay = formatTime(record.ended_at);
                } else if (record.started_at && record.duration_seconds) {
                  const end = new Date(new Date(record.started_at).getTime() + record.duration_seconds * 1000);
                  endTimeDisplay = end.toLocaleString('ja-JP', {
                    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
                  });
                }

                return (
                  <tr key={record.id}>
                    <td style={{ fontWeight: 600 }}>{record.streamers?.name || 'Unknown'}</td>
                    <td>{formatTime(record.started_at)}</td>
                    <td>{endTimeDisplay}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{formatDuration(record.duration_seconds)}</td>
                    <td>
                      {record.archive_url ? (
                        <CopyButton textToCopy={record.archive_url} />
                      ) : (
                        <span style={{ color: 'var(--text-secondary)' }}>N/A</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

    </div>
  );
}

function StreamerCard({ s, isFilter, onClick }: { s: any, isFilter: boolean, onClick: () => void }) {
  return (
    <div 
      className={`streamer-card ${isFilter ? 'active-filter' : ''}`}
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      <div className="streamer-info">
        <div className={`platform-icon ${s.platform}`}>
          {s.platform === 'twitch' ? 'Tw' : 'YT'}
        </div>
        <span className="streamer-name" style={{ color: isFilter ? 'var(--accent-hover)' : 'inherit' }}>
          {s.name}
        </span>
      </div>
    </div>
  );
}
