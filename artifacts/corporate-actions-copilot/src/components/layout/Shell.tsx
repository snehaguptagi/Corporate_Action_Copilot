import { ReactNode } from "react"
import { Link, useLocation } from "wouter"
import { LayoutDashboard, FileText, History, ShieldAlert, LogIn, LogOut, BriefcaseBusiness, ChartNoAxesCombined } from "lucide-react"
import { useAuth } from "@workspace/replit-auth-web"
import {
  getGetSessionQueryKey,
  useGetSession,
  useListEvents,
} from "@workspace/api-client-react"

export function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation()
  const { user, isLoading: authLoading, isAuthenticated, login, logout } = useAuth()

  const {
    data: activeRole,
    isLoading: roleLoading,
    isError: roleError,
  } = useGetSession({
    query: {
      queryKey: getGetSessionQueryKey(),
      enabled: !authLoading && isAuthenticated,
      retry: false,
    },
  })

  const { data: events } = useListEvents()

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/portfolio", label: "Portfolio", icon: BriefcaseBusiness },
    { href: "/events", label: "Corporate actions", icon: FileText },
    { href: "/analysis", label: "Analysis", icon: ChartNoAxesCombined },
    { href: "/audit", label: "Audit", icon: History },
  ]

  const isActive = (href: string) => {
    if (href === "/") return location === "/"
    return location.startsWith(href)
  }

  const latestReceived = events?.reduce((latest, e) => {
    const d = new Date(e.receivedAt).getTime();
    return d > latest ? d : latest;
  }, 0) ?? 0;

  const isStale = Date.now() - latestReceived > 24 * 60 * 60 * 1000;
  const feedDotColor = isStale ? "bg-warning" : "bg-success";
  
  if (authLoading) {
    return <AuthMessage title="Loading your profile..." detail="Connecting to the enterprise sign-in service." />
  }

  if (!isAuthenticated) {
    return (
      <AuthMessage
        title="Sign in to Impact Copilot"
        detail="Use your approved enterprise identity to access the platform."
        action={<button onClick={login} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"><LogIn className="h-4 w-4" /> Sign in</button>}
      />
    )
  }

  if (roleLoading) {
    return <AuthMessage title="Loading access..." detail="Verifying your permissions." />
  }

  if (roleError || !activeRole) {
    return (
      <AuthMessage
        title="Access is not assigned"
        detail={`Your identity${user?.email ? ` (${user.email})` : ""} is authenticated, but no role is assigned.`}
        action={<button onClick={logout} className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium"><LogOut className="h-4 w-4" /> Sign out</button>}
      />
    )
  }

  const initials = activeRole.name.split(" ").map((name) => name[0]).join("")

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="hidden w-64 border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex lg:flex-col lg:shrink-0">
        <div className="h-14 flex items-center justify-between px-4 border-b border-sidebar-border/50 shrink-0">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
              <ShieldAlert className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span>Impact Copilot</span>
          </div>
        </div>
        
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          <div className="text-xs font-semibold text-sidebar-muted-foreground uppercase tracking-wider mb-2 px-2 mt-4 flex items-center justify-between">
            Menu
            <div className="flex items-center gap-1.5" title={isStale ? "Feed may be delayed" : "Feed active"}>
              <div className={`h-2 w-2 rounded-full ${feedDotColor}`} />
            </div>
          </div>
          {navItems.map((item) => {
            const active = isActive(item.href)
            return (
              <Link key={item.href} href={item.href} className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                active
                  ? "bg-sidebar-primary/10 text-sidebar-primary"
                  : "text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}>
                <item.icon className="w-4 h-4 shrink-0" />
                {item.label}
              </Link>
            )
          })}
        </nav>
        
        <div className="p-4 border-t border-sidebar-border/50 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-sm font-medium">
                {initials}
              </div>
              <div className="flex flex-col text-sm">
                <span className="font-medium leading-none">{activeRole.name}</span>
                <span className="text-xs text-sidebar-muted-foreground mt-1">{activeRole.role}</span>
              </div>
            </div>
            <button onClick={logout} className="text-sidebar-muted-foreground hover:text-sidebar-foreground" title="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>
      
      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
        <div className="flex shrink-0 flex-col border-b border-slate-200 bg-sidebar text-sidebar-foreground lg:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <div className="flex items-center gap-2 font-semibold tracking-tight">
              <div className="flex h-6 w-6 items-center justify-center rounded bg-primary">
                <ShieldAlert className="h-3.5 w-3.5 text-primary-foreground" />
              </div>
              <span>Impact Copilot</span>
            </div>
            <div className="flex items-center gap-1.5" title={isStale ? "Feed may be delayed" : "Feed active"}>
              <div className={`h-2 w-2 rounded-full ${feedDotColor}`} />
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
            {navItems.map((item) => {
              const active = isActive(item.href)
              return (
                <Link key={item.href} href={item.href} className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                  active
                    ? "bg-sidebar-primary/15 text-sidebar-primary-foreground"
                    : "text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                }`}>
                  <item.icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </div>
        {children}
      </main>
    </div>
  )
}

function AuthMessage({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-primary">
          <ShieldAlert className="h-5 w-5 text-primary-foreground" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
        {action ? <div className="mt-6">{action}</div> : null}
      </div>
    </div>
  )
}
