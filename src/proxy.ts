import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicSupabaseConfig } from "@/lib/config";

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const config = publicSupabaseConfig();
  if (!config) return response;
  const supabase = createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  await supabase.auth.getClaims();
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: [
    "/login",
    "/dashboard/:path*",
    "/tutor/:path*",
    "/simulacro/:path*",
    "/inicio/:path*",
    "/unidades/:path*",
    "/progreso/:path*",
    "/admin/:path*",
  ],
};
