import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'r53_session';

/** Next.js 16 "proxy" (formerly middleware): send signed-out users to the login page. */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (pathname === '/' || pathname === '/route53' || pathname === '/route53/v2') {
    return NextResponse.redirect(new URL(hasSession ? '/route53/v2/home' : '/login', request.url));
  }
  if (pathname.startsWith('/route53') && !hasSession) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', pathname + search);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/', '/route53/:path*'],
};
