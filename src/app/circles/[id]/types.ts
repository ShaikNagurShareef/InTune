export interface Member {
  id: string;
  displayName: string;
  role: string;
}

export interface CircleInfo {
  id: string;
  name: string;
  role: string;
  members: Member[];
}

export interface FeedMessage {
  id: string;
  senderId: string;
  senderName: string;
  replyToId: string | null;
  text: string | null;
  version: number;
  aiAssisted: boolean;
  approvedBySender: boolean;
  createdAt: string;
  edited: boolean;
  deleted: boolean;
  mine: boolean;
}

export interface FeedPage {
  messages: FeedMessage[];
  nextCursor: string | null;
}

export interface PhraseLite {
  id: string;
  phrase: string;
  meaning: string;
}

export interface ReplyTarget {
  id: string;
  senderName: string;
  snippet: string;
}

export interface Me {
  id: string;
  displayName: string;
}
