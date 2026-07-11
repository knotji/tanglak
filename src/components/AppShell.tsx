import { BottomNavigation } from "@/components/BottomNavigation";
import { OnlineStatus } from "@/components/OnlineStatus";
import { ConfigError } from "@/components/ConfigError";
import { RouteProgress } from "@/components/feedback/RouteProgress";

export function AppShell({
  children,
  nav = true,
}: {
  children: React.ReactNode;
  nav?: boolean;
}) {
  return (
    <div className="min-h-screen bg-background">
      {nav ? <RouteProgress /> : null}
      <main
        id="main-content"
        tabIndex={-1}
        className={`mx-auto flex min-h-screen w-full max-w-xl flex-col gap-4 overflow-x-hidden px-4 pt-5 safe-top sm:max-w-2xl lg:max-w-4xl ${
          nav ? "pb-28" : "pb-6 safe-bottom"
        }`}
      >
        <ConfigError />
        <OnlineStatus />
        {children}
      </main>
      {nav ? <BottomNavigation /> : null}
    </div>
  );
}
