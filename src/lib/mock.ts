export type Room = {
  slug: string;
  name: string;
  group: string;
};

export type Author = {
  pubkey: string;
  name: string;
  picture: string;
};

export type Reaction = {
  emoji: string;
  count: number;
};

export type Post = {
  id: string;
  author: Author;
  content: string;
  createdAt: string;
  reactions: Reaction[];
  zaps: number;
  replies?: Post[];
};

export type Thread = {
  id: string;
  title: string;
  tags: { label: string; color: string }[];
  op: Post;
  replyCount: number;
  viewCount: number;
  lastActivity: string;
  participants: Author[];
};

export const community = {
  name: "My big community",
  about:
    "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
};

export const rooms: Room[] = [
  { slug: "off-topics-cafe", name: "Off topics cafe", group: "Groups" },
  { slug: "proposals", name: "Proposals", group: "Groups" },
  { slug: "development", name: "Development", group: "Groups" },
  { slug: "announcements", name: "Announcements", group: "Groups" },
  { slug: "off-topics", name: "Off topics", group: "Groups" },
  { slug: "about", name: "About", group: "Resources" },
  { slug: "help-center", name: "Help center", group: "Resources" },
];

const alice: Author = {
  pubkey: "npub1alice",
  name: "Alice",
  picture: "https://api.dicebear.com/9.x/thumbs/svg?seed=alice",
};
const bob: Author = {
  pubkey: "npub1bob",
  name: "Bob",
  picture: "https://api.dicebear.com/9.x/thumbs/svg?seed=bob",
};
const carol: Author = {
  pubkey: "npub1carol",
  name: "Carol",
  picture: "https://api.dicebear.com/9.x/thumbs/svg?seed=carol",
};
const dave: Author = {
  pubkey: "npub1dave",
  name: "Dave",
  picture: "https://api.dicebear.com/9.x/thumbs/svg?seed=dave",
};

