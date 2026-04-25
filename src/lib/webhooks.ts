/**
 * Webhook購読マネージャー
 * YouTube (PubSubHubbub) と Twitch (EventSub) の両方の購読を管理する
 */

// ===================================================================
// YouTube PubSubHubbub
// ===================================================================

export async function subscribeYouTube(channelId: string, callbackBaseUrl: string): Promise<{ success: boolean; error?: string }> {
  try {
    const callbackUrl = `${callbackBaseUrl}/api/webhooks/youtube`;
    const topicUrl = `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`;

    const payload = new URLSearchParams({
      'hub.callback': callbackUrl,
      'hub.topic': topicUrl,
      'hub.verify': 'async',
      'hub.mode': 'subscribe',
    });

    const res = await fetch('https://pubsubhubbub.appspot.com/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: payload.toString(),
    });

    // PubSubHubbubは202 Acceptedを返すことが多い
    if (res.status === 202 || res.ok) {
      return { success: true };
    }
    return { success: false, error: `PubSubHubbub returned ${res.status}` };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export async function unsubscribeYouTube(channelId: string, callbackBaseUrl: string): Promise<void> {
  const callbackUrl = `${callbackBaseUrl}/api/webhooks/youtube`;
  const topicUrl = `https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`;
  const payload = new URLSearchParams({
    'hub.callback': callbackUrl,
    'hub.topic': topicUrl,
    'hub.verify': 'async',
    'hub.mode': 'unsubscribe',
  });
  await fetch('https://pubsubhubbub.appspot.com/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: payload.toString(),
  });
}

// ===================================================================
// Twitch EventSub
// ===================================================================

/**
 * TwitchのApp Access Tokenを取得する
 */
async function getTwitchAppToken(): Promise<string | null> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const clientSecret = process.env.TWITCH_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.warn('[Twitch] TWITCH_CLIENT_ID または TWITCH_CLIENT_SECRET が設定されていません');
    return null;
  }

  const res = await fetch('https://id.twitch.tv/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'client_credentials',
    }).toString(),
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.access_token || null;
}

/**
 * TwitchのユーザーIDからlogin名を取得する（逆も可）
 */
export async function resolveTwitchUserId(loginName: string): Promise<string | null> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const token = await getTwitchAppToken();
  if (!token || !clientId) return null;

  const res = await fetch(`https://api.twitch.tv/helix/users?login=${loginName}`, {
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.data?.[0]?.id || null;
}

/**
 * Twitchの既存のEventSub購読を全て削除する（broadcaster_user_id でフィルタ）
 */
async function deleteExistingTwitchSubscriptions(broadcasterId: string, token: string): Promise<void> {
  const clientId = process.env.TWITCH_CLIENT_ID!;

  const res = await fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?user_id=${broadcasterId}`, {
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!res.ok) return;
  const data = await res.json();

  await Promise.all((data.data || []).map((sub: any) =>
    fetch(`https://api.twitch.tv/helix/eventsub/subscriptions?id=${sub.id}`, {
      method: 'DELETE',
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${token}`,
      },
    })
  ));
}

/**
 * Twitchのstream.online / stream.offline を購読する
 */
export async function subscribeTwitch(
  broadcasterId: string,
  callbackBaseUrl: string,
  secret: string
): Promise<{ success: boolean; error?: string }> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  if (!clientId) {
    return { success: false, error: 'TWITCH_CLIENT_ID が設定されていません' };
  }

  const token = await getTwitchAppToken();
  if (!token) {
    return { success: false, error: 'Twitchのアクセストークン取得に失敗しました' };
  }

  // 既存の購読を先に削除
  await deleteExistingTwitchSubscriptions(broadcasterId, token);

  const callbackUrl = `${callbackBaseUrl}/api/webhooks/twitch`;
  const results = [];

  for (const type of ['stream.online', 'stream.offline']) {
    const res = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
      method: 'POST',
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type,
        version: '1',
        condition: { broadcaster_user_id: broadcasterId },
        transport: {
          method: 'webhook',
          callback: callbackUrl,
          secret,
        },
      }),
    });

    results.push(res.ok);
  }

  const allSuccess = results.every(Boolean);
  return allSuccess
    ? { success: true }
    : { success: false, error: 'Twitchへの購読リクエストが一部失敗しました' };
}

/**
 * Twitchの現在のライブ状況を確認する
 */
export async function checkTwitchLiveStatus(broadcasterId: string): Promise<boolean> {
  const clientId = process.env.TWITCH_CLIENT_ID;
  const token = await getTwitchAppToken();
  if (!token || !clientId) return false;

  const res = await fetch(`https://api.twitch.tv/helix/streams?user_id=${broadcasterId}`, {
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!res.ok) return false;
  const data = await res.json();
  return (data.data?.length || 0) > 0;
}

/**
 * YouTubeの現在のライブ状況を簡易確認する
 * (APIキーなしでの簡易的な方法。RSSフィードから配信中か判断)
 */
export async function checkYouTubeLiveStatus(channelId: string): Promise<boolean> {
  try {
    const res = await fetch(`https://www.youtube.com/xml/feeds/videos.xml?channel_id=${channelId}`, { cache: 'no-store' });
    if (!res.ok) return false;
    const xml = await res.text();
    
    // RSSに最近の動画が含まれており、かつタイトル等にライブ特有のキーワードがあるか
    // ※完全ではありませんが、簡易的な即時反映として使用
    return xml.includes('yt:live'); 
  } catch {
    return false;
  }
}

/**
 * ホスト文字列から適切なbase URLを生成する
 */
export function getCallbackBaseUrl(host: string): string {
  // 環境変数で明示的にURLが指定されている場合はそれを優先
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '');
  }
  return `https://${host}`;
}
