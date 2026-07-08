import { BottomNav } from "@/components/bottom-nav";

export default function TabsLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <div className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-4">
        {children}
      </div>
      <BottomNav />
    </>
  );
}
