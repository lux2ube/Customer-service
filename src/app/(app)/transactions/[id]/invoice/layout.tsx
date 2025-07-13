
export default function InvoiceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-50 dark:bg-gray-950">
        <main className="min-h-screen flex items-center justify-center py-4 md:py-8">
            {children}
        </main>
    </div>
  );
}

    
