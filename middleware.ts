import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase environment variables')
    // 環境変数が設定されていない場合は、ログイン画面以外をログイン画面にリダイレクト
    if (request.nextUrl.pathname !== '/login') {
      return NextResponse.redirect(new URL('/login', request.url))
    }
    return NextResponse.next()
  }

  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // ログイン画面とオンボーディング画面は認証チェックのみ
  if (pathname === '/login' || pathname === '/onboarding') {
    if (user) {
      // ログイン済みの場合、プロフィールをチェック
      const { data: profile } = await supabase
        .from('profiles')
        .select('onboarding_completed')
        .eq('user_id', user.id)
        .single()

      if (pathname === '/login') {
        // ログイン画面にいる場合、オンボーディング状態に応じてリダイレクト
        if (!profile || !profile.onboarding_completed) {
          return NextResponse.redirect(new URL('/onboarding', request.url))
        }
        return NextResponse.redirect(new URL('/app/home', request.url))
      }

      if (pathname === '/onboarding') {
        // オンボーディング画面にいる場合、完了済みならホームへ
        if (profile && profile.onboarding_completed) {
          return NextResponse.redirect(new URL('/app/home', request.url))
        }
        // 未完了ならそのまま通す
        return response
      }
    }
    // 未ログインならそのまま通す
    return response
  }

  // /app配下は認証必須
  if (pathname.startsWith('/app')) {
    if (!user) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    // オンボーディング未完了ならリダイレクト
    const { data: profile } = await supabase
      .from('profiles')
      .select('onboarding_completed')
      .eq('user_id', user.id)
      .single()

    if (!profile || !profile.onboarding_completed) {
      return NextResponse.redirect(new URL('/onboarding', request.url))
    }
  }

  return response
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
