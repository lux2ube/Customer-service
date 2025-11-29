import { NextRequest, NextResponse } from 'next/server';

const publicRoutes = ['/login'];

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  
  // Allow public routes
  if (publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  // Check if user is authenticated
  const authToken = request.cookies.get('authToken')?.value;
  
  if (!authToken) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
