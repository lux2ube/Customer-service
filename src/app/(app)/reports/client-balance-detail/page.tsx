import { PageHeader } from "@/components/page-header";
import { ClientBalanceDetailReport } from "@/components/client-balance-detail-report";

export default function ClientBalanceDetailPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Client Balance Detail"
        description="View detailed record-by-record balance tracking for each client"
      />
      <ClientBalanceDetailReport />
    </div>
  );
}