export const threads: Thread[] = [
  {
    id: "1",
    title: "Discussion about an interesting topic",
    tags: [
      { label: "general", color: "green" },
      { label: "nostr", color: "blue" },
    ],
    op: {
      id: "op1",
      author: alice,
      content:
        "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.\n\nProin vitae ex iaculis, luctus elit in, fermentum turpis. Pellentesque sagittis congue quam erat, egestas a lobortis non, molestie ut enim. Sed tempus augue sapien laoreet, sed iaculis velit dictum diam.\n\nMaecenas sollicitudin erat eu metus lacinia congue. Nunc sagittis laoreet odio.",
      createdAt: "2025-01-15T10:00:00Z",
      reactions: [
        { emoji: "👍", count: 14 },
        { emoji: "🎉", count: 3 },
      ],
      zaps: 1200,
      replies: [
        {
          id: "r1",
          author: bob,
          content:
            "Etiam efficitur ornare odio, id elementum felis interdum sit amet. Nam tincidunt justo quam, eu rhoncus lectus pellentesque id.",
          createdAt: "2025-01-15T11:00:00Z",
          reactions: [{ emoji: "👍", count: 5 }],
          zaps: 210,
        },
        {
          id: "r2",
          author: carol,
          content:
            "Maecenas sollicitudin erat eu metus lacinia congue. Nunc sagittis laoreet odio, non molestie eros.",
          createdAt: "2025-01-15T12:30:00Z",
          reactions: [
            { emoji: "❤️", count: 2 },
            { emoji: "😂", count: 1 },
          ],
          zaps: 0,
        },
      ],
    },
    replyCount: 12,
    viewCount: 4200,
    lastActivity: "4h",
    participants: [alice, bob, carol, dave],
  },
  {
    id: "2",
    title:
      "Etiam pellentesque pulvinar quam sed interdum maximus pellentesque. Nam erat, egestas a lobortis non, molestie ut enim",
    tags: [{ label: "question", color: "yellow" }],
    op: {
      id: "op2",
      author: bob,
      content:
        "Etiam pellentesque pulvinar quam sed interdum. Vivamus fermentum accumsan lorem.",
      createdAt: "2025-01-14T09:00:00Z",
      reactions: [{ emoji: "👍", count: 2 }],
      zaps: 0,
    },
    replyCount: 0,
    viewCount: 310,
    lastActivity: "1d",
    participants: [bob],
  },
  {
    id: "3",
    title: "Pellentesque sagittis cinque quam et blandum",
    tags: [
      { label: "meta", color: "pink" },
      { label: "proposal", color: "blue" },
    ],
    op: {
      id: "op3",
      author: carol,
      content:
        "Phasellus nec velit quis luctus maximus pellentesque. Nam erat, egestas a lobortis non, molestie ut enim.",
      createdAt: "2025-01-13T14:00:00Z",
      reactions: [
        { emoji: "🎉", count: 7 },
        { emoji: "👍", count: 4 },
      ],
      zaps: 850,
    },
    replyCount: 7,
    viewCount: 890,
    lastActivity: "2d",
    participants: [carol, alice, dave],
  },
  {
    id: "4",
    title:
      "Nam rutrum dolor in nulla maximus pellentesque. Nam erat, egestas a lobortis non, molestie ut enim imperdiet consequat",
    tags: [{ label: "general", color: "green" }],
    op: {
      id: "op4",
      author: dave,
      content:
        "Nam rutrum dolor in nulla imperdiet consequat. Sed tincidunt augue a velit.",
      createdAt: "2025-01-12T08:00:00Z",
      reactions: [],
      zaps: 0,
    },
    replyCount: 3,
    viewCount: 140,
    lastActivity: "3d",
    participants: [dave, bob],
  },
  {
    id: "5",
    title:
      "Etiam maximus pellentesque. Nam erat, egestas a lobortis non, molestie ut enim efficitur ornare odio, id elementum felis",
    tags: [
      { label: "nostr", color: "blue" },
      { label: "dev", color: "green" },
    ],
    op: {
      id: "op5",
      author: alice,
      content:
        "Etiam efficitur ornare odio, id elementum felis interdum sit amet. Nam tincidunt justo quam.",
      createdAt: "2025-01-11T16:00:00Z",
      reactions: [{ emoji: "👍", count: 11 }],
      zaps: 340,
    },
    replyCount: 31,
    viewCount: 4100,
    lastActivity: "1h",
    participants: [alice, carol, bob, dave],
  },
  {
    id: "6",
    title: "Maecenas sollicitudin erat eu metus lacinia congue",
    tags: [{ label: "announcement", color: "pink" }],
    op: {
      id: "op6",
      author: carol,
      content:
        "Maecenas sollicitudin erat eu metus lacinia congue. Nunc sagittis laoreet odio.",
      createdAt: "2025-01-10T12:00:00Z",
      reactions: [{ emoji: "🎉", count: 9 }],
      zaps: 500,
    },
    replyCount: 5,
    viewCount: 620,
    lastActivity: "4d",
    participants: [carol, dave],
  },
  {
    id: "7",
    title: "Praesent blandit bibendum lectus, nec tristique nisl",
    tags: [{ label: "general", color: "green" }],
    op: {
      id: "op7",
      author: bob,
      content:
        "Praesent blandit bibendum lectus, nec tristique nisl nam rutrum.",
      createdAt: "2025-01-09T10:00:00Z",
      reactions: [],
      zaps: 0,
    },
    replyCount: 0,
    viewCount: 95,
    lastActivity: "5d",
    participants: [bob],
  },
];

export type ChatMessage = {
  id: string;
  author: Author;
  content: string;
  createdAt: string;
};

export const chatMessages: ChatMessage[] = [
  {
    id: "c1",
    author: alice,
    content:
      "Quisque sagittis quam dui, nec pulvinar velit aliquam in. Sed volutpat in.",
    createdAt: "2025-01-15T13:00:00Z",
  },
  {
    id: "c2",
    author: bob,
    content:
      "Vivamus fermentum accumsan lorem, laoreet molestie lectus facilisis in.",
    createdAt: "2025-01-15T13:02:00Z",
  },
  {
    id: "c3",
    author: carol,
    content:
      "Proin vitae ex iaculis, luctus elit in, fermentum turpis. Pellentesque sagittis congue quam.",
    createdAt: "2025-01-15T13:05:00Z",
  },
  {
    id: "c4",
    author: dave,
    content:
      "Mauro dui dolor, sagittis id sem nec, rhoncus consequat duis. Suspendisse dapibus mauris maximus mauris imperdiet.",
    createdAt: "2025-01-15T13:08:00Z",
  },
  {
    id: "c5",
    author: alice,
    content:
      "In hac habitasse platea dictumst. Nulla a quam tempor, posuere neque non, fringilla velit.",
    createdAt: "2025-01-15T13:10:00Z",
  },
];
