/*
 *  author: Yagnik Poshiya
 *  github: https://github.com/yagnikposhiya/Neurons
 */

export type NotificationListItem = {
  id: string;
  title: string;
  body: string | null;
  actionUrl: string | null;
  createdAt: string;
  isRead: boolean;
};
