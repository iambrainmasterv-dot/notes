import { LocalNotifications } from '@capacitor/local-notifications';
import { ANDROID_ALERTS_CHANNEL_ID, ANDROID_RAW_DEADLINE_SOUND } from './androidNotifSound';

/** Bump when action types change so devices re-register after app update. */
const SETUP_VERSION = 3;

/** Keep action ids/titles in sync with NotetasksPinNotificationsPlugin.java (notetasks-android). */
export const PIN_ACTION_TYPE_NOTE = 'NOTETASKS_PIN_NOTE';
export const PIN_ACTION_TYPE_TASK = 'NOTETASKS_PIN_TASK';

let setupAppliedVersion = 0;

export function pinActionTypeId(itemType: 'note' | 'task'): string {
  return itemType === 'note' ? PIN_ACTION_TYPE_NOTE : PIN_ACTION_TYPE_TASK;
}

export async function ensureAndroidChannelsAndActions(): Promise<void> {
  if (setupAppliedVersion >= SETUP_VERSION) return;

  await LocalNotifications.createChannel({
    id: ANDROID_ALERTS_CHANNEL_ID,
    name: 'Deadlines & check-ins',
    description: 'Deadline reminders, periodic summaries, and Completed tab nudges',
    importance: 4,
    sound: ANDROID_RAW_DEADLINE_SOUND,
  });
  await LocalNotifications.createChannel({
    id: 'notetasks_digest',
    name: 'Daily digest',
    description: 'Summary of your day in NoteTasks',
    importance: 3,
    sound: ANDROID_RAW_DEADLINE_SOUND,
  });
  await LocalNotifications.createChannel({
    id: 'notetasks_pins',
    name: 'Pinned items',
    description: 'Pinned notes and tasks',
    importance: 3,
  });
  await LocalNotifications.registerActionTypes({
    types: [
      {
        id: PIN_ACTION_TYPE_NOTE,
        actions: [{ id: 'complete', title: 'Complete' }],
      },
      {
        id: PIN_ACTION_TYPE_TASK,
        actions: [
          { id: 'complete', title: 'Complete' },
          { id: 'progress', title: '+1 progress' },
          { id: 'regress', title: '-1 progress' },
        ],
      },
    ],
  });
  setupAppliedVersion = SETUP_VERSION;
}
