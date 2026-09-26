export interface ChatSummary {
  id: string;
  kind: "group" | "direct";
  name: string;
  role: string;
  unread: number;
  memberCount: number;
  otherUserId: string | null;
  otherStatus: string | null;
  live: boolean;
  last: { text: string | null; senderName: string; mine: boolean; at: string } | null;
  lastActivity: string;
}

export interface MyInvitation {
  id: string;
  circleId: string;
  circleName: string;
  inviterName: string;
  members: string[];
  expiresAt: string;
}
