import { Link, useLocation } from "wouter";
import { UserButton } from "@clerk/react";
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  FolderOpen, 
  Tags,
  Menu,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const navigation = [
  { name: "Dashboard", href: "/admin", icon: LayoutDashboard },
  { name: "Partners", href: "/admin/partners", icon: Users },
  { name: "Requests", href: "/admin/requests", icon: FileText },
  { name: "Assets", href: "/admin/assets", icon: FolderOpen },
  { name: "Pricing", href: "/admin/pricing", icon: Tags },
];

function NavItem({ item, isActive }: { item: typeof navigation[0]; isActive: boolean }) {
  return (
    <Link href={item.href}>
      <div className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
        isActive
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground hover:bg-muted"
      }`}>
        <item.icon className="h-4 w-4" />
        {item.name}
      </div>
    </Link>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const isActive = (item: typeof navigation[0]) =>
    location === item.href || (item.href !== "/admin" && location.startsWith(item.href));

  return (
    <div className="min-h-screen bg-muted/40">
      <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-lg border-b">
        <div className="flex h-16 items-center gap-4 px-4 md:px-6 max-w-screen-2xl mx-auto">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden shrink-0">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <div className="p-5 border-b">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-bold text-sm tracking-tight">A3</div>
                  <div>
                    <p className="font-semibold text-sm">A3 Visual</p>
                    <p className="text-xs text-muted-foreground">Partner Portal</p>
                  </div>
                </div>
              </div>
              <nav className="p-3 space-y-1">
                {navigation.map((item) => (
                  <NavItem key={item.name} item={item} isActive={isActive(item)} />
                ))}
              </nav>
            </SheetContent>
          </Sheet>

          <div className="hidden md:flex items-center gap-3 mr-8 shrink-0">
            <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-bold text-xs tracking-tight">A3</div>
            <div className="flex flex-col">
              <span className="font-semibold text-sm leading-tight">A3 Visual</span>
              <span className="text-[11px] text-muted-foreground leading-tight">Partner Portal</span>
            </div>
          </div>

          <nav className="hidden md:flex items-center gap-1 flex-1">
            {navigation.map((item) => {
              const active = isActive(item);
              return (
                <Link key={item.name} href={item.href}>
                  <div className={`px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}>
                    {item.name}
                  </div>
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <UserButton afterSignOutUrl="/login" />
          </div>
        </div>
      </header>

      <main className="p-4 md:p-8 max-w-screen-2xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
