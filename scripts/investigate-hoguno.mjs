// Node 22標準のfetchを使用

async function run() {
  const handle = '@Hoguno_Mochizuki';
  const res = await fetch(`https://www.youtube.com/${handle}`);
  const html = await res.text();
  const match = html.match(/channelId\":\"(UC[^\"]+)\"/) || html.match(/<meta itemprop="channelId" content="(UC[^"]+)">/);
  const channelId = match ? match[1] : null;

  if (!channelId) {
    console.log('Channel ID not found');
    return;
  }
  console.log(`Resolved Channel ID: ${channelId}`);
  
  // デバッグロジック実行
  const liveUrl = `https://www.youtube.com/channel/${channelId}/live`;
  const liveRes = await fetch(liveUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
  });
  const liveHtml = await liveRes.text();
  
  const hasLiveFlag = liveHtml.includes('"isLive":true');
  const isLiveStyle = liveHtml.includes('"style":"LIVE"');
  const isUpcoming = liveHtml.includes('"style":"UPCOMING"');

  console.log({ channelId, hasLiveFlag, isLiveStyle, isUpcoming });
  
  const decision = (hasLiveFlag && isLiveStyle) && !isUpcoming;
  console.log(`Decision: ${decision}`);
}

run();
