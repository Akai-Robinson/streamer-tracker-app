import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(req: NextRequest) {
  const url = req.nextUrl;

  // Webhook通知用のAPIや、Next.jsのシステムファイルは認証から除外する
  if (
    url.pathname.startsWith('/api/webhooks') || 
    url.pathname.startsWith('/_next') ||
    url.pathname.includes('favicon.ico')
  ) {
    return NextResponse.next();
  }

  const basicAuth = req.headers.get('authorization');

  // .env.local からIDとパスワードを取得（未設定なら admin / tracker）
  const USER = process.env.ADMIN_USER || 'admin';
  const PASS = process.env.ADMIN_PASS || 'tracker';

  if (basicAuth) {
    const authValue = basicAuth.split(' ')[1];
    const [user, pwd] = atob(authValue).split(':');

    if (user === USER && pwd === PASS) {
      return NextResponse.next();
    }
  }

  // 認証失敗時または未入力時にブラウザ標準のパスワード入力ダイアログを出す
  return new NextResponse('Auth required', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Secure Streamer Tracker Area"' }
  });
}

// 認証を適用するパス（すべて）
export const config = {
  matcher: ['/:path*'],
};
