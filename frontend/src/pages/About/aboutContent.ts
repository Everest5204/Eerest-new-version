export type AboutPoint = {
  label: string;
  text: string;
};

export type AboutSectionBlock = {
  type: "section";
  id: string;
  title: string;
  paragraphs?: string[];
  points?: AboutPoint[];
};

export type AboutIllustrationType =
  | "connect-and-share"
  | "safe-community"
  | "future-growth";

export type AboutIllustrationBlock = {
  type: "illustration";
  id: string;
  illustration: AboutIllustrationType;
  title: string;
  description: string;
};

export type AboutBlock =
  | AboutSectionBlock
  | AboutIllustrationBlock;

export const aboutHeader = {
  title: "About Mongosky",
  paragraphs: [
    "Mongosky is a social media platform created to help people connect, communicate, share their ideas, and discover meaningful content.",
    "The platform brings posts, images, videos, reels, comments, reactions, connections, messaging, and intelligent assistance together in one clean and accessible experience.",
    "Mongosky continues to grow with a focus on simplicity, performance, privacy, safety, and respectful communication.",
  ],
};

export const aboutBlocks: AboutBlock[] = [
  {
    type: "section",
    id: "what-is-mongosky",
    title: "1. What Is Mongosky?",
    paragraphs: [
      "Mongosky is a modern social communication platform where users can create profiles, publish content, interact with posts, watch reels, follow other users, and communicate with their community.",
      "The platform is designed to make sharing and communication feel simple on mobile, tablet, and desktop devices.",
    ],
  },
  {
    type: "illustration",
    id: "connect-and-share-illustration",
    illustration: "connect-and-share",
    title: "Connect, communicate, and share",
    description:
      "Mongosky brings people and conversations together through posts, media, reactions, comments, connections, reels, and messaging.",
  },
  {
    type: "section",
    id: "platform-features",
    title: "2. What You Can Do on Mongosky",
    points: [
      {
        label: "Create and share posts",
        text: "Publish text, images, videos, captions, and other supported content with your community.",
      },
      {
        label: "Join conversations",
        text: "React to posts, write comments, reply to discussions, and participate in meaningful conversations.",
      },
      {
        label: "Watch reels",
        text: "Discover and watch short video content through the Mongosky Reels experience.",
      },
      {
        label: "Build connections",
        text: "Follow other users, view profiles, and stay connected with people and content that interest you.",
      },
      {
        label: "Use E-Text",
        text: "E-Text is Mongosky’s messaging feature for communication between Mongosky users.",
      },
      {
        label: "Use Mongosky AI",
        text: "Access intelligent assistance and platform information through the Mongosky AI experience.",
      },
    ],
  },
  {
    type: "section",
    id: "our-purpose",
    title: "3. Our Purpose",
    paragraphs: [
      "Mongosky aims to create an online space where people can express themselves, communicate freely, discover useful content, and build genuine connections.",
      "The platform is being developed to remain easy to understand while supporting the performance, reliability, and security expected from a modern social media service.",
    ],
  },
  {
    type: "illustration",
    id: "safe-community-illustration",
    illustration: "safe-community",
    title: "A respectful community belongs to everyone",
    description:
      "Mongosky encourages authentic expression, responsible sharing, personal privacy, respectful discussion, and the safety of every community member.",
  },
  {
    type: "section",
    id: "our-principles",
    title: "4. What Guides Us",
    points: [
      {
        label: "People first",
        text: "Features should be understandable, useful, accessible, and designed around real user needs.",
      },
      {
        label: "Respect and safety",
        text: "Every user should be able to participate without harassment, exploitation, deception, or avoidable harm.",
      },
      {
        label: "Privacy and control",
        text: "Users should understand how their information is handled and have practical ways to manage their account and content.",
      },
      {
        label: "Authentic communication",
        text: "Mongosky supports genuine identity, meaningful expression, and responsible interaction between users.",
      },
      {
        label: "Reliable performance",
        text: "The platform is developed with attention to speed, responsive design, stable navigation, and dependable data delivery.",
      },
      {
        label: "Continuous improvement",
        text: "Mongosky will continue to improve through careful development, testing, feedback, and responsible innovation.",
      },
    ],
  },
  {
    type: "section",
    id: "our-story",
    title: "5. Our Story",
    paragraphs: [
      "Mongosky was launched on 20 November 2025 with the goal of building a distinctive and dependable social media platform.",
      "Since its launch, Mongosky has continued to expand its social features, media experience, community tools, account services, and technical foundation.",
    ],
  },
  {
    type: "section",
    id: "technology",
    title: "6. How Mongosky Is Being Built",
    paragraphs: [
      "Mongosky uses React and TypeScript for its frontend experience, Go for its backend services, and MongoDB for its database.",
      "The platform architecture is being developed to support responsive interfaces, maintainable features, efficient data access, media delivery, account security, and future growth.",
    ],
  },
  {
    type: "section",
    id: "leadership",
    title: "7. Leadership",
    points: [
      {
        label: "Founder",
        text: "Mongosky was founded by Murad Ahmed Simanto.",
      },
      {
        label: "Co-founder",
        text: "A.H. Rohan, also known as Arafat Hasan Rohan, is the co-founder and works on the management of the Mongosky website.",
      },
    ],
  },
  {
    type: "illustration",
    id: "future-growth-illustration",
    illustration: "future-growth",
    title: "Building the next Mongosky experience",
    description:
      "Mongosky is continuing to improve its website while developing smooth and consistent mobile experiences for Android and iOS.",
  },
  {
    type: "section",
    id: "whats-next",
    title: "8. What Comes Next",
    paragraphs: [
      "Mongosky’s Android and iOS applications are currently under development. The team is working on performance, navigation, media delivery, account security, notifications, privacy, and a consistent mobile experience.",
      "New features and improvements will be introduced carefully after development and testing so that the platform remains stable, useful, and easy to maintain.",
    ],
  },
  {
    type: "section",
    id: "community-responsibility",
    title: "9. Growing Together",
    paragraphs: [
      "A strong social platform depends on both responsible technology and responsible users.",
      "Everyone who uses Mongosky is encouraged to respect other people, protect private information, share authentic content, follow the Community Guidelines, and report harmful activity through the available support tools.",
    ],
  },
  {
    type: "section",
    id: "contact-mongosky",
    title: "10. Contact Mongosky",
    paragraphs: [
      "For questions, feedback, safety concerns, or assistance with Mongosky, use the Help and Support option available within Settings.",
    ],
  },
];