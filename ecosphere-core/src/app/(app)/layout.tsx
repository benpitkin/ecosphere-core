import Sidebar from "@/components/Sidebar";
import Assistant from "@/components/Assistant";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <Sidebar email={user?.email ?? null} />
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      <Assistant />
    </div>
  );
}
