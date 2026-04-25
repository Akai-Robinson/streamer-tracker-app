import { supabaseAdmin } from '../src/lib/supabase.js';
import { checkYouTubeLiveStatus } from '../src/lib/webhooks.js';

async function forceSync() {
  console.log('--- Force Sync Start ---');
  
  // 1. 現在のDBの状態を確認
  const { data: streamers } = await supabaseAdmin.from('streamers').select('*');
  
  for (const s of streamers) {
    if (s.platform === 'youtube') {
      console.log(`Checking ${s.name} (${s.channel_id})...`);
      const isLive = await checkYouTubeLiveStatus(s.channel_id);
      console.log(`Current DB is_live: ${s.is_live}, API says isLive: ${isLive}`);
      
      if (s.is_live !== isLive) {
        console.log(`Updating ${s.name} to is_live: ${isLive}`);
        const { error } = await supabaseAdmin.from('streamers').update({ is_live: isLive }).eq('id', s.id);
        if (error) console.error('Update Error:', error);
        else console.log('Update Success');
      }
    }
  }
  
  console.log('--- Force Sync End ---');
}

forceSync();
