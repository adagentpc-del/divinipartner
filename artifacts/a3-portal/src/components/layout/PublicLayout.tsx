export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background font-sans text-foreground selection:bg-primary/20">
      {children}
    </div>
  );
}
