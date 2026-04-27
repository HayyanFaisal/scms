import { db } from '@/services/database';
import type { Notification } from '@/types';

export function checkExpiringGrants(): Notification[] {
  const expiringGrants = db.getExpiringGrants(30);
  const notifications: Notification[] = [];
  
  expiringGrants.forEach(grant => {
    const child = db.getChildById(grant.Child_ID);
    const daysRemaining = Math.ceil(
      (new Date(grant.Approved_To).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
    );
    
    notifications.push({
      id: Date.now() + grant.Grant_ID,
      type: 'warning',
      title: 'Grant Expiring Soon',
      message: `Grant for ${child?.Child_Name || 'Unknown Child'} expires in ${daysRemaining} days`,
      created_at: new Date().toISOString(),
      read: false
    });
  });
  
  return notifications;
}

export function checkPendingGadgets(): Notification[] {
  const pendingGadgets = db.getPendingGadgets();
  const notifications: Notification[] = [];
  
  if (pendingGadgets.length > 0) {
    notifications.push({
      id: Date.now(),
      type: 'info',
      title: 'Pending Gadget Requests',
      message: `${pendingGadgets.length} gadget reimbursement requests are pending`,
      created_at: new Date().toISOString(),
      read: false
    });
  }
  
  return notifications;
}

export function getAllNotifications(): Notification[] {
  const stored = db.getNotifications();
  const autoNotifications = [
    ...checkExpiringGrants(),
    ...checkPendingGadgets()
  ];
  
  // Merge and remove duplicates
  const allNotifications = [...autoNotifications, ...stored];
  const unique = allNotifications.filter((notif, index, self) => 
    index === self.findIndex(n => n.title === notif.title && n.message === notif.message)
  );
  
  return unique.sort((a, b) => 
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function getUnreadCount(): number {
  return getAllNotifications().filter(n => !n.read).length;
}
