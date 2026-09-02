import { useListAudit } from "@workspace/api-client-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatIstDate } from "@/lib/date";

export default function AuditLog() {
  const { data: audits, isLoading } = useListAudit();

  if (isLoading) return <div className="p-8">Loading audit trail...</div>;

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-slate-50/50">
      <div className="border-b bg-card px-8 py-4 shrink-0">
        <h1 className="text-[28px] font-semibold tracking-tight text-foreground">Audit trail</h1>
        <p className="text-sm text-slate-500 mt-1">Immutable record of all operational decisions and actions.</p>
      </div>

      <div className="p-8">
        <Card>
          <CardHeader className="bg-card border-b">
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="text-right">Timestamp</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Event Reference</TableHead>
                <TableHead>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audits?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-slate-500">
                    No audit records found.
                  </TableCell>
                </TableRow>
              ) : (
                audits?.map(entry => (
                  <TableRow key={entry.id}>
                     <TableCell className="figure text-sm text-muted-foreground">
                      {formatIstDate(entry.timestamp)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold">
                          {entry.actor.substring(0, 2).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium">{entry.actor}</span>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="secondary">{entry.action}</Badge></TableCell>
                    <TableCell className="font-mono text-xs">{entry.eventId}</TableCell>
                    <TableCell className="text-sm text-slate-600">{entry.detail}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
