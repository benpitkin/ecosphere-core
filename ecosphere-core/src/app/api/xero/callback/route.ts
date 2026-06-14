import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { exchangeCode, getConnections, saveConnection } from "@/lib/xero";

// Xero OAuth2 callback: verifies the CSRF state, exchanges the code for tokens,
// picks the connected org, and stores the connection. Redirects back to
// /settings with a status. Staff-only.
export const dynamic = "force-dynamic";

function back(request: Request, params: string): NextResponse {
  return NextResponse.redirect(new URL(`/settings?${params}`, request.url));
}

export async function GET(request: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.redirect(new URL("/login", request.url));

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const cookieState = cookies().get("xero_oauth_state")?.value;
  cookies().delete("xero_oauth_state");

  if (oauthError) return back(request, `xero=error&reason=${encodeURIComponent(oauthError)}`);
  if (!code || !state || !cookieState || state !== cookieState) return back(request, "xero=error&reason=state");

  try {
    const redirectUri = new URL("/api/xero/callback", request.url).toString();
    const tokens = await exchangeCode(code, redirectUri);
    const conns = await getConnections(tokens.access_token);
    if (conns.length === 0) return back(request, "xero=error&reason=no_org");
    await saveConnection(createAdminClient(), tokens, conns[0]);
    return back(request, "xero=connected");
  } catch (e: any) {
    return back(request, `xero=error&reason=${encodeURIComponent(String(e?.message ?? "failed").slice(0, 80))}`);
  }
}
