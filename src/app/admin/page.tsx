'use client';
import { useState, useEffect, useRef } from 'react';

export default function AdminPage() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [streamers, setStreamers] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'date' | 'agency'>('date');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [agencies, setAgencies] = useState<string[]>([]);
  const [isNewAgency, setIsNewAgency] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 配信者一覧を読み込む
  const fetchStreamers = async () => {
    const res = await fetch('/api/streamers');
    if (res.ok) {
      const data = await res.json();
      setStreamers(data);
      // 既存のユニークな箱リストを作成
      const uniqueAgencies = Array.from(new Set(data.map((s: any) => s.agency || '個人勢'))) as string[];
      setAgencies(uniqueAgencies);
    }
  };

  useEffect(() => {
    fetchStreamers();
  }, []);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setMsg('');
    const fd = new FormData(e.currentTarget);
    const body = {
      name: fd.get('name'),
      platform: fd.get('platform'),
      agency: isNewAgency ? fd.get('new_agency') : fd.get('agency'),
      channelIdOrHandle: fd.get('channelId')
    };

    try {
      const res = await fetch('/api/streamers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const result = await res.json();
      if (!res.ok) {
        setMsg('❌ ' + result.error);
      } else {
        setMsg(`✅ ${result.streamer.name} さんを登録しました！`);
        (e.target as HTMLFormElement).reset();
        setIsNewAgency(false);
        fetchStreamers();
      }
    } catch (err) {
      setMsg('❌ 通信エラーが発生しました。');
    }
    setLoading(false);
  };

  const deleteSelected = async () => {
    if (selectedIds.length === 0) return;
    if (!confirm(`${selectedIds.length} 名をまとめて削除しますか？\n(過去の履歴もすべて削除されます)`)) return;
    
    setLoading(true);
    const res = await fetch(`/api/streamers?id=${selectedIds.join(',')}`, { method: 'DELETE' });
    if (res.ok) {
      setMsg(`${selectedIds.length} 名の削除を完了しました。`);
      setSelectedIds([]);
      fetchStreamers();
    } else {
      alert('削除に失敗しました。');
    }
    setLoading(false);
  };

  const updateAgency = async (id: string, newAgency: string) => {
    const res = await fetch('/api/streamers', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, agency: newAgency })
    });
    if (res.ok) {
      setMsg('所属先を更新しました。');
      fetchStreamers();
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const refreshWebhooks = async () => {
    if (!confirm('全配信者のWebhookを一括で再登録します。本番環境（Vercel）でのみ動作します。続けますか？')) return;
    setLoading(true);
    setMsg('🔄 Webhook再登録中...');
    try {
      const res = await fetch('/api/webhooks/refresh', { method: 'POST' });
      const result = await res.json();
      if (res.ok) {
        setMsg(`✅ ${result.message}`);
        fetchStreamers(); // データを再取得して表示を更新
      } else {
        setMsg('❌ ' + result.error);
      }
    } catch {
      setMsg('❌ 通信エラーが発生しました。');
    }
    setLoading(false);
  };

  const exportCSV = () => {
    const blob = new Blob([
      "名前,所属箱,プラットフォーム,ID\n" + 
      streamers.map((s: any) => `${s.name},${s.agency},${s.platform},${s.channel_id}`).join('\n')
    ], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "streamers_backup.csv");
    link.click();
  };

  const importCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).slice(1);
    
    setLoading(true);
    let count = 0;
    for (const line of lines) {
      const parts = line.split(',').map((s: any) => s.trim());
      if (parts.length < 4) continue;
      const [name, agency, platform, channelId] = parts;
      if (!name || !platform || !channelId) continue;
      
      await fetch('/api/streamers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, platform, agency, channelIdOrHandle: channelId })
      });
      count++;
    }
    setMsg(`${count} 名のインポートが完了しました！`);
    setLoading(false);
    fetchStreamers();
  };

  const renderList = (list: any[]) => {
    return list.map((s: any) => (
      <StreamerRowItem 
        key={s.id} 
        s={s} 
        agencies={agencies}
        isSelected={selectedIds.includes(s.id)}
        onSelect={() => toggleSelect(s.id)}
        onUpdate={updateAgency}
      />
    ));
  };

  return (
    <main className="container" style={{ maxWidth: '1000px' }}>
      <header className="header" style={{ marginBottom: "20px" }}>
        <h1>配信者管理</h1>
      </header>

      {/* 海外掲示板風 アラートバナー */}
      {streamers.some(s => s.last_sync_status === 'error') && (
        <div className="alert-banner-top">
          <span className="error-dot" style={{ width: '8px', height: '8px' }}></span>
          <span style={{ fontWeight: 'bold' }}>SYSTEM ALERT:</span>
          <span>{streamers.filter(s => s.last_sync_status === 'error').length} 名の配信者で同期エラーが発生しています。詳細を確認し、必要に応じて再試行してください。</span>
        </div>
      )}

      {/* Top Section: Split Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '30px', marginBottom: '30px' }}>
        
        {/* Left Side: Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '25px' }}>
          
          {/* Registration Form */}
          <section className="glass-panel">
            <h2 style={{ fontSize: '1rem', marginBottom: '15px' }}>配信者を新規登録</h2>
            <form onSubmit={submit} style={{ display: 'flex', alignItems: 'flex-end', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ flex: '1.5', minWidth: '150px' }}>
                <label style={labelStyle}>名前</label>
                <input name="name" required placeholder="配信者名" style={inputStyle} />
              </div>
              
              <div style={{ flex: '1.5', minWidth: '150px' }}>
                <label style={labelStyle}>所属箱</label>
                {isNewAgency ? (
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <input name="new_agency" required placeholder="新しい箱名" style={inputStyle} autoFocus />
                    <button type="button" onClick={() => setIsNewAgency(false)} style={{ background: '#444', border: 'none', color: 'white', borderRadius: '8px', padding: '0 8px' }}>×</button>
                  </div>
                ) : (
                  <select name="agency" style={inputStyle} onChange={(e) => e.target.value === 'NEW' && setIsNewAgency(true)}>
                    <option value="個人勢">個人勢</option>
                    {agencies.filter(a => a !== '個人勢').map(a => <option key={a} value={a}>{a}</option>)}
                    <option value="NEW" style={{ color: 'var(--accent-hover)', fontWeight: 'bold' }}>＋新しく作る...</option>
                  </select>
                )}
              </div>

              <div style={{ width: '90px' }}>
                <label style={labelStyle}>プラットフォーム</label>
                <select name="platform" style={inputStyle}>
                  <option value="youtube">YouTube</option>
                  <option value="twitch">Twitch</option>
                </select>
              </div>

              <div style={{ flex: '2', minWidth: '150px' }}>
                <label style={labelStyle}>チャンネルID / @Handle</label>
                <input name="channelId" required placeholder="@handle" style={inputStyle} />
              </div>

              <button disabled={loading} type="submit" style={{ ...btnStyle, height: '42px', padding: '0 20px' }}>追加</button>
            </form>
            {msg && <p style={{ fontSize: '0.8rem', marginTop: '12px', color: 'var(--accent-hover)', fontWeight: 'bold' }}>{msg}</p>}
          </section>

          {/* Tools Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: '20px' }}>
            <section className="glass-panel">
              <h2 style={{ fontSize: '0.9rem', marginBottom: '12px' }}>データ管理 (CSV)</h2>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={exportCSV} style={{ ...btnStyle, background: 'rgba(0,0,0,0.05)', color: 'var(--text-primary)', border: '1px solid rgba(0,0,0,0.1)', padding: '8px 12px', fontSize: '0.75rem', flex: 1 }}>書き出し</button>
                <button onClick={() => fileInputRef.current?.click()} style={{ ...btnStyle, background: 'rgba(0,0,0,0.05)', color: 'var(--text-primary)', border: '1px solid rgba(0,0,0,0.1)', padding: '8px 12px', fontSize: '0.75rem', flex: 1 }}>読み込み</button>
                <input type="file" ref={fileInputRef} onChange={importCSV} accept=".csv" style={{ display: 'none' }} />
              </div>
            </section>

            <section className="glass-panel">
              <h2 style={{ fontSize: '0.9rem', marginBottom: '12px' }}>Webhook一括同期</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <button 
                  onClick={refreshWebhooks} 
                  disabled={loading}
                  style={{ ...btnStyle, padding: '8px 15px', fontSize: '0.75rem', background: 'var(--accent-color)' }}
                >
                  ステータスを強制同期
                </button>
                <p style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', lineHeight: '1.3' }}>
                  YouTubeの終了検知や、期限切れの<br/>Webhookを再登録（レスキュー）します。
                </p>
              </div>
            </section>
          </div>
        </div>

        {/* Right Side: System Info */}
        <aside style={{ display: 'flex', flexDirection: 'column' }}>
          <section className="glass-panel" style={{ height: '100%', borderLeft: '4px solid #AF4425' }}>
            <h2 style={{ fontSize: '0.9rem', marginBottom: '15px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📊 システム制限情報
            </h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', fontSize: '0.75rem' }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <strong>YouTube API v3</strong>
                  <span style={{ opacity: 0.7 }}>10,000 / 日</span>
                </div>
                <div style={{ background: '#eee', height: '4px', borderRadius: '2px' }}>
                  <div style={{ background: '#AF4425', width: '5%', height: '100%', borderRadius: '2px' }}></div>
                </div>
                <p style={{ marginTop: '4px', opacity: 0.6, fontSize: '0.65rem' }}>※ ライブ中のみポーリングを行い、消費を最小化</p>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <strong>Twitch EventSub</strong>
                  <span style={{ opacity: 0.7 }}>800 / 分</span>
                </div>
                <p style={{ opacity: 0.6, fontSize: '0.65rem' }}>※ レートリミット時は自動待機(Retry-After)を適用</p>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <strong>Supabase (Free)</strong>
                  <span style={{ opacity: 0.7 }}>500MB / DB</span>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <strong>Vercel (Free)</strong>
                  <span style={{ opacity: 0.7 }}>10s / 実行</span>
                </div>
                <p style={{ marginTop: '4px', opacity: 0.6, fontSize: '0.65rem' }}>※ 処理が長引くとタイムアウト(504)が発生します</p>
              </div>

              <div style={{ marginTop: '10px', padding: '12px', background: 'rgba(175, 68, 37, 0.05)', borderRadius: '8px', border: '1px solid rgba(175, 68, 37, 0.1)' }}>
                <p style={{ color: '#AF4425', fontWeight: 'bold', marginBottom: '5px', fontSize: '0.7rem' }}>🛡️ 自動復旧システム稼働中</p>
                <p style={{ lineHeight: '1.4', opacity: 0.8, fontSize: '0.65rem' }}>
                  一時的な通信エラーに対し「指数バックオフ」を適用。3回まで段階的にリトライを繰り返します。
                </p>
              </div>
            </div>
          </section>
        </aside>
      </div>

      {/* Bottom Section: Streamer List */}
      <section className="glass-panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            <h2 style={{ fontSize: '1rem', color: 'var(--text-primary)' }}>登録済み一覧</h2>
            {streamers.some(s => s.last_sync_status === 'error') && (
              <span className="error-badge" style={{ padding: '2px 8px', fontSize: '0.6rem' }}>
                {streamers.filter(s => s.last_sync_status === 'error').length}件のエラー
              </span>
            )}
            {selectedIds.length > 0 && (
              <button onClick={deleteSelected} style={{ background: '#ff4b4b', color: 'white', border: 'none', padding: '4px 10px', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 2px 8px rgba(255, 75, 75, 0.2)' }}>
                選択項目を削除 ({selectedIds.length})
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: '5px', background: 'rgba(0,0,0,0.05)', padding: '4px', borderRadius: '8px' }}>
             <TabBtn active={viewMode === 'date'} onClick={() => setViewMode('date')}>登録順</TabBtn>
             <TabBtn active={viewMode === 'agency'} onClick={() => setViewMode('agency')}>箱ごと</TabBtn>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {viewMode === 'agency' ? (
            Object.entries(streamers.reduce((acc: any, s: any) => {
              const a = s.agency || '個人勢';
              if (!acc[a]) acc[a] = [];
              acc[a].push(s);
              return acc;
            }, {} as any)).map(([agency, list]: any) => (
              <div key={agency}>
                <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px', paddingLeft: '5px', marginTop: '10px' }}>{agency}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>{renderList(list)}</div>
              </div>
            ))
          ) : renderList(streamers)}
        </div>
      </section>

      <div style={{ marginTop: '30px', textAlign: 'center' }}>
        <a href="/" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textDecoration: 'none', opacity: 0.8 }}>← ダッシュボードへ戻る</a>
      </div>
    </main>
  );
}

// 個別の配信者行コンポーネント
function StreamerRowItem({ s, agencies, isSelected, onSelect, onUpdate }: any) {
  const [pendingAgency, setPendingAgency] = useState(s.agency);
  const isChanged = pendingAgency !== s.agency;

  return (
    <div className="streamer-card" style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', border: '1px solid rgba(0,0,0,0.05)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
        <input 
          type="checkbox" 
          checked={isSelected} 
          onChange={onSelect} 
          style={{ width: '16px', height: '16px', cursor: 'pointer' }}
        />
        <div className={`platform-icon ${s.platform}`} style={{ width: '20px', height: '20px', fontSize: '0.6rem' }}>
          {s.platform === 'twitch' ? 'Tw' : 'YT'}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontWeight: '600', fontSize: '0.9rem', color: 'var(--text-primary)' }}>{s.name}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', fontFamily: 'monospace', opacity: 0.7 }}>{s.channel_id}</span>
            {s.last_sync_status === 'error' && (
              <span style={{ color: '#AF4425', fontSize: '0.65rem', fontWeight: 'bold', background: 'rgba(175, 68, 37, 0.08)', padding: '1px 6px', borderRadius: '4px', border: '1px solid rgba(175, 68, 37, 0.1)' }} title={s.last_sync_error}>
                ⚠️ {s.last_sync_error || 'Sync Error'}
              </span>
            )}
          </div>
        </div>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <select 
          value={pendingAgency} 
          onChange={(e) => {
            if (e.target.value === 'NEW_PROMPT') {
              const n = prompt('新しい所属箱の名前を入力してください:');
              if (n) setPendingAgency(n);
            } else {
              setPendingAgency(e.target.value);
            }
          }}
          style={{ background: 'rgba(255,255,255,0.8)', color: isChanged ? 'var(--accent-color)' : 'var(--text-primary)', border: '1px solid #d8c5a8', borderRadius: '4px', fontSize: '0.7rem', padding: '2px 4px', outline: 'none' }}
        >
          {agencies.map((a: string) => <option key={a} value={a}>{a}</option>)}
          {!agencies.includes(pendingAgency) && <option value={pendingAgency}>{pendingAgency}</option>}
          <option value="NEW_PROMPT" style={{ color: 'var(--accent-color)' }}>＋移動...</option>
        </select>
        
        {isChanged && (
          <button 
            onClick={() => onUpdate(s.id, pendingAgency)}
            style={{ background: 'var(--accent-color)', color: 'white', border: 'none', padding: '3px 10px', borderRadius: '4px', fontSize: '0.7rem', fontWeight: 'bold', cursor: 'pointer' }}
          >
            保存
          </button>
        )}
      </div>
    </div>
  );
}

function TabBtn({ children, active, onClick }: any) {
  return (
    <button onClick={onClick} style={{ padding: '4px 12px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.75rem', fontWeight: 'bold', background: active ? 'white' : 'transparent', color: active ? 'var(--accent-color)' : 'var(--text-secondary)', boxShadow: active ? '0 2px 5px rgba(0,0,0,0.05)' : 'none' }}>
      {children}
    </button>
  );
}

const labelStyle = { display: 'block', marginBottom: '5px', fontSize: '0.7rem', color: 'var(--text-secondary)', fontWeight: 'bold' as const };
const inputStyle = { width: '100%', padding: '8px 12px', fontSize: '0.85rem', borderRadius: '8px', border: '1px solid var(--card-border)', background: 'rgba(255,255,255,0.8)', color: 'var(--text-primary)' };
const btnStyle = { borderRadius: '8px', background: 'var(--accent-color)', color: '#EBDCB2', border: 'none', cursor: 'pointer', fontWeight: 'bold' as const };
