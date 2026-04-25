import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// .env.local から環境変数を読み込む
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkYouTubeLiveStatus(channelId) {
  try {
    const url = `https://www.youtube.com/channel/${channelId}/live`;
    const res = await fetch(url, { 
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    if (!res.ok) return false;
    const html = await res.text();
    const hasLiveFlag = html.includes('"isLive":true');
    const isActuallyLive = html.includes('"style":"LIVE"') || html.includes('\"status\":\"LIVE\"');
    const isUpcoming = html.includes('"style":"UPCOMING"') || html.includes('\"status\":\"UPCOMING\"');
    return (hasLiveFlag && isActuallyLive) && !isUpcoming;
  } catch {
    return false;
  }
}

async function forceSync() {
  console.log('Checking all streamers in database...');
  const { data: streamers } = await supabase.from('streamers').select('*');
  
  for (const s of streamers) {
    if (s.platform === 'youtube') {
      const isLive = await checkYouTubeLiveStatus(s.channel_id);
      console.log(`${s.name}: DB=${s.is_live}, REAL=${isLive}`);
      
      if (s.is_live !== isLive) {
        console.log(`Mismatch found! Updating ${s.name} to ${isLive}`);
        await supabase.from('streamers').update({ is_live: isLive }).eq('id', s.id);
      }
    }
  }
  console.log('Sync complete.');
}

forceSync();
