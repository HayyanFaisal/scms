import { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Wallet, 
  FileSpreadsheet, 
  Settings, 
  LogOut, 
  Bell,
  Menu,
  X,
  Shield,
  User
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Login } from '@/sections/Login';
import { Dashboard } from '@/sections/Dashboard';
import { ParentManagement, ParentDetail } from '@/sections/ParentManagement';
import { ParentForm } from '@/sections/ParentForm';
import { GrantGadgetManager } from '@/sections/GrantGadgetManager';
import { ReportsExports } from '@/sections/ReportsExports';
import { useAuth } from '@/hooks/useAuth';
import { getAllNotifications, getUnreadCount } from '@/lib/notifications';
import { db } from '@/services/database';
import './App.css';

type Page = 
  | 'dashboard' 
  | 'parents' 
  | 'parent-new' 
  | 'parent-edit' 
  | 'parent-detail'
  | 'grants'
  | 'reports'
  | 'settings';

interface NavigationItem {
  id: Page;
  label: string;
  icon: React.ElementType;
  roles?: string[];
}

const navigation: NavigationItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'parents', label: 'Beneficiaries', icon: Users },
  { id: 'grants', label: 'Grants & Gadgets', icon: Wallet },
  { id: 'reports', label: 'Reports', icon: FileSpreadsheet },
];

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!db.getCurrentUser());
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [pageParams, setPageParams] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [notifications, setNotifications] = useState<any[]>([]);
  const { user, logout, canRead } = useAuth();

  useEffect(() => {
    setIsAuthenticated(!!db.getCurrentUser());
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      const updateNotifications = () => {
        setNotificationCount(getUnreadCount());
        setNotifications(getAllNotifications());
      };
      updateNotifications();
      const interval = setInterval(updateNotifications, 60000);
      return () => clearInterval(interval);
    }
  }, [isAuthenticated]);

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    logout();
    setIsAuthenticated(false);
    setCurrentPage('dashboard');
  };

  const navigateTo = (page: Page, params?: any) => {
    setCurrentPage(page);
    setPageParams(params);
    setSidebarOpen(false);
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        return <Dashboard onNavigate={navigateTo} />;
      case 'parents':
        return <ParentManagement onNavigate={navigateTo} />;
      case 'parent-new':
        return <ParentForm onSave={() => navigateTo('parents')} onCancel={() => navigateTo('parents')} />;
      case 'parent-edit':
        return <ParentForm pNo={pageParams?.pNo} onSave={() => navigateTo('parents')} onCancel={() => navigateTo('parents')} />;
      case 'parent-detail':
        return (
          <ParentDetail 
            pNo={pageParams?.pNo} 
            onNavigate={navigateTo} 
            onBack={() => navigateTo('parents')} 
          />
        );
      case 'grants':
        return <GrantGadgetManager onNavigate={navigateTo} />;
      case 'reports':
        return <ReportsExports onNavigate={navigateTo} />;
      default:
        return <Dashboard onNavigate={navigateTo} />;
    }
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  const filteredNav = navigation.filter(item => 
    !item.roles || item.roles.includes(user?.Role || '')
  );

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-slate-200 fixed h-full">
        <div className="p-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-slate-900 leading-tight">SCMS</h1>
              <p className="text-xs text-slate-500">Welfare Division</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-auto">
          {filteredNav.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id || currentPage.startsWith(item.id + '-');
            
            return (
              <button
                key={item.id}
                onClick={() => navigateTo(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors
                  ${isActive 
                    ? 'bg-primary/10 text-primary font-medium' 
                    : 'text-slate-600 hover:bg-slate-100'
                  }`}
              >
                <Icon className="w-5 h-5" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-200">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center">
              <User className="w-5 h-5 text-slate-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate">{user?.Full_Name}</p>
              <p className="text-xs text-slate-500">{user?.Role}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-64 p-0">
          <div className="p-6 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary flex items-center justify-center">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-slate-900 leading-tight">SCMS</h1>
                <p className="text-xs text-slate-500">Welfare Division</p>
              </div>
            </div>
          </div>

          <nav className="p-4 space-y-1">
            {filteredNav.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              
              return (
                <button
                  key={item.id}
                  onClick={() => navigateTo(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors
                    ${isActive 
                      ? 'bg-primary/10 text-primary font-medium' 
                      : 'text-slate-600 hover:bg-slate-100'
                    }`}
                >
                  <Icon className="w-5 h-5" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <main className="flex-1 lg:ml-64">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Sheet>
                <SheetTrigger asChild className="lg:hidden">
                  <Button variant="ghost" size="icon">
                    <Menu className="w-5 h-5" />
                  </Button>
                </SheetTrigger>
              </Sheet>
              <h2 className="text-lg font-semibold text-slate-900">
                {filteredNav.find(n => n.id === currentPage || currentPage.startsWith(n.id + '-'))?.label || 'Dashboard'}
              </h2>
            </div>

            <div className="flex items-center gap-3">
              {/* Notifications */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative">
                    <Bell className="w-5 h-5" />
                    {notificationCount > 0 && (
                      <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 bg-red-500">
                        {notificationCount}
                      </Badge>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-slate-500">
                      No notifications
                    </div>
                  ) : (
                    notifications.slice(0, 5).map((notif) => (
                      <DropdownMenuItem key={notif.id} className="flex flex-col items-start p-3">
                        <div className="flex items-center gap-2 w-full">
                          <Badge variant={notif.type === 'warning' ? 'destructive' : 'default'}>
                            {notif.type}
                          </Badge>
                          <span className="text-xs text-slate-500 ml-auto">
                            {new Date(notif.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="font-medium mt-1">{notif.title}</p>
                        <p className="text-sm text-slate-500">{notif.message}</p>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* User Menu */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <User className="w-4 h-4 text-primary" />
                    </div>
                    <span className="hidden sm:inline">{user?.Full_Name}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem className="flex flex-col items-start">
                    <span className="font-medium">{user?.Full_Name}</span>
                    <span className="text-xs text-slate-500">{user?.Role}</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="p-4 sm:p-6 max-w-7xl mx-auto">
          {renderPage()}
        </div>
      </main>
    </div>
  );
}

export default App;
