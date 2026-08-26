import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex-1 flex items-center justify-center bg-slate-50 p-8">
      <Card className="max-w-md w-full shadow-md">
        <CardContent className="pt-6 pb-6 flex flex-col items-center text-center">
          <AlertCircle className="h-12 w-12 text-slate-400 mb-4" />
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Page Not Found</h1>
          <p className="text-slate-500 mb-6">
            The operational view or event you are looking for does not exist or you lack permission to view it.
          </p>
          <Link href="/">
            <Button>Return to Dashboard</Button>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
