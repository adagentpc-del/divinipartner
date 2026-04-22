import { Link, useLocation } from "wouter";
import { UserButton } from "@clerk/react";
import {
  LayoutDashboard,
  Users,
  FileText,
  FolderOpen,
  Tags,
  Package,
  Menu,
  ChevronDown,
  Truck,
  ShoppingCart,
  Boxes,
  UserCog,
  Inbox,
  Sparkles,
  Calculator,
  Banknote,
  ClipboardCheck,
  Workflow,
  BarChart3,
  Rocket,
  Activity,
  MessageSquare,
  Crown,
  Briefcase,
  ShieldCheck,
  HelpCircle,
  BookOpen,
  Cloud,
  Layers,
  Wrench,
  Megaphone,
  Settings as SettingsIcon,
} from "lucide-react";
import { FeedbackButton } from "@/components/admin/FeedbackButton";
import { DemoModeBanner, DemoModeToggle } from "@/components/admin/DemoModeBanner";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type NavItem = { name: string; href: string; icon: React.ComponentType<{ className?: string }> };
type NavGroup = { name: string; icon: React.ComponentType<{ className?: string }>; items: NavItem[] };

// Top-level items kept inline. These are the highest-frequency destinations
// that internal admins use daily — keeping them as flat tabs avoids burying
// the primary workflow in a dropdown.
const PRIMARY_NAV: NavItem[] = [
  { name: "Dashboard",   href: "/admin",            icon: LayoutDashboard },
  { name: "Partners",    href: "/admin/partners",   icon: Users },
  { name: "Orders",      href: "/admin/orders",     icon: ShoppingCart },
  { name: "Fulfillment", href: "/admin/fulfillment", icon: Truck },
  { name: "Production",  href: "/admin/production", icon: ClipboardCheck },
  { name: "Analytics",   href: "/admin/analytics",  icon: BarChart3 },
];

// Everything else is grouped behind labeled dropdowns. Order matters here —
// inside each group, the most-used item is first.
const NAV_GROUPS: NavGroup[] = [
  { name: "Catalog", icon: Layers, items: [
    { name: "Products",         href: "/admin/products",          icon: Package },
    { name: "Product Families", href: "/admin/product-families",  icon: Boxes },
    { name: "Inventory",        href: "/admin/inventory",         icon: Boxes },
    { name: "Pricing",          href: "/admin/pricing",           icon: Tags },
    { name: "Suppliers",        href: "/admin/suppliers",         icon: Truck },
    { name: "Assets",           href: "/admin/assets",            icon: FolderOpen },
    { name: "Quote Ingestion",  href: "/admin/quote-ingestion",   icon: Sparkles },
  ] },
  { name: "Operations", icon: Wrench, items: [
    { name: "Workflow",    href: "/admin/workflow",   icon: Workflow },
    { name: "Onboarding",  href: "/admin/onboarding", icon: Inbox },
    { name: "Requests",    href: "/admin/requests",   icon: FileText },
    { name: "Vendor View", href: "/admin/vendor",     icon: Truck },
    { name: "Feedback",    href: "/admin/feedback",   icon: MessageSquare },
  ] },
  { name: "Commerce", icon: Banknote, items: [
    { name: "Commercial",     href: "/admin/commercial",     icon: Crown },
    { name: "Sales",          href: "/admin/sales",          icon: Briefcase },
    { name: "Billing",        href: "/admin/billing",        icon: Banknote },
    { name: "Reconciliation", href: "/admin/reconciliation", icon: Calculator },
  ] },
  { name: "Platform", icon: SettingsIcon, items: [
    { name: "Launch",      href: "/admin/launch",       icon: Rocket },
    { name: "Post-Launch", href: "/admin/post-launch",  icon: Activity },
    { name: "Rollout",     href: "/admin/rollout",      icon: ShieldCheck },
    { name: "Deployment",  href: "/admin/deployment",   icon: Cloud },
    { name: "Users",       href: "/admin/users",        icon: UserCog },
    { name: "Settings",    href: "/admin/settings",     icon: SettingsIcon },
    { name: "Help",        href: "/admin/help",         icon: HelpCircle },
    { name: "Runbook",     href: "/admin/help/runbook", icon: BookOpen },
  ] },
];

