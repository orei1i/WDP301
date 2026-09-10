export type AppNotification = {
  id: string;
  kind: "reply" | "like" | "follow" | "system";
  actor: string;
  text: string;
  at: string;
  read: boolean;
};

export const NOTIFICATIONS: AppNotification[] = [
  { id: "n1", kind: "reply", actor: "Linh Nguyen", text: "replied to “Week 1 done! Tips for eating out…”", at: "2026-09-10T08:20:00+07:00", read: false },
  { id: "n2", kind: "like", actor: "Marco Bianchi", text: "liked your recipe “Mango Chia Overnight Oats”", at: "2026-09-10T06:05:00+07:00", read: false },
  { id: "n3", kind: "follow", actor: "Aiko Tanaka", text: "started following you", at: "2026-09-09T19:40:00+07:00", read: true },
  { id: "n4", kind: "system", actor: "VeggieHub", text: "Your weekly meal plan is ready to review", at: "2026-09-08T09:00:00+07:00", read: true },
];
