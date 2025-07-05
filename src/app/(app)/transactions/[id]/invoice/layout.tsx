
export default function InvoiceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="bg-gray-100">
        <main className="py-4 md:py-8">
            {children}
        </main>
    </div>
  );
}