// Flat list used for the mobile sheet, where horizontal real-estate isn't an
// issue and grouping is achieved with section headings.
const ALL_GROUPS: NavGroup[] = [
  { name: "Primary", icon: Megaphone, items: PRIMARY_NAV },
  ...NAV_GROUPS,
];

function isHrefActive(location: string, href: string) {
  if (href === "/admin") return location === "/admin";
  return location === href || location.startsWith(href + "/") || location.startsWith(href + "?");
}

function PrimaryTab({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link href={item.href}>
      <div
        data-testid={`nav-${item.href.replace(/[/]/g, "-")}`}
        className={`px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
          active
            ? "bg-muted text-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
        }`}
      >
        {item.name}
      </div>
    </Link>
  );
}

function GroupDropdown({ group, location }: { group: NavGroup; location: string }) {
  const groupActive = group.items.some(i => isHrefActive(location, i.href));
  const Icon = group.icon;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          data-testid={`nav-group-${group.name.toLowerCase()}`}
          className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
            groupActive
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
          }`}
        >
          {group.name}
          <ChevronDown className="h-3.5 w-3.5 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          <Icon className="h-3.5 w-3.5" /> {group.name}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {group.items.map(item => {
          const active = isHrefActive(location, item.href);
          const ItemIcon = item.icon;
          return (
            <DropdownMenuItem key={item.href} asChild className={active ? "bg-muted" : ""}>
              <Link href={item.href}>
                <div className="flex items-center gap-2 w-full">
                  <ItemIcon className="h-4 w-4 opacity-70" />
                  <span className="flex-1">{item.name}</span>
                </div>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileNav({ location }: { location: string }) {
  return (
    <nav className="p-3 space-y-4">
      {ALL_GROUPS.map(group => (
        <div key={group.name}>
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground px-3 mb-1">{group.name}</div>
          <div className="space-y-0.5">
            {group.items.map(item => {
              const active = isHrefActive(location, item.href);
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href}>
                  <div className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    active
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}>
                    <Icon className="h-4 w-4" />
                    {item.name}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  return (
    <div className="min-h-screen bg-muted/40">
      <DemoModeBanner />
      <header className="sticky top-0 z-30 bg-card/80 backdrop-blur-lg border-b">
        <div className="flex h-16 items-center gap-4 px-4 md:px-6 max-w-screen-2xl mx-auto">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="xl:hidden shrink-0" data-testid="btn-mobile-nav">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0 overflow-y-auto">
              <div className="p-5 border-b">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-bold text-sm tracking-tight">A3</div>
                  <div>
                    <p className="font-semibold text-sm">A3 Visual</p>
                    <p className="text-xs text-muted-foreground">Partner Portal</p>
                  </div>
                </div>
              </div>
              <MobileNav location={location} />
            </SheetContent>
          </Sheet>

          <div className="hidden xl:flex items-center gap-3 mr-4 shrink-0">
            <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center text-primary-foreground font-bold text-xs tracking-tight">A3</div>
            <div className="flex flex-col">
              <span className="font-semibold text-sm leading-tight">A3 Visual</span>
              <span className="text-[11px] text-muted-foreground leading-tight">Partner Portal</span>
            </div>
          </div>

          {/* Desktop nav: primary tabs visible inline, secondary tabs grouped
              into hover/click dropdowns. min-w-0 + overflow-hidden prevents
              the row from forcing horizontal scroll on narrow desktops. */}
          <nav className="hidden xl:flex items-center gap-1 flex-1 min-w-0 overflow-hidden">
            {PRIMARY_NAV.map(item => (
              <PrimaryTab key={item.href} item={item} active={isHrefActive(location, item.href)} />
            ))}
            <div className="mx-2 h-5 w-px bg-border shrink-0" aria-hidden />
            {NAV_GROUPS.map(group => (
              <GroupDropdown key={group.name} group={group} location={location} />
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3 shrink-0">
            <DemoModeToggle />
            <UserButton afterSignOutUrl="/login" />
          </div>
        </div>
      </header>

      <main className="p-4 md:p-8 max-w-screen-2xl mx-auto w-full">
        {children}
      </main>
      <FeedbackButton />
    </div>
  );
}
