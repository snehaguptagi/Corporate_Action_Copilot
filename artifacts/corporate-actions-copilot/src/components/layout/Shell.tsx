import { ReactNode } from "react"
import { Link, useLocation } from "wouter"
import { LayoutDashboard, FileText, CheckSquare, History, ShieldAlert, Upload, LogIn, LogOut, Landmark } from "lucide-react"
import { useAuth } from "@workspace/replit-auth-web"
import {
  getGetSessionQueryKey,
  useGetSession,
  useSignInSession,
  type OperationalActor,
} from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { demoRoles } from "@/lib/demo-role"

export function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation()
  const { user, isLoading: authLoading, isAuthenticated, login, logout } = useAuth()
  const queryClient = useQueryClient()
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
  const switchOperator = useSignInSession({
    mutation: {
      onSuccess: (session) => {
        queryClient.setQueryData(getGetSessionQueryKey(), session)
        void queryClient.invalidateQueries({ queryKey: getGetSessionQueryKey() })
      },
    },
  })
  
  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/events", label: "Event Inbox", icon: FileText },
    { href: "/intake", label: "Notice Intake", icon: Upload },
    { href: "/desk", label: "Fund Manager Desk", icon: Landmark },
    { href: "/tasks", label: "Tasks & Risk", icon: CheckSquare },
    { href: "/audit", label: "Audit Trail", icon: History },
  ]
  
  // Use simple matching to highlight active menu item
  const isActive = (href: string) => {
    if (href === "/") return location === "/"
    return location.startsWith(href)
  }
  
  if (authLoading) {
    return <AuthMessage title="Checking your identity…" detail="Connecting to the enterprise sign-in service." />
  }

  if (!isAuthenticated) {
    return (
      <AuthMessage
        title="Sign in to Impact Copilot"
        detail="Use your approved enterprise identity to access corporate-actions operations."
        action={<button onClick={login} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"><LogIn className="h-4 w-4" /> Sign in</button>}
      />
    )
  }

  if (roleLoading) {
    return <AuthMessage title="Loading your operations permissions…" detail="Checking the authoritative role directory." />
  }

  if (roleError || !activeRole) {
    return (
      <AuthMessage
        title="Operational access is not assigned"
        detail={`Your identity${user?.email ? ` (${user.email})` : ""} is authenticated, but no maker, checker, or manager role is assigned.`}
        action={<button onClick={logout} className="inline-flex items-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium"><LogOut className="h-4 w-4" /> Sign out</button>}
      />
    )
  }

  const initials = activeRole.name.split(" ").map((name) => name[0]).join("")

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="hidden w-64 border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex lg:flex-col lg:shrink-0">
        <div className="h-14 flex items-center px-4 border-b border-sidebar-border/50 shrink-0">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <div className="w-6 h-6 rounded bg-primary flex items-center justify-center">
              <ShieldAlert className="w-3.5 h-3.5 text-primary-foreground" />
            </div>
            <span>Impact Copilot</span>
          </div>
        </div>
        
        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          <div className="text-xs font-semibold text-sidebar-foreground/50 uppercase tracking-wider mb-2 px-2 mt-4">
            Operations
          </div>
          {navItems.map((item) => {
            const active = isActive(item.href)
            return (
              <Link key={item.href} href={item.href}>
                <button
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    active 
                      ? "bg-sidebar-primary/10 text-sidebar-primary" 
                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <item.icon className="w-4 h-4 shrink-0" />
                  {item.label}
                </button>
              </Link>
            )
          })}
        </nav>
        
        <div className="mx-3 mb-3 rounded border border-sidebar-border/80 bg-sidebar-accent/50 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground/50 font-semibold">Signed-in operator</div>
          <div className="mt-1 truncate text-xs text-sidebar-foreground">{activeRole.name}</div>
          <div className="mt-0.5 text-[11px] text-sidebar-foreground/60">{activeRole.role}</div>
        </div>
        {import.meta.env.DEV && (
          <div className="mx-3 mb-3">
            <OperatorSwitcher
              id="desktop-demo-operator"
              activeRole={activeRole}
              disabled={switchOperator.isPending}
              hasError={switchOperator.isError}
              onChange={(actorId) => switchOperator.mutate({ data: { actorId } })}
            />
          </div>
        )}
        <div className="p-4 border-t border-sidebar-border/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-sm font-medium">
              {initials}
            </div>
            <div className="flex flex-col text-sm">
              <span className="font-medium leading-none">{activeRole.name}</span>
              <span className="text-xs text-sidebar-foreground/60 mt-1">{activeRole.role}</span>
            </div>
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
            <span className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/60">Enterprise access</span>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
            {navItems.map((item) => {
              const active = isActive(item.href)
              return (
                <Link key={item.href} href={item.href}>
                  <button
                    className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                      active
                        ? "bg-sidebar-primary/15 text-sidebar-primary-foreground"
                        : "text-sidebar-foreground/75 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    }`}
                  >
                    <item.icon className="h-3.5 w-3.5" />
                    {item.label}
                  </button>
                </Link>
              )
            })}
          </nav>
          {import.meta.env.DEV && (
            <div className="px-3 pb-3">
              <OperatorSwitcher
                id="mobile-demo-operator"
                activeRole={activeRole}
                disabled={switchOperator.isPending}
                hasError={switchOperator.isError}
                onChange={(actorId) => switchOperator.mutate({ data: { actorId } })}
              />
            </div>
          )}
        </div>
        {children}
      </main>
    </div>
  )
}

function OperatorSwitcher({
  id,
  activeRole,
  disabled,
  hasError,
  onChange,
}: {
  id: string
  activeRole: OperationalActor
  disabled: boolean
  hasError: boolean
  onChange: (actorId: string) => void
}) {
  return (
    <div className="rounded border border-sidebar-border/80 bg-sidebar-accent/50 px-3 py-2">
      <label htmlFor={id} className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
        Demo operator
      </label>
      <select
        id={id}
        value={activeRole.id}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded border border-sidebar-border bg-sidebar px-2 py-1.5 text-xs text-sidebar-foreground disabled:opacity-60"
      >
        {demoRoles.map((role) => (
          <option key={role.id} value={role.id}>{role.name} · {role.role}</option>
        ))}
      </select>
      {hasError && <p className="mt-1 text-[11px] text-rose-300">Could not switch operator.</p>}
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
