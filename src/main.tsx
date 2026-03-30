import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import './index.css';
import { AuthProvider } from './auth/AuthProvider';
import App from './App';
import type { ActionPerformed } from '@capacitor/local-notifications';
import { handleLocalNotificationAction } from './notifications/notificationActionHandler';

if (Capacitor.isNativePlatform()) {
  void LocalNotifications.addListener('localNotificationActionPerformed', (action) => {
    void handleLocalNotificationAction(action);
  });

  /** Pin actions from {@link PinNotificationActionReceiver} (Android); does not launch the activity. */
  window.addEventListener(
    'notetasksPinAction',
    ((e: Event) => {
      const detail = (e as CustomEvent<ActionPerformed>).detail;
      if (detail) void handleLocalNotificationAction(detail);
    }) as EventListener,
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>,
);
