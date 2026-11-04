import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

// 未登入一律導向登入頁
export async function middleware(req: NextRequest) {
  const session = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  const isLogin = req.nextUrl.pathname === "/login";
  if (!session && !isLogin) {
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "未登入" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }
  // 已登入也讓登入頁正常顯示：帳號被停用或改過密碼時，cookie 仍有效但伺服器端會判定失效，
  // 若在這裡導回首頁會和首頁的「導向登入頁」來回無限重導
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon|manifest.webmanifest).*)"],
};
