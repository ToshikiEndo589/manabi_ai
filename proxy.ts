import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  if (
    pathname.startsWith('/api/') ||
    pathname === '/blocked' ||
    pathname === '/reset-password' ||
    pathname.startsWith('/auth/')
  ) {
    return NextResponse.next()
  }

  return NextResponse.redirect(new URL('/blocked', request.url))
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
