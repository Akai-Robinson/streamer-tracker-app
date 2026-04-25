import fetch from 'node-fetch';

async function checkYouTubeLiveStatus(channelId) {
  try {
    const url = `https://www.youtube.com/channel/${channelId}/live`;
    console.log(`Checking URL: ${url}`);
    
    const res = await fetch(url, { 
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (!res.ok) {
        console.log(`Error: Response status ${res.status}`);
        return false;
    }
    const html = await res.text();
    
    const hasLiveFlag = html.includes('"isLive":true');
    const isActuallyLive = html.includes('"style":"LIVE"') || html.includes('\"status\":\"LIVE\"');
    const isUpcoming = html.includes('"style":"UPCOMING"') || html.includes('\"status\":\"UPCOMING\"');

    console.log('--- Results ---');
    console.log(`hasLiveFlag ("isLive":true): ${hasLiveFlag}`);
    console.log(`isActuallyLive ("style":"LIVE"): ${isActuallyLive}`);
    console.log(`isUpcoming ("style":"UPCOMING"): ${isUpcoming}`);
    
    const result = (hasLiveFlag && isActuallyLive) && !isUpcoming;
    console.log(`Final Decision -> Is Live: ${result}`);
    
    return result;
  } catch (e) {
    console.error('Error during check:', e);
    return false;
  }
}

// 実行（引数にチャンネルIDを渡す）
const channelId = process.argv[2] || 'UC6eWCld0KwmyHFbAqK3V-Rw'; // デフォルトは博衣こよりさん
checkYouTubeLiveStatus(channelId);
