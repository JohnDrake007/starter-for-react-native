import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { getCollection } from "@/lib/sync-manager";
import { VISITS_COLLECTION_ID, CUSTOMERS_COLLECTION_ID } from "@/lib/appwrite";

// How many days before a visit to send notifications
const REMIND_DAYS_BEFORE = [3, 1, 0]; // 3 days before, 1 day before, same day

const NOTIFICATION_CHANNEL_ID = "visit-reminders";

/**
 * Sets the default notification handler so notifications appear even when
 * the app is in the foreground.
 */
export function configureNotificationHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

/**
 * Creates the Android notification channel (no-op on iOS).
 */
async function ensureAndroidChannel() {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNEL_ID, {
      name: "Visit Reminders",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#16a34a",
      sound: "default",
    });
  }
}

/**
 * Requests notification permissions from the user.
 * Returns true if granted, false otherwise.
 */
export async function requestNotificationPermissions(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

/**
 * Cancels ALL previously scheduled visit-reminder notifications,
 * then re-schedules fresh ones based on the current visits data.
 *
 * Call this after every sync cycle so notifications are always up to date.
 */
export async function scheduleVisitReminders() {
  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) return;

    await ensureAndroidChannel();

    // Cancel all previously scheduled reminders so we start clean
    await Notifications.cancelAllScheduledNotificationsAsync();

    const visits = getCollection(VISITS_COLLECTION_ID);
    const customers = getCollection(CUSTOMERS_COLLECTION_ID);

    // Build a quick customer lookup map
    const customerMap: Record<string, string> = {};
    customers.forEach((c: any) => {
      customerMap[c.$id] = c.name;
    });

    const now = Date.now();
    let scheduled = 0;

    for (const visit of visits) {
      if (!visit.nextVisitDate) continue;

      const visitDate = new Date(visit.nextVisitDate);
      visitDate.setHours(8, 0, 0, 0); // 8 AM on visit day
      const customerName = customerMap[visit.customerId] || "a customer";
      const taskDesc = visit.nextVisitTask || "Follow-up visit";

      for (const daysBefore of REMIND_DAYS_BEFORE) {
        const triggerDate = new Date(visitDate);
        triggerDate.setDate(triggerDate.getDate() - daysBefore);

        // Skip if trigger is in the past
        if (triggerDate.getTime() <= now) continue;

        const title =
          daysBefore === 0
            ? `📅 Visit Today — ${customerName}`
            : daysBefore === 1
            ? `⏰ Visit Tomorrow — ${customerName}`
            : `🔔 Visit in ${daysBefore} days — ${customerName}`;

        const body =
          daysBefore === 0
            ? `Today's task: ${taskDesc}`
            : `Scheduled on ${visitDate.toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
              })}: ${taskDesc}`;

        await Notifications.scheduleNotificationAsync({
          content: {
            title,
            body,
            sound: "default",
            data: { visitId: visit.$id, type: "visit-reminder" },
            ...(Platform.OS === "android" && {
              channelId: NOTIFICATION_CHANNEL_ID,
            }),
          },
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: triggerDate,
          },
        });

        scheduled++;
      }
    }

    console.log(`[Notifications] Scheduled ${scheduled} visit reminder(s).`);
  } catch (err) {
    console.error("[Notifications] Failed to schedule reminders:", err);
  }
}
