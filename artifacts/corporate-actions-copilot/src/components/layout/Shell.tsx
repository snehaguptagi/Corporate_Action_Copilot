import { ReactNode } from "react"
import { Link, useLocation } from "wouter"
import { LayoutDashboard, FileText, CheckSquare, History, ShieldAlert } from "lucide-react"

export function Shell({ children }: { children: ReactNode }) {
  const [location] = useLocation()
  
  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/events", label: "Event Inbox", icon: FileText },
    { href: "/tasks", label: "Tasks & Risk", icon: CheckSquare },
    { href: "/audit", label: "Audit Trail", icon: History },
  ]
  
  // Use simple matching to highlight active menu item
  const isActive = (href: string) => {
    if (href === "/") return location === "/"
    return location.startsWith(href)
  }
  
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Sidebar */}
      <aside className="w-64 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col shrink-0">
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
        
        <div className="p-4 border-t border-sidebar-border/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-sidebar-accent flex items-center justify-center text-sm font-medium">
              OP
            </div>
            <div className="flex flex-col text-sm">
              <span className="font-medium leading-none">Ops Analyst</span>
              <span className="text-xs text-sidebar-foreground/60 mt-1">London Desk</span>
            </div>
          </div>
        </div>
      </aside>
      
      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-background">
        {children}
      </main>
    </div>
  )
}
