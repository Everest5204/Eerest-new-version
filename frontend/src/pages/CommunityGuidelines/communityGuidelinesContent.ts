export type CommunityGuidelineIllustrationKey =
  | "respect-and-safety"
  | "authenticity-and-trust"
  | "privacy-and-reporting";

export type CommunityGuidelineRule = {
  title: string;
  description: string;
};

export type CommunityGuidelineSection = {
  type: "section";
  id: string;
  eyebrow?: string;
  title: string;
  description: string;
  paragraphs?: string[];
  rules?: CommunityGuidelineRule[];
  note?: string;
};

export type CommunityGuidelineIllustration = {
  type: "illustration";
  id: string;
  illustration: CommunityGuidelineIllustrationKey;
  badge: string;
  title: string;
  description: string;
};

export type CommunityGuidelineBlock =
  | CommunityGuidelineSection
  | CommunityGuidelineIllustration;

export const communityGuidelinesHero = {
  badge: "A safer community starts with all of us",
  title: "Community Guidelines",
  description:
    "These guidelines explain the standards everyone must follow when using our platform. They are designed to protect freedom of expression while keeping the community safe, respectful, authentic, and welcoming.",
  highlights: [
    "Respect every person",
    "Protect community safety",
    "Share authentic content",
    "Respect privacy and ownership",
  ],
};

