import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Shell } from '@/components/layout/Shell';
import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

import Dashboard from '@/pages/Dashboard';
import EventsList from '@/pages/EventsList';
import TasksList from '@/pages/TasksList';
import AuditLog from '@/pages/AuditLog';
import NoticeIntake from '@/pages/NoticeIntake';
import FundManagerDesk from '@/pages/FundManagerDesk';
import SchemeDetail from '@/pages/SchemeDetail';
import Portfolio from '@/pages/Portfolio';
import Analysis from '@/pages/Analysis';

const queryClient = new QueryClient();

function Router() {
  return (
    <Shell>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/events" component={EventsList} />
          <Route path="/portfolio" component={Portfolio} />
          <Route path="/analysis" component={Analysis} />
          <Route path="/intake" component={NoticeIntake} />
          <Route path="/events/:eventId" component={FundManagerDesk} />
          <Route path="/schemes/:schemeId" component={SchemeDetail} />
          <Route path="/tasks" component={TasksList} />
          <Route path="/audit" component={AuditLog} />
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </Shell>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
