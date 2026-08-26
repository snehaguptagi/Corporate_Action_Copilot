import { useListTasks, useResolveTask, getListTasksQueryKey, getGetDashboardQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { CheckCircle, Clock, AlertTriangle } from "lucide-react";
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

  const getPriorityIcon = (priority: string) => {
    switch(priority.toUpperCase()) {
      case 'HIGH': return <AlertTriangle className="w-4 h-4 text-destructive" />;
      case 'MEDIUM': return <Clock className="w-4 h-4 text-warning" />;
      default: return <CheckCircle className="w-4 h-4 text-slate-400" />;
    }
  };

  if (isLoading) {
    return <div className="p-8">Loading tasks...</div>;
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto">
      <div className="border-b bg-white px-8 py-6 shrink-0">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Tasks & Risk Management</h1>
        <p className="text-sm text-slate-500 mt-1">Review and resolve operational flags and maker-checker tasks.</p>
      </div>
      
      <div className="p-8">
        <Card>
          <CardHeader className="bg-white border-b">
            <CardTitle>Open Tasks</CardTitle>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="w-[50px]"></TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Related Event</TableHead>
                <TableHead>Due</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tasks?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-slate-500">
                    No active tasks.
                  </TableCell>
                </TableRow>
              ) : (
                tasks?.map(task => (
                  <TableRow key={task.id}>
                    <TableCell>{getPriorityIcon(task.priority)}</TableCell>
                    <TableCell>
                      <div className="font-medium text-slate-900">{task.title}</div>
                      <div className="text-xs text-slate-500">{task.detail}</div>
                    </TableCell>
                    <TableCell><Badge variant="outline">{task.category}</Badge></TableCell>
                    <TableCell>
                      <Link href={`/events/${task.eventId}`}>
                        <Button variant="link" className="p-0 h-auto text-xs font-mono">View Event</Button>
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-slate-600">
                      {task.due}
                    </TableCell>
                    <TableCell>
                      <Badge variant={task.status === 'OPEN' ? 'warning' : 'success'}>
                        {task.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        size="sm" 
                        variant="outline"
                        disabled={task.status !== 'OPEN' || resolveTask.isPending}
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
