import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Allow the blocked page and auth-related pages for Expo Go development
  if (
    pathname === '/blocked' ||
    pathname === '/reset-password' ||
    pathname.startsWith('/auth/')
  ) {
    return NextResponse.next()
  }

  // Redirect all other routes to blocked page
  return NextResponse.redirect(new URL('/blocked', request.url))
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
