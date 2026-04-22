import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Users, 
  Wallet, 
  Package, 
  AlertTriangle, 
  Search, 
  TrendingUp,
  Calendar,
  ArrowRight
} from 'lucide-react';
import { useDashboardKPIs, useSearch, useSeedData } from '@/hooks/useDatabase';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency, formatNumber, formatDate } from '@/lib/validation';
import { getUnreadCount } from '@/lib/notifications';
import { db } from '@/services/database';
import type { SearchResult } from '@/types';

interface DashboardProps {
  onNavigate: (page: string, params?: any) => void;
}

export function Dashboard({ onNavigate }: DashboardProps) {
  const { kpis, refresh: refreshKPIs } = useDashboardKPIs();
  const { user, canCreate } = useAuth();
  const { seed } = useSeedData();
  const [searchQuery, setSearchQuery] = useState('');
  const [showResults, setShowResults] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const searchResults = useSearch(searchQuery);

  useEffect(() => {
    setNotificationCount(getUnreadCount());
    const unsubscribe = db.subscribe(() => {
      setNotificationCount(getUnreadCount());
    });
    const interval = setInterval(() => {
      setNotificationCount(getUnreadCount());
    }, 60000);
    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setShowResults(true);
  };

  const handleResultClick = (result: SearchResult) => {
    setShowResults(false);
    setSearchQuery('');
    if (result.type === 'parent') {
      onNavigate('parent-detail', { pNo: result.id });
    } else {
      onNavigate('child-detail', { childId: result.id });
    }
  };

  const handleSeedData = () => {
    seed();
    refreshKPIs();
  };

  const kpiCards = [
    {
      title: 'Monthly Disbursement',
      value: formatCurrency(kpis.totalMonthlyDisbursement),
      description: 'Total active grants',
      icon: Wallet,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50'
    },
    {
      title: 'Registered Children',
      value: formatNumber(kpis.totalChildrenRegistered),
      description: 'Total beneficiaries',
      icon: Users,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50'
    },
    {
      title: 'Pending Gadgets',
      value: formatNumber(kpis.pendingGadgetRequests),
      description: 'Reimbursement requests',
      icon: Package,
      color: 'text-amber-600',
      bgColor: 'bg-amber-50'
    },
    {
      title: 'Expiring Grants',
      value: formatNumber(kpis.expiringGrantsCount),
      description: 'Within 30 days',
      icon: AlertTriangle,
      color: 'text-red-600',
      bgColor: 'bg-red-50'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Dashboard</h1>
          <p className="text-slate-500 dark:text-slate-400">Welcome back, {user?.Full_Name}</p>
        </div>
        <div className="flex items-center gap-3">
          {canCreate('parents') && (
            <Button onClick={() => onNavigate('parent-new')}>
              + Add Parent
            </Button>
          )}
          {canCreate('children') && (
            <Button variant="outline" onClick={() => onNavigate('child-new')}>
              + Add Child
            </Button>
          )}
          <Button variant="outline" onClick={handleSeedData}>
            Load Sample Data
          </Button>
        </div>
      </div>

      {/* Universal Search */}
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={handleSearch} className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              placeholder="Search by P/No, O/No, or Child Name..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowResults(e.target.value.length > 0);
              }}
              className="pl-10 h-12 text-lg"
            />
            {showResults && searchQuery && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-lg shadow-lg z-50 max-h-80 overflow-auto">
                {searchResults.length > 0 ? (
                  searchResults.map((result, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => handleResultClick(result)}
                      className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b last:border-b-0 flex items-center justify-between"
                    >
                      <div>
                        <p className="font-medium">{result.title}</p>
                        <p className="text-sm text-slate-500">{result.subtitle}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={result.type === 'parent' ? 'default' : 'secondary'}>
                          {result.type === 'parent' ? 'Parent' : 'Child'}
                        </Badge>
                        {result.status && (
                          <Badge variant="outline">{result.status}</Badge>
                        )}
                        <ArrowRight className="w-4 h-4 text-slate-400" />
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-3 text-slate-500">No results found</div>
                )}
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((kpi, index) => (
          <Card key={index} className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500">{kpi.title}</p>
                  <p className="text-2xl font-bold mt-1">{kpi.value}</p>
                  <p className="text-xs text-slate-400 mt-1">{kpi.description}</p>
                </div>
                <div className={`${kpi.bgColor} p-3 rounded-lg`}>
                  <kpi.icon className={`w-5 h-5 ${kpi.color}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Grants by Category */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Grants by Disability Category
            </CardTitle>
            <CardDescription>Distribution of grants across categories A, B, and C</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {kpis.grantsByCategory.map((category) => (
                <div key={category.category} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm
                      ${category.category === 'A' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 
                        category.category === 'B' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' : 
                        'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'}`}>
                      {category.category}
                    </div>
                    <div>
                      <p className="font-medium dark:text-slate-200">Category {category.category}</p>
                      <p className="text-sm text-slate-500 dark:text-slate-400">{category.count} children</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-bold dark:text-slate-100">{formatCurrency(category.amount)}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">monthly</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5" />
              Quick Actions
            </CardTitle>
            <CardDescription>Common tasks and shortcuts</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <Button 
                variant="outline" 
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => onNavigate('parents')}
              >
                <Users className="w-6 h-6" />
                <span>View All Parents</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => onNavigate('grants')}
              >
                <Wallet className="w-6 h-6" />
                <span>Manage Grants</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => onNavigate('gadgets')}
              >
                <Package className="w-6 h-6" />
                <span>Gadget Requests</span>
              </Button>
              <Button 
                variant="outline" 
                className="h-auto py-4 flex flex-col items-center gap-2"
                onClick={() => onNavigate('reports')}
              >
                <TrendingUp className="w-6 h-6" />
                <span>Reports</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
