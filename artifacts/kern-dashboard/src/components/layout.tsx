import { ReactNode, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Activity, LayoutDashboard, Users, FileText, Settings, Terminal, Menu } from "lucide-react";
import { useGetMe } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { data: me, isLoading } = useGetMe();

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  const links = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/sessions", label: "Sessions", icon: Activity },
    { href: "/standups", label: "Standups", icon: FileText },
    { href: "/team", label: "Team", icon: Users },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  const NavLinks = () => (
    <>
      {links.map((link) => {
        const isActive = location === link.href || (link.href !== "/" && location.startsWith(link.href));
        const Icon = link.icon;
        return (
          <Link 
            key={link.href} 
            href={link.href}
            className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              isActive 
                ? "bg-primary/20 text-accent border border-accent/20 shadow-[0_0_10px_rgba(0,123,114,0.1)]" 
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
            data-testid={`nav-${link.label.toLowerCase()}`}
          >
            <Icon className={`mr-3 h-5 w-5 ${isActive ? "text-accent" : "text-muted-foreground"}`} />
            {link.label}
          </Link>
        );
      })}
    </>
  );

  const UserProfile = () => (
    <div className="flex items-center w-full">
      <Avatar className="h-10 w-10 border border-border">
        <AvatarImage src={me?.avatarUrl || ""} alt={me?.name || ""} />
        <AvatarFallback className="bg-primary text-primary-foreground font-mono">
          {me?.name?.charAt(0) || "?"}
        </AvatarFallback>
      </Avatar>
      <div className="ml-3 flex-1 overflow-hidden">
        <p className="text-sm font-medium text-foreground truncate">{me?.name}</p>
        <p className="text-xs text-muted-foreground truncate font-mono">{me?.role}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background text-foreground flex overflow-hidden font-sans">
      {/* Desktop Sidebar */}
      <aside className="w-64 border-r border-border bg-card flex flex-col hidden md:flex z-10 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
        <div className="h-16 flex items-center px-6 border-b border-border relative z-10">
          <Terminal className="h-6 w-6 text-accent mr-2" />
          <span className="font-mono font-bold tracking-tight text-lg text-foreground">KERN_</span>
        </div>
        
        <nav className="flex-1 py-6 px-3 space-y-1 relative z-10">
          <NavLinks />
        </nav>

        <div className="p-4 border-t border-border relative z-10 bg-card">
          {isLoading ? (
            <div className="flex items-center space-x-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ) : me ? (
            <UserProfile />
          ) : null}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-primary/10 via-background to-background pointer-events-none" />
        
        {/* Mobile Header */}
        <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 md:hidden relative z-10">
           <div className="flex items-center">
             <Terminal className="h-6 w-6 text-accent mr-2" />
             <span className="font-mono font-bold">KERN_</span>
           </div>
           <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden text-foreground">
                <Menu className="h-6 w-6" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0 bg-card border-r border-border flex flex-col">
              <SheetTitle className="sr-only">Navigation Menu</SheetTitle>
              <div className="h-16 flex items-center px-6 border-b border-border">
                <Terminal className="h-6 w-6 text-accent mr-2" />
                <span className="font-mono font-bold tracking-tight text-lg">KERN_</span>
              </div>
              <nav className="flex-1 py-6 px-3 space-y-1">
                <NavLinks />
              </nav>
              <div className="p-4 border-t border-border">
                {isLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : me ? (
                  <UserProfile />
                ) : null}
              </div>
            </SheetContent>
          </Sheet>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-8 relative z-10">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}