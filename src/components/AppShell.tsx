import { BottomNavigation } from "@/components/BottomNavigation";
import { OnlineStatus } from "@/components/OnlineStatus";
import { ConfigError } from "@/components/ConfigError";
import { RouteProgress } from "@/components/feedback/RouteProgress";

export function AppShell({
  children,
  nav = true,
  contentElement = "main",
}: {
  children: React.ReactNode;
  nav?: boolean;
  contentElement?: "main" | "div";
}) {
  const ContentElement = contentElement;
  const contentProps =
    contentElement === "main"
      ? {
          id: "main-content",
          tabIndex: -1,
        }
      : {};

  return (
    <div className="min-h-screen bg-background">
      {nav ? <RouteProgress /> : null}
      <ContentElement
        {...contentProps}
        className={`mx-auto flex min-h-screen w-full max-w-xl flex-col gap-4 overflow-x-hidden px-4 pt-5 safe-top sm:max-w-2xl lg:max-w-4xl ${
          nav ? "pb-28" : "pb-6 safe-bottom"
        }`}
      >
        <ConfigError />
        <OnlineStatus />
        {children}
      </ContentElement>
      {nav ? <BottomNavigation /> : null}
    </div>
  );
}
