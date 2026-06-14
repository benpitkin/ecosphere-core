import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { xeroConfigured, authorizeUrl } from "@/lib/xero";

// Starts the Xero OAuth2 flow: sets a CSRF state cookie and redirects the
// logged-in user to Xero's consent screen. Staff-only (behind Core login).
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));
  if (!xeroConfigured()) {
    return NextResponse.json({ error: "Xero is not configured (set XERO_CLIENT_ID and XERO_CLIENT_SECRET)." }, { status: 503 });
  }

  const state = randomUUID();
  const redirectUri = new URL("/api/xero/callback", request.url).toString();
  cookies().set("xero_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return NextResponse.redirect(authorizeUrl(state, redirectUri));
}
