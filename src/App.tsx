import { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  Users, 
  Wallet, 
  FileSpreadsheet, 
  LogOut, 
  Bell,
  Menu,
  ChevronLeft,
  ChevronRight,
  Shield,
  User,
  Moon,
  Sun,
  Inbox
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
import { ChildForm } from '@/sections/ChildForm';
import { ChildDetail } from '@/sections/ChildDetail';
import { GrantGadgetManager } from '@/sections/GrantGadgetManager';
import { ReportsExports } from '@/sections/ReportsExports';
import RequestsTab from '@/components/Admin/RequestsTab';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/hooks/useTheme';
import { getAllNotifications, getUnreadCount } from '@/lib/notifications';
import { db } from '@/services/database';
import './App.css';

type Page = 
  | 'dashboard' 
  | 'parents' 
  | 'parent-new' 
  | 'parent-edit' 
  | 'parent-detail'
  | 'child-new'
  | 'child-detail'
  | 'grants'
  | 'reports'
  | 'settings'
  | 'requests';

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
  { id: 'requests', label: 'Requests', icon: Inbox }, 
];

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => !!db.getCurrentUser());
  const [currentPage, setCurrentPage] = useState<Page>('dashboard');
  const [pageParams, setPageParams] = useState<any>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopSidebarPinned, setDesktopSidebarPinned] = useState(true);
  const [desktopSidebarHovered, setDesktopSidebarHovered] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const isDesktopSidebarVisible = desktopSidebarPinned || desktopSidebarHovered;
  const isFinanceOfficer = user?.Role === 'Finance Officer';

  const isPageAllowed = (page: Page) => {
    if (!isFinanceOfficer) return true;
    return page === 'grants' || page === 'reports';
  };

  const getDefaultPage = (): Page => {
    return isFinanceOfficer ? 'grants' : 'dashboard';
  };

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
      const unsubscribe = db.subscribe(updateNotifications);
      const interval = setInterval(updateNotifications, 60000);
      return () => {
        unsubscribe();
        clearInterval(interval);
      };
    }
  }, [isAuthenticated]);
  // ADD THIS useEffect for fetching pending requests count
  useEffect(() => {
    if (!isAuthenticated) return;
    
    const fetchPendingCount = async () => {
      try {
        const res = await fetch('/api/admin/pending-approvals');
        const data = await res.json();
        setPendingRequestCount(data.filter((r: any) => r.status === 'pending').length);
      } catch (err) {
        // Portal might not be running, silently fail
      }
    };

    fetchPendingCount();
    const interval = setInterval(fetchPendingCount, 30000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const handleLogin = () => {
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    logout();
    setIsAuthenticated(false);
    setCurrentPage(getDefaultPage());
  };

  const navigateTo = (page: Page | string, params?: any) => {
    if (!isPageAllowed(page as Page)) {
      setCurrentPage(getDefaultPage());
      setPageParams(null);
      setSidebarOpen(false);
      return;
    }

    setCurrentPage(page as Page);
    setPageParams(params);
    setSidebarOpen(false);
  };

  useEffect(() => {
    if (!isAuthenticated || !user) return;
    if (!isPageAllowed(currentPage)) {
      setCurrentPage(getDefaultPage());
      setPageParams(null);
    }
  }, [isAuthenticated, user, currentPage, isFinanceOfficer]);

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
      case 'child-new':
        return (
          <ChildForm
            pNo={pageParams?.pNo}
            onSave={(params) => {
              if (params?.pNo) {
                navigateTo('parent-detail', { pNo: params.pNo });
              } else {
                navigateTo('parents');
              }
            }}
            onCancel={() => {
              if (pageParams?.pNo) {
                navigateTo('parent-detail', { pNo: pageParams.pNo });
              } else {
                navigateTo('parents');
              }
            }}
          />
        );
      case 'child-detail':
        return (
          <ChildDetail
            childId={Number(pageParams?.childId)}
            onBack={() => {
              if (pageParams?.pNo) {
                navigateTo('parent-detail', { pNo: pageParams.pNo });
              } else {
                navigateTo('parents');
              }
            }}
          />
        );
      case 'grants':
        return <GrantGadgetManager onNavigate={navigateTo} />;
      case 'reports':
        return <ReportsExports onNavigate={navigateTo} />;
      case 'requests':  // <-- ADD THIS
        return <RequestsTab />;
      default:
        return isFinanceOfficer ? <GrantGadgetManager onNavigate={navigateTo} /> : <Dashboard onNavigate={navigateTo} />;
    }
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  const filteredNav = navigation.filter(item => isPageAllowed(item.id));

  return (
    <div className="futuristic-shell min-h-screen flex text-foreground">
      {/* Desktop hover trigger */}
      <div
        className="hidden lg:block fixed left-0 top-0 bottom-0 w-4 z-40"
        onMouseEnter={() => setDesktopSidebarHovered(true)}
      />

      {/* Desktop Sidebar */}
      <aside
        onMouseEnter={() => setDesktopSidebarHovered(true)}
        onMouseLeave={() => {
          if (!desktopSidebarPinned) setDesktopSidebarHovered(false);
        }}
        className={`hidden lg:flex flex-col w-64 bg-sidebar/95 text-sidebar-foreground border-r border-sidebar-border fixed h-full backdrop-blur-xl shadow-2xl shadow-blue-950/15 transition-transform duration-300 ease-out z-50 ${
          isDesktopSidebarVisible ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6 border-b border-sidebar-border/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-sky-400 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-900/40">
              <Shield className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-white leading-tight">SCMS</h1>
              <p className="text-xs text-blue-100/85">Welfare Division</p>
            </div>
          </div>
        </div>

                <nav className="flex-1 p-4 space-y-1 overflow-auto">
          {filteredNav.map((item) => {
            const Icon = item.icon;
            const isActive = currentPage === item.id || currentPage.startsWith(item.id + '-');
            const isRequests = item.id === 'requests';
            
            return (
              <button
                key={item.id}
                onClick={() => navigateTo(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all duration-200 relative
                  ${isActive 
                    ? 'bg-gradient-to-r from-sky-400/25 to-blue-500/20 text-white font-semibold shadow-sm shadow-blue-950/30' 
                    : 'text-blue-100/85 hover:bg-white/10 hover:text-white'
                  }`}
              >
                <Icon className="w-5 h-5" />
                <span className="flex-1">{item.label}</span>
                {isRequests && pendingRequestCount > 0 && (
                  <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                    {pendingRequestCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-sidebar-border/70">
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate text-white">{user?.Full_Name}</p>
              <p className="text-xs text-blue-100/80">{user?.Role}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Desktop Sidebar Toggle */}
      <Button
        onClick={() => {
          const next = !desktopSidebarPinned;
          setDesktopSidebarPinned(next);
          if (!next) {
            setDesktopSidebarHovered(false);
          } else {
            setDesktopSidebarHovered(true);
          }
        }}
        variant="default"
        size="icon"
        className="hidden lg:inline-flex fixed bottom-4 left-4 z-[60] rounded-full shadow-xl"
      >
        {isDesktopSidebarVisible ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </Button>

      {/* Mobile Sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-64 p-0 bg-sidebar text-sidebar-foreground border-sidebar-border">
          <div className="p-6 border-b border-sidebar-border/70">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-sky-400 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-900/40">
                <Shield className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-white leading-tight">SCMS</h1>
                <p className="text-xs text-blue-100/85">Welfare Division</p>
              </div>
            </div>
          </div>

                    <nav className="p-4 space-y-1">
            {filteredNav.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              const isRequests = item.id === 'requests';
              
              return (
                <button
                  key={item.id}
                  onClick={() => navigateTo(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all duration-200 relative
                    ${isActive 
                      ? 'bg-gradient-to-r from-sky-400/25 to-blue-500/20 text-white font-semibold shadow-sm shadow-blue-950/30' 
                      : 'text-blue-100/85 hover:bg-white/10 hover:text-white'
                    }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="flex-1">{item.label}</span>
                  {isRequests && pendingRequestCount > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full min-w-[20px] text-center">
                      {pendingRequestCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <main className={`flex-1 transition-[margin] duration-300 ${desktopSidebarPinned ? 'lg:ml-64' : 'lg:ml-0'}`}>
        {/* Header */}
        <header className="sticky top-0 z-30 bg-white/85 dark:bg-slate-950/85 backdrop-blur-xl border-b border-blue-200/70 dark:border-slate-700/70 px-3 sm:px-4 md:px-5 lg:px-6 xl:px-8 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Sheet>
                <SheetTrigger asChild className="lg:hidden">
                  <Button variant="ghost" size="icon">
                    <Menu className="w-5 h-5" />
                  </Button>
                </SheetTrigger>
              </Sheet>
              <h2 className="text-xl sm:text-2xl md:text-3xl font-semibold text-blue-950 dark:text-white">
                {filteredNav.find(n => n.id === currentPage || currentPage.startsWith(n.id + '-'))?.label || filteredNav[0]?.label || 'Dashboard'}
              </h2>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 md:gap-4">
              {/* Dark Mode Toggle */}
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={toggleTheme}
                title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                className="text-sm sm:text-base"
              >
                {theme === 'light' ? <Moon className="w-4 h-4 sm:w-5 sm:h-5" /> : <Sun className="w-4 h-4 sm:w-5 sm:h-5" />}
              </Button>

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
        <div className="section-reveal p-3 sm:p-4 md:p-5 lg:p-6 xl:p-8 w-full">
          <div className="w-full max-w-full lg:max-w-[90%] xl:max-w-[85%] 2xl:max-w-[80%] mx-auto">
            {renderPage()}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
