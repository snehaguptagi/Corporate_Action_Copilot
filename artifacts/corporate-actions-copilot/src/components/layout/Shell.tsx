import { ReactNode, useEffect, useState } from "react"
import { Link, useLocation } from "wouter"
import { LayoutDashboard, FileText, ShieldAlert, LogIn, LogOut, BriefcaseBusiness, Building2, ChartNoAxesCombined, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { useAuth } from "@workspace/replit-auth-web"
import {
  getGetSessionQueryKey,
  useGetSession,
  useListSchemes,
} from "@workspace/api-client-react"

const DESKTOP_QUERY = "(min-width: 1024px)"

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => (
    typeof window !== "undefined" ? window.matchMedia(DESKTOP_QUERY).matches : true
  ))
  useEffect(() => {
    const mediaQuery = window.matchMedia(DESKTOP_QUERY)
    const onChange = (event: MediaQueryListEvent) => setIsDesktop(event.matches)
    mediaQuery.addEventListener("change", onChange)
    return () => mediaQuery.removeEventListener("change", onChange)
  }, [])
  return isDesktop
}

export function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation()
  const isDesktop = useIsDesktop()
  const [collapsed, setCollapsed] = useState(() => (
    typeof window !== "undefined" && window.localStorage.getItem("corporate-actions-sidebar") === "collapsed"
  ))
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

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/portfolio", label: "Portfolio", icon: BriefcaseBusiness },
    { href: "/events", label: "Corporate actions", icon: FileText },
    { href: "/issuers", label: "Issuers", icon: Building2 },
    { href: "/analysis", label: "Analysis", icon: ChartNoAxesCombined },
  ]

  const isActive = (href: string) => {
    if (href === "/") return location === "/"
    return location.startsWith(href)
  }

  useEffect(() => {
    window.localStorage.setItem("corporate-actions-sidebar", collapsed ? "collapsed" : "expanded")
  }, [collapsed])
  
  if (authLoading) {
    return <AuthMessage title="Loading your profile..." detail="Connecting to the enterprise sign-in service." />
  }

  if (!isAuthenticated) {
    return (
      <AuthMessage
        title="Sign in to Corporate Actions Copilot"
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

  return <AuthenticatedShell activeRole={activeRole} isDesktop={isDesktop} collapsed={collapsed} setCollapsed={setCollapsed} logout={logout} location={location} navItems={navItems} isActive={isActive}>{children}</AuthenticatedShell>
}

function AuthenticatedShell({ children, activeRole, isDesktop, collapsed, setCollapsed, logout, navItems, isActive }: {
  children: ReactNode
  activeRole: { name: string; role: string; desk: string }
  isDesktop: boolean
  collapsed: boolean
  setCollapsed: (value: boolean) => void
  logout: () => void
  location: string
  navItems: { href: string; label: string; icon: typeof LayoutDashboard }[]
  isActive: (href: string) => boolean
}) {
  // Identity block: whose money this is. AUM and scheme count come from the same
  // scheme data the Portfolio page uses, never hardcoded.
  const { data: schemes } = useListSchemes()
  const schemeCount = schemes?.length ?? 0
  const totalAumCrore = (schemes ?? []).reduce((total, scheme) => total + Number(scheme.aumCrore ?? 0), 0)
  const bookLine = schemeCount > 0
    ? `₹${Math.round(totalAumCrore).toLocaleString("en-IN")} cr AUM · ${schemeCount} scheme${schemeCount === 1 ? "" : "s"}`
    : ""

  const initials = activeRole.name.split(" ").map((name) => name[0]).join("")

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar: mounted only at desktop widths so each nav item exists once in the DOM */}
      {isDesktop && <aside className={`relative flex flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 shrink-0 ${collapsed ? "w-[4.5rem]" : "w-64"}`}>
        <div className={`flex h-20 shrink-0 items-center border-b border-sidebar-border/60 ${collapsed ? "justify-center px-2" : "justify-between px-4"}`}>
          <Link href="/" className={`flex min-w-0 items-center gap-3 ${collapsed ? "justify-center" : ""}`} aria-label="Corporate Actions Copilot home">
            <BrandLockup collapsed={collapsed} />
          </Link>
        </div>
        
        <nav className={`flex-1 space-y-1 overflow-y-auto ${collapsed ? "p-2" : "p-3"}`}>
          <div className={`mb-2 mt-3 flex items-center text-[10px] font-semibold uppercase tracking-[0.18em] text-sidebar-muted-foreground ${collapsed ? "justify-center" : "px-2"}`}>
            {!collapsed && "Workspace"}
          </div>
          {navItems.map((item) => {
            const active = isActive(item.href)
            return (
              <Link key={item.href} href={item.href} title={collapsed ? item.label : undefined} aria-label={item.label} className={`group flex w-full items-center rounded-md py-2.5 text-sm font-medium transition-colors ${collapsed ? "justify-center px-2" : "gap-3 px-3"} ${
                active
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              }`}>
                <item.icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            )
          })}
        </nav>
        
        <div className={`shrink-0 border-t border-sidebar-border/50 ${collapsed ? "p-2" : "px-4 py-3"}`}>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={`flex w-full items-center rounded-md text-xs font-medium text-sidebar-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground ${collapsed ? "justify-center p-2" : "gap-2 px-2 py-2"}`}
            aria-label={collapsed ? "Expand navigation" : "Minimise navigation"}
            title={collapsed ? "Expand navigation" : "Minimise navigation"}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!collapsed && <span>Minimise navigation</span>}
          </button>
        </div>
        <div className={`shrink-0 ${collapsed ? "p-2" : "p-4"}`}>
          <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : "justify-between"}`}>
            <div className={`flex items-center gap-3 ${collapsed ? "justify-center" : ""}`} title={collapsed ? `${activeRole.name} · ${activeRole.role} · ${activeRole.desk}` : undefined}>
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sm font-medium">
                {initials}
              </div>
              {!collapsed && <div className="flex min-w-0 flex-col text-sm">
                <span className="font-medium leading-none">{activeRole.name}</span>
                <span className="mt-1 text-xs text-sidebar-muted-foreground">{activeRole.role} · {activeRole.desk}</span>
                {bookLine && <span className="figure-inline mt-1 text-xs text-sidebar-muted-foreground">{bookLine}</span>}
              </div>}
            </div>
            {!collapsed && <button onClick={logout} className="text-sidebar-muted-foreground hover:text-sidebar-foreground" title="Sign out" aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </button>}
          </div>
        </div>
      </aside>}
      
      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
        {!isDesktop && <div className="flex shrink-0 flex-col border-b border-slate-200 bg-sidebar text-sidebar-foreground">
          <div className="flex h-14 items-center justify-between px-4">
            <div className="flex min-w-0 items-center gap-3">
              <BrandLockup />
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
        </div>}
        {children}
      </main>
    </div>
  )
}

function PwCMark() {
  return (
    <span className="pwc-mark" aria-label="PwC">
      <img src={`${import.meta.env.BASE_URL}pwc-logo.jpg`} alt="PwC" className="pwc-logo" />
    </span>
  )
}

function BrandLockup({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <>
      <PwCMark />
      {!collapsed && (
        <span className="min-w-0 border-l border-sidebar-border/70 pl-3 leading-none">
          <span className="block whitespace-nowrap text-[14px] font-semibold tracking-[-0.02em] text-sidebar-foreground">Corporate Actions</span>
          <span className="mt-1 block text-[14px] font-semibold tracking-[-0.02em] text-sidebar-primary">Copilot</span>
        </span>
      )}
    </>
  )
}

function AuthMessage({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <div className="mb-4 flex justify-center"><PwCMark /></div>
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
        {action ? <div className="mt-6">{action}</div> : null}
      </div>
    </div>
  )
}
