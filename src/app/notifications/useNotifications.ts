// useNotifications — query + mutations over the "notifications" collection.
// Read/unread state persists in the repository (IndexedDB) and every write
// invalidates the collection query so the bell badge updates immediately.
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { AppNotification } from "@/domain/types";
import { getRepository } from "@/repositories";
import { collectionQueryKey, useCollection } from "@/app/data/hooks";

export interface NotificationsApi {
  notifications: readonly AppNotification[];
  isLoading: boolean;
  unreadCount: number;
  setRead: (id: string, read: boolean) => void;
  markAllRead: () => void;
}

export function useNotifications(): NotificationsApi {
  const qc = useQueryClient();
  const query = useCollection<AppNotification>("notifications");
  const notifications = query.data ?? [];

  const invalidate = (): Promise<void> =>
    qc.invalidateQueries({ queryKey: collectionQueryKey("notifications") });

  const setReadMutation = useMutation({
    mutationFn: async ({ id, read }: { id: string; read: boolean }) => {
      await getRepository<AppNotification>("notifications").update(id, {
        read,
        updatedAt: new Date().toISOString(),
      });
    },
    onSettled: () => invalidate(),
  });

  const markAllMutation = useMutation({
    mutationFn: async () => {
      const repo = getRepository<AppNotification>("notifications");
      const all = await repo.list();
      const at = new Date().toISOString();
      for (const n of all) {
        if (!n.read) await repo.update(n.id, { read: true, updatedAt: at });
      }
    },
    onSettled: () => invalidate(),
  });

  return {
    notifications,
    isLoading: query.isLoading,
    unreadCount: notifications.filter((n) => !n.read).length,
    setRead: (id, read) => setReadMutation.mutate({ id, read }),
    markAllRead: () => markAllMutation.mutate(),
  };
}
