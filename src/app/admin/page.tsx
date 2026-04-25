'use client';
import { useState, useEffect } from 'react';

export default function AdminPage() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [streamers, setStreamers] = useState<any[]>([]);
  const [viewMode, setViewMode] = useState<'date' | 'agency'>('date');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [agencies, setAgencies] = useState<string[]>([]);
  const [isNewAgency, setIsNewAgency] = useState(false);

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
      } else {
        setMsg('❌ ' + result.error);
      }
    } catch {
      setMsg('❌ 通信エラーが発生しました。');
    }
    setLoading(false);
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
    <main className="container" style={{ maxWidth: '850px' }}>
      <header className="header" style={{ marginBottom: "25px" }}>
        <h1>👑 配信者管理</h1>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '25px' }}>
        
        {/* Registration */}
        <section className="glass-panel">
          <form onSubmit={submit} style={{ display: 'flex', alignItems: 'flex-end', gap: '15px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label style={labelStyle}>配信者名</label>
              <input name="name" required placeholder="名前" style={inputStyle} />
            </div>
            
            <div style={{ flex: 1, minWidth: '150px' }}>
              <label style={labelStyle}>所属箱 (既存から選択)</label>
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

            <div style={{ width: '100px' }}>
              <label style={labelStyle}>プラットフォーム</label>
              <select name="platform" style={inputStyle}><option value="youtube">YouTube</option><option value="twitch">Twitch</option></select>
            </div>

            <div style={{ flex: 1, minWidth: '150px' }}>
              <label style={labelStyle}>IDまたは@名</label>
              <input name="channelId" required placeholder="@handle" style={inputStyle} />
            </div>

            <button disabled={loading} type="submit" style={{ ...btnStyle, height: '42px', padding: '0 20px' }}>追加</button>
          </form>
          {msg && <p style={{ fontSize: '0.85rem', marginTop: '10px', textAlign: 'center', color: 'var(--accent-hover)' }}>{msg}</p>}
        </section>

        {/* CSV Tools */}
        <section className="glass-panel" style={{ padding: '15px 25px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '1rem', marginBottom: '5px' }}>📦 CSVツール</h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>名前,所属箱,platform(youtube/twitch),ID(@名可)</p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button 
                onClick={() => {
                  const blob = new Blob([
                    "名前,所属箱,プラットフォーム,ID\n" + 
                    streamers.map((s: any) => `${s.name},${s.agency},${s.platform},${s.channel_id}`).join('\n')
                  ], { type: 'text/csv;charset=utf-8;' });
                  const url = URL.createObjectURL(blob);
                  const link = document.createElement("a");
                  link.setAttribute("href", url);
                  link.setAttribute("download", "streamers_backup.csv");
                  link.click();
                }}
                style={{ ...btnStyle, background: 'rgba(255,255,255,0.05)', padding: '8px 15px', fontSize: '0.8rem' }}
              >
                📥 CSVを書き出す
              </button>
              
              <label style={{ ...btnStyle, background: 'rgba(255,255,255,0.1)', padding: '8px 15px', fontSize: '0.8rem', cursor: 'pointer' }}>
                📤 CSVを読み込む
                <input 
                  type="file" 
                  accept=".csv" 
                  style={{ display: 'none' }} 
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const text = await file.text();
                    const lines = text.split(/\r?\n/).slice(1); // ヘッダーを飛ばす
                    
                    setLoading(true);
                    let count = 0;
                    for (const line of lines) {
                      const [name, agency, platform, channelId] = line.split(',').map((s: any) => s.trim());
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
                  }}
                />
              </label>
            </div>
          </div>
        </section>

        {/* Webhook Tools */}
        <section className="glass-panel" style={{ padding: '15px 25px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '1rem', marginBottom: '5px' }}>📡 Webhook管理</h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>全配信者のWebhook購読を一括で再登録します（本番環境のみ）</p>
            </div>
            <button
              onClick={refreshWebhooks}
              disabled={loading}
              style={{ ...btnStyle, background: 'rgba(123,97,255,0.2)', border: '1px solid var(--accent-color)', padding: '8px 15px', fontSize: '0.8rem' }}
            >
              🔄 Webhookを一括更新
            </button>
          </div>
        </section>

        {/* List & Bulk Action */}
        <section className="glass-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.2rem' }}>📋 登録済み</h2>
              {selectedIds.length > 0 && (
                <button onClick={deleteSelected} style={{ background: '#ff4b4b', color: 'white', border: 'none', padding: '5px 12px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: 'bold', cursor: 'pointer' }}>
                  🗑️ {selectedIds.length}件を一括削除
                </button>
              )}
            </div>
            <div style={{ display: 'flex', gap: '5px', background: 'rgba(0,0,0,0.3)', padding: '4px', borderRadius: '8px' }}>
               <TabBtn active={viewMode === 'date'} onClick={() => setViewMode('date')}>登録順</TabBtn>
               <TabBtn active={viewMode === 'agency'} onClick={() => setViewMode('agency')}>箱ごと</TabBtn>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {viewMode === 'agency' ? (
              Object.entries(streamers.reduce((acc: any, s: any) => {
                const a = s.agency || '個人勢';
                if (!acc[a]) acc[a] = [];
                acc[a].push(s);
                return acc;
              }, {} as any)).map(([agency, list]: any) => (
                <div key={agency}>
                  <h3 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '8px', paddingLeft: '5px' }}>{agency}</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '15px' }}>{renderList(list)}</div>
                </div>
              ))
            ) : renderList(streamers)}
          </div>
        </section>

      </div>
      <div style={{ marginTop: '20px', textAlign: 'center' }}><a href="/" style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>← ダッシュボードへ戻る</a></div>
    </main>
  );
}

// 個別の配信者行コンポーネント
function StreamerRowItem({ s, agencies, isSelected, onSelect, onUpdate }: any) {
  const [pendingAgency, setPendingAgency] = useState(s.agency);
  const isChanged = pendingAgency !== s.agency;

  return (
    <div className="streamer-card" style={{ padding: '8px 12px', background: 'rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <input 
          type="checkbox" 
          checked={isSelected} 
          onChange={onSelect} 
          style={{ width: '18px', height: '18px', cursor: 'pointer' }}
        />
        <div className={`platform-icon ${s.platform}`} style={{ width: '20px', height: '20px', fontSize: '0.6rem' }}>
          {s.platform === 'twitch' ? 'Tw' : 'YT'}
        </div>
        <span style={{ fontWeight: '600', fontSize: '0.95rem' }}>{s.name}</span>
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
          style={{ background: '#1a1b35', color: isChanged ? 'var(--accent-hover)' : '#ccc', border: '1px solid var(--card-border)', borderRadius: '4px', fontSize: '0.8rem', padding: '2px 5px' }}
        >
          {agencies.map((a: string) => <option key={a} value={a}>{a}</option>)}
          {!agencies.includes(pendingAgency) && <option value={pendingAgency}>{pendingAgency}</option>}
          <option value="NEW_PROMPT">＋新しい箱へ移動...</option>
        </select>
        
        {isChanged && (
          <button 
            onClick={() => onUpdate(s.id, pendingAgency)}
            style={{ background: 'var(--accent-color)', color: 'white', border: 'none', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 'bold', cursor: 'pointer' }}
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
    <button onClick={onClick} style={{ padding: '4px 10px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '0.8rem', fontWeight: 'bold', background: active ? 'rgba(255,255,255,0.1)' : 'transparent', color: active ? 'white' : 'var(--text-secondary)' }}>
      {children}
    </button>
  );
}

const labelStyle = { display: 'block', marginBottom: '6px', fontSize: '0.75rem', color: 'var(--text-secondary)' };
const inputStyle = { width: '100%', padding: '10px', fontSize: '0.9rem', borderRadius: '8px', border: '1px solid var(--card-border)', background: 'rgba(0,0,0,0.3)', color: 'white' };
const btnStyle = { borderRadius: '8px', background: 'var(--accent-color)', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold' };