export const communityGuidelineBlocks: CommunityGuidelineBlock[] = [
  {
    type: "section",
    id: "our-shared-responsibility",
    eyebrow: "Our shared responsibility",
    title: "A community built on trust",
    description:
      "Our platform brings people together to share ideas, experiences, creativity, and meaningful conversations.",
    paragraphs: [
      "These guidelines apply to everyone and to all parts of the platform, including profiles, posts, comments, messages, images, videos, reels, links, usernames, and other shared content.",
      "We understand that context matters. When reviewing content, we may consider its purpose, language, cultural context, potential harm, public interest, and whether it was shared for awareness, education, documentation, or criticism.",
      "Using this platform means agreeing to follow these standards. Content or behaviour that violates them may be removed or restricted, and accounts may face further action depending on the seriousness or frequency of the violation.",
    ],
  },

  {
    type: "illustration",
    id: "respect-and-safety-card",
    illustration: "respect-and-safety",
    badge: "Respect & Safety",
    title: "Every person deserves to feel safe",
    description:
      "Communicate with empathy, respect personal boundaries, and never use the platform to intimidate, exploit, or harm another person.",
  },

  {
    type: "section",
    id: "respect-every-person",
    eyebrow: "Respect",
    title: "Treat everyone with dignity",
    description:
      "Different opinions are welcome, but attacks against people are not. Disagreement should focus on ideas and actions rather than humiliation or personal abuse.",
    rules: [
      {
        title: "Harassment and bullying",
        description:
          "Do not repeatedly insult, shame, threaten, mock, intimidate, or target another person. Encouraging others to participate in harassment is also prohibited.",
      },
      {
        title: "Hate and discrimination",
        description:
          "Do not attack, degrade, exclude, or promote hatred against people based on race, ethnicity, nationality, religion, disability, age, sex, gender identity, sexual orientation, caste, or another protected characteristic.",
      },
      {
        title: "Dehumanising language",
        description:
          "Do not describe individuals or groups as less than human, inherently dangerous, diseased, or deserving of violence or exclusion.",
      },
      {
        title: "Unwanted sexual behaviour",
        description:
          "Sexual harassment, unwanted sexual comments, coercion, exploitation, and repeated sexual advances are not allowed.",
      },
    ],
  },

  {
    type: "section",
    id: "prevent-abuse",
    eyebrow: "Healthy conversations",
    title: "Do not organise or encourage abuse",
    description:
      "The platform must not be used to direct harassment or coordinated attacks toward another person or community.",
    rules: [
      {
        title: "Targeted attacks",
        description:
          "Do not publish content with the purpose of sending abusive attention, threats, or humiliation toward a person.",
      },
      {
        title: "Malicious exposure",
        description:
          "Do not share private or sensitive material to punish, shame, blackmail, or control someone.",
      },
      {
        title: "False harmful accusations",
        description:
          "Do not knowingly publish fabricated allegations that could seriously damage another person's safety or reputation.",
      },
    ],
  },

  {
    type: "section",
    id: "protect-safety",
    eyebrow: "Safety",
    title: "Protect life, safety, and wellbeing",
    description:
      "Content that creates a credible risk of physical harm may be removed immediately and, when necessary, referred to an appropriate authority.",
    rules: [
      {
        title: "Violence and threats",
        description:
          "Do not make credible threats, celebrate serious violence, request violent acts, or encourage others to physically harm a person or group.",
      },
      {
        title: "Dangerous organisations",
        description:
          "Support, recruitment, praise, or operational assistance for terrorist, extremist, organised criminal, or violent groups is prohibited.",
      },
      {
        title: "Dangerous activities",
        description:
          "Do not encourage challenges, instructions, or behaviour that could foreseeably cause serious injury, poisoning, or death.",
      },
      {
        title: "Self-harm and suicide",
        description:
          "Do not encourage, glorify, or provide instructions for suicide or self-harm. Supportive discussion, recovery stories, and help-seeking information are allowed.",
      },
    ],
    note:
      "If you believe someone is in immediate danger, contact local emergency services instead of relying only on an in-platform report.",
  },

  {
    type: "section",
    id: "protect-young-people",
    eyebrow: "Youth protection",
    title: "Children and young people require greater protection",
    description:
      "We apply strict standards to content or behaviour that could exploit, endanger, sexualise, manipulate, or inappropriately contact a minor.",
    rules: [
      {
        title: "Child exploitation",
        description:
          "Any content, request, conversation, or behaviour involving the sexual exploitation or abuse of a minor is strictly prohibited.",
      },
      {
        title: "Grooming and coercion",
        description:
          "Adults must not build relationships with minors for sexual, exploitative, manipulative, or otherwise harmful purposes.",
      },
      {
        title: "Unsafe exposure",
        description:
          "Do not reveal a minor's private location, school, contact details, routine, or other information that could place them at risk.",
      },
    ],
  },

  {
    type: "illustration",
    id: "authenticity-and-trust-card",
    illustration: "authenticity-and-trust",
    badge: "Authenticity & Trust",
    title: "Be real, honest, and transparent",
    description:
      "Authentic participation helps people understand who and what they can trust. Never mislead others for influence, money, or artificial engagement.",
  },

  {
    type: "section",
    id: "be-authentic",
    eyebrow: "Authenticity",
    title: "Represent yourself honestly",
    description:
      "You may use a preferred name, creative identity, parody, or fan account, but you must not intentionally deceive others about who you are.",
    rules: [
      {
        title: "Impersonation",
        description:
          "Do not pretend to be another person, organisation, public figure, or authorised representative in a way that is likely to mislead people.",
      },
      {
        title: "Deceptive accounts",
        description:
          "Do not create accounts to hide coordinated abuse, avoid enforcement, manipulate conversations, or conduct fraudulent activity.",
      },
      {
        title: "Artificial engagement",
        description:
          "Do not buy, sell, automate, or exchange followers, reactions, comments, views, or other engagement in a misleading way.",
      },
      {
        title: "Undisclosed interests",
        description:
          "Clearly disclose paid promotions, sponsorships, affiliate relationships, and other material connections where appropriate.",
      },
    ],
  },

  {
    type: "section",
    id: "share-responsibly",
    eyebrow: "Information integrity",
    title: "Share information responsibly",
    description:
      "People should be able to make decisions without being deliberately manipulated by false, fabricated, or materially altered information.",
    rules: [
      {
        title: "Harmful misinformation",
        description:
          "Do not knowingly spread false information that is likely to cause serious physical, financial, civic, or public harm.",
      },
      {
        title: "Manipulated media",
        description:
          "Do not use edited, synthetic, or AI-generated media to deceive people about important events or make someone appear to say or do something they did not.",
      },
      {
        title: "Missing context",
        description:
          "Do not present old, unrelated, or selectively edited material as evidence of a current event when doing so could seriously mislead people.",
      },
      {
        title: "Constructive correction",
        description:
          "When possible, correct significant errors clearly. Satire, parody, opinion, and good-faith mistakes may be treated differently when their context is apparent.",
      },
    ],
  },

  {
    type: "section",
    id: "spam-scams",
    eyebrow: "Platform integrity",
    title: "Keep the community free from spam and scams",
    description:
      "Do not use the platform to manipulate users, distribute harmful material, or obtain money, accounts, or personal information through deception.",
    rules: [
      {
        title: "Fraud and scams",
        description:
          "Fake investments, fraudulent sales, advance-fee schemes, impersonation scams, and deceptive fundraising are prohibited.",
      },
      {
        title: "Phishing and malicious links",
        description:
          "Do not request passwords or verification codes, distribute malware, or direct users to deceptive websites designed to steal information.",
      },
      {
        title: "Repetitive spam",
        description:
          "Do not repeatedly publish unwanted promotions, duplicate comments, irrelevant links, or mass messages that disrupt normal use.",
      },
      {
        title: "Fake promotions",
        description:
          "Giveaways, job offers, discounts, and competitions must not use false claims, hidden charges, or misleading participation requirements.",
      },
    ],
  },

  {
    type: "section",
    id: "ownership",
    eyebrow: "Creative rights",
    title: "Respect intellectual property",
    description:
      "Share only content you created or have permission and a lawful basis to use.",
    rules: [
      {
        title: "Copyright",
        description:
          "Do not upload or redistribute protected images, music, videos, writing, software, or other work without permission or a valid legal exception.",
      },
      {
        title: "Trademarks",
        description:
          "Do not misuse names, logos, or brand identities in a way that causes confusion about source, ownership, or endorsement.",
      },
      {
        title: "Creator attribution",
        description:
          "Credit does not automatically replace permission. Follow the creator's licence and usage conditions whenever you reuse content.",
      },
    ],
  },

  {
    type: "illustration",
    id: "privacy-and-reporting-card",
    illustration: "privacy-and-reporting",
    badge: "Privacy & Reporting",
    title: "Protect privacy and speak up safely",
    description:
      "Control what you share, respect the privacy of others, and report content or behaviour that may place someone at risk.",
  },

  {
    type: "section",
    id: "protect-privacy",
    eyebrow: "Privacy",
    title: "Protect personal and confidential information",
    description:
      "Everyone has a responsibility to consider how shared information could affect another person's privacy, security, and safety.",
    rules: [
      {
        title: "Private information",
        description:
          "Do not expose home addresses, private phone numbers, financial information, identity documents, passwords, medical records, or precise live locations without permission.",
      },
      {
        title: "Doxxing",
        description:
          "Do not collect or publish identifying information to intimidate, harass, blackmail, or place someone at risk.",
      },
      {
        title: "Intimate privacy",
        description:
          "Never share, threaten to share, or request intimate images or recordings without the clear consent of every person involved.",
      },
      {
        title: "Images of others",
        description:
          "Consider consent, context, and safety before sharing identifiable images or recordings of another person, especially a child or vulnerable individual.",
      },
    ],
  },

  {
    type: "section",
    id: "reporting",
    eyebrow: "Reporting",
    title: "Report concerns responsibly",
    description:
      "Reporting helps us identify content and behaviour that may violate these guidelines. Reports should be made honestly and with enough context for a fair review.",
    rules: [
      {
        title: "Report the specific content",
        description:
          "Report the relevant post, comment, message, profile, or media item whenever possible so the review team can understand the concern.",
      },
      {
        title: "Do not misuse reporting",
        description:
          "Do not submit false, coordinated, or retaliatory reports simply because you disagree with someone.",
      },
      {
        title: "Protect yourself",
        description:
          "You may also block, mute, unfollow, restrict, or leave a conversation when those controls are available.",
      },
      {
        title: "Preserve urgent evidence",
        description:
          "For serious threats, fraud, or safety concerns, preserve relevant information and contact an appropriate authority when necessary.",
      },
    ],
  },

  {
    type: "section",
    id: "enforcement",
    eyebrow: "Enforcement",
    title: "How we respond to violations",
    description:
      "Our response depends on the nature, context, severity, and history of the violation, as well as the level of risk it creates.",
    rules: [
      {
        title: "Content action",
        description:
          "We may remove content, reduce its visibility, add a warning, restrict recommendations, or limit certain interactions.",
      },
      {
        title: "Account action",
        description:
          "We may issue a warning, temporarily restrict features, suspend an account, or permanently disable access.",
      },
      {
        title: "Immediate action",
        description:
          "Severe violations involving credible threats, child exploitation, serious fraud, or coordinated harm may result in immediate removal or account suspension.",
      },
      {
        title: "Repeated violations",
        description:
          "Repeated attempts to violate the rules, avoid restrictions, or create replacement accounts may lead to stronger enforcement.",
      },
    ],
  },

  {
    type: "section",
    id: "appeals",
    eyebrow: "Fair review",
    title: "Appeals and mistakes",
    description:
      "Moderation decisions may sometimes be incomplete or incorrect. When an appeal option is available, users can request another review.",
    paragraphs: [
      "An appeal should explain why the content or account activity follows these guidelines or why important context may have been missed.",
      "A successful appeal may restore content, reverse an account restriction, or update the original decision. Repeated or abusive appeals may be limited.",
    ],
  },

  {
    type: "section",
    id: "updates",
    eyebrow: "Keeping the guidelines current",
    title: "These standards may evolve",
    description:
      "Online risks, technology, and community expectations change over time. We may update these guidelines to address new forms of harm and improve clarity.",
    paragraphs: [
      "Important changes should be communicated clearly. Continued use of the platform after an update means the latest version of these guidelines applies.",
      "These guidelines do not replace applicable laws, our Terms of Service, Privacy Policy, or additional rules that may apply to specific features.",
    ],
  },
];

export const communityGuidelinesClosing = {
  title: "Help us build a better community",
  description:
    "Pause before you post, consider how your actions may affect others, and use reporting tools when something does not feel safe. Respectful participation from every member makes the entire community stronger.",
  primaryActionLabel: "Return to previous page",
};