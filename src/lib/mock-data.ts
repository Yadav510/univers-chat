/**
 * Univers. — mock data for prototype phase.
 * Avatar colors rotate from the design system swatch list.
 */

export const AVATAR_COLORS = [
  "#6B4EFF",
  "#FF4C8B",
  "#30D158",
  "#FF9F0A",
  "#64D2FF",
  "#FF6B6B",
  "#A58FFF",
  "#00C9A7",
] as const;

export type Contact = {
  id: string;
  name: string;
  initials: string;
  color: string;
  online: boolean;
  lastSeen?: string;
};

export type ChatPreview = {
  id: string;
  contact: Contact;
  lastMessage: string;
  lastMessageKind?: "text" | "voice" | "file" | "image" | "missed-call";
  time: string;
  unread: number;
  isTyping?: boolean;
  isGroup?: boolean;
};

const c = (i: number) => AVATAR_COLORS[i % AVATAR_COLORS.length];

export const PINNED: Contact[] = [
  { id: "p1", name: "Your Story", initials: "+", color: c(0), online: false },
  { id: "p2", name: "P. Judge", initials: "PJ", color: c(1), online: true },
  { id: "p3", name: "A. Hendrix", initials: "AH", color: c(2), online: true },
  { id: "p4", name: "J. Tonky", initials: "JT", color: c(3), online: false },
  { id: "p5", name: "P. Alex", initials: "PA", color: c(4), online: true },
];

export const CHATS: ChatPreview[] = [
  {
    id: "1",
    contact: { id: "u1", name: "William Conrad", initials: "WC", color: c(0), online: true },
    lastMessage: "Typing…",
    time: "now",
    unread: 1,
    isTyping: true,
  },
  {
    id: "2",
    contact: { id: "u2", name: "James Tonky", initials: "JT", color: c(3), online: false },
    lastMessage: "Missed call",
    lastMessageKind: "missed-call",
    time: "4:30 AM",
    unread: 0,
  },
  {
    id: "3",
    contact: { id: "u3", name: "Brittany Conrad", initials: "BC", color: c(1), online: true },
    lastMessage: "I believe that this is the best…",
    time: "11:30 AM",
    unread: 0,
  },
  {
    id: "4",
    contact: { id: "u4", name: "+380 6879 38 396 4", initials: "+3", color: c(5), online: false },
    lastMessage: "Hey! How was your day?",
    time: "8:30 AM",
    unread: 0,
  },
  {
    id: "5",
    contact: { id: "u5", name: "Amsterdam · Trip", initials: "AT", color: c(2), online: false },
    lastMessage: "🥐 ☕ 🚲",
    time: "6:24 PM",
    unread: 3,
    isGroup: true,
  },
  {
    id: "6",
    contact: { id: "u6", name: "BookTok", initials: "BT", color: c(6), online: false },
    lastMessage: "If you could travel anywhere in t…",
    time: "3:08 PM",
    unread: 0,
    isGroup: true,
  },
  {
    id: "7",
    contact: { id: "u7", name: "Lena Park", initials: "LP", color: c(4), online: true },
    lastMessage: "voice note",
    lastMessageKind: "voice",
    time: "Yesterday",
    unread: 0,
  },
  {
    id: "8",
    contact: { id: "u8", name: "Design Crew", initials: "DC", color: c(7), online: false },
    lastMessage: "brand_v3.fig",
    lastMessageKind: "file",
    time: "Yesterday",
    unread: 0,
    isGroup: true,
  },
];
