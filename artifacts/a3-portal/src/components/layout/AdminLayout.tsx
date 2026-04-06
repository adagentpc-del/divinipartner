import { Link, useLocation } from "wouter";
import { UserButton } from "@clerk/react";
import { 
  LayoutDashboard, 
  Users, 
  FileText, 
  FolderOpen, 
  Tags,
  Menu
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

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-muted/30">
      <div className="flex h-16 items-center px-4 border-b bg-card">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0">
            <div className="p-4 border-b">
              <h2 className="text-lg font-bold tracking-tight">A3 Visual</h2>
            </div>
            <nav className="p-4 space-y-2">
              {navigation.map((item) => {
                const isActive = location === item.href || (item.href !== "/admin" && location.startsWith(item.href));
                return (
                  <Link key={item.name} href={item.href}>
                    <div className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                      <item.icon className="h-4 w-4" />
                      {item.name}
                    </div>
                  </Link>
                );
              })}
            </nav>
          </SheetContent>
        </Sheet>

        <div className="hidden md:flex items-center gap-2 mr-6">
          <div className="h-8 w-8 bg-primary rounded-md flex items-center justify-center text-primary-foreground font-bold">A3</div>
          <span className="font-semibold tracking-tight">Portal</span>
        </div>

        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-muted-foreground flex-1">
          {navigation.map((item) => {
            const isActive = location === item.href || (item.href !== "/admin" && location.startsWith(item.href));
            return (
              <Link key={item.name} href={item.href}>
                <div className={`transition-colors hover:text-primary ${isActive ? "text-primary font-semibold" : ""}`}>
                  {item.name}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-4">
          <UserButton afterSignOutUrl="/login" />
        </div>
      </div>
      <main className="p-6 max-w-7xl mx-auto w-full">
        {children}
      </main>
    </div>
  );
}
