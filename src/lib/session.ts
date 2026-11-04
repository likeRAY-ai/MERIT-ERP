// 登入狀態：使用簽章過的 cookie（JWT），middleware 與伺服器端共用
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "merit_session";
export const SESSION_DAYS = 7;

export type Session = {
  uid: number;
  name: string;
  role: "OWNER" | "STAFF" | "ACCOUNTANT";
  sv: number; // 帳號的 sessionVersion，改密碼後舊 cookie 失效
};

function secret() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("請設定 AUTH_SECRET（至少 32 個字元）");
  return new TextEncoder().encode(s);
}

export async function signSession(s: Session): Promise<string> {
  return new SignJWT({ ...s })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

export async function verifySession(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      uid: Number(payload.uid),
      name: String(payload.name),
      role: payload.role as Session["role"],
      sv: Number(payload.sv ?? 0),
    };
  } catch {
    return null;
  }
}
