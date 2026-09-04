import { useListTasks, useResolveTask, getListTasksQueryKey, getGetDashboardQueryKey } from "@workspace/api-client-react";
import { ClipboardCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { InfoHint } from "@/components/InfoHint";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

export default function TasksList() {
  const { data: tasks, isLoading } = useListTasks();
  const resolveTask = useResolveTask();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleResolve = (taskId: string) => {
    resolveTask.mutate({ taskId }, {
      onSuccess: () => {
        toast({ title: "Task resolved successfully" });
        queryClient.invalidateQueries({ queryKey: getListTasksQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetDashboardQueryKey() });
      }
    });
  };

  if (isLoading) {
    return <div className="p-8">Loading tasks...</div>;
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto">
      <div className="border-b bg-card px-8 py-4 shrink-0">
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight text-slate-900"><ClipboardCheck className="h-6 w-6 text-primary" />Approvals
          <InfoHint title="This page">
            No decision goes through on one person's word. The Fund Manager proposes what to do, and Compliance reviews and approves or sends it back. This page lists everything waiting for that second pair of eyes.
          </InfoHint>
        </h1>
        <p className="text-sm text-slate-500 mt-1">Decisions proposed by the Fund Manager wait here for a Compliance sign-off, alongside operational flags to resolve.</p>
      </div>
      
      <div className="p-8">
        <Card>
          <CardHeader className="bg-card border-b">
            <CardTitle>Open Tasks</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead>Task</TableHead>
                <TableHead className="whitespace-nowrap">Category<InfoHint title="Category" className="ml-1 align-bottom">The type of approval or review required.</InfoHint></TableHead>
                <TableHead className="whitespace-nowrap">Related Event<InfoHint title="Related Event" className="ml-1 align-bottom">The corporate action case this task belongs to.</InfoHint></TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks?.length === 0 ? (
                <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                    No active tasks.
                  </TableCell>
                </TableRow>
              ) : (
                tasks?.map((task, index) => (
                  <TableRow key={`${task.id}-${index}`}>
                    <TableCell>
                      <div className="font-medium text-slate-900">{task.title}</div>
                      <div className="text-xs text-slate-500">{task.detail}</div>
                    </TableCell>
                    <TableCell><Badge variant="outline">{task.category}</Badge></TableCell>
                    <TableCell>
                      <Link href={`/events/${task.eventId}`}>
                        <Button variant="link" className="p-0 h-auto text-xs">View Event</Button>
                      </Link>
                    </TableCell>
                    <TableCell className="figure text-sm text-slate-600">
                      {task.due}
                    </TableCell>
                    <TableCell>
                      <Badge variant={task.status === "Open" ? "warning" : "success"}>
                        {task.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        size="sm" 
                        variant="outline"
                        disabled={task.status !== "Open" || resolveTask.isPending}
                        onClick={() => handleResolve(task.id)}
                      >
                        Resolve
                      </Button>
                    </TableCell>
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
