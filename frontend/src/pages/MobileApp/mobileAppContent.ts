export type MobileAppIllustrationKey =
  | "development"
  | "android"
  | "ios";

export type MobileAppPlatformSection = {
  id: string;
  platform: "android" | "ios";
  illustration: MobileAppIllustrationKey;
  eyebrow: string;
  title: string;
  description: string;
  paragraphs: string[];
  statusLabel: string;
};

export const mobileAppHero = {
  eyebrow: "Mobile experience in progress",
  title: "Mongosky is coming to your phone",
  description:
    "Our mobile app is currently under development. Our developers are working carefully to create a fast, secure, and seamless experience for both Android and iOS users.",
  supportingText:
    "We are completing the important development and testing work now, and we hope to bring the app to you within the coming days.",
  statusLabel: "Development in progress",
  illustration: "development" as MobileAppIllustrationKey,
};

export const mobileAppIntroduction = {
  eyebrow: "Built with care",
  title: "A better mobile experience is on the way",
  description:
    "The mobile app is being designed to make connecting, sharing, discovering content, and communicating with your community feel natural from anywhere.",
  paragraphs: [
    "Our development team is currently working on performance, real-time updates, account security, reliable notifications, and a clean mobile experience.",
    "Before release, the app will go through careful testing across different devices and screen sizes. This helps us deliver a stable experience instead of releasing an unfinished product.",
    "Android and iOS development is progressing together so that users on both platforms can enjoy a consistent and professional experience.",
  ],
};

export const mobileAppPlatformSections: MobileAppPlatformSection[] = [
  {
    id: "android-app",
    platform: "android",
    illustration: "android",
    eyebrow: "Android application",
    title: "The Android app is coming soon",
    description:
      "Our Android version is being developed for a smooth, responsive, and dependable experience across modern Android phones.",
    paragraphs: [
      "The development team is optimising the app for different screen sizes, device capabilities, and network conditions.",
      "Important areas such as real-time content, media performance, navigation, notifications, privacy, and account security are currently being tested.",
      "Once the Android version meets our quality and stability standards, official installation information will be announced here.",
    ],
    statusLabel: "Android version in development",
  },
  {
    id: "ios-app",
    platform: "ios",
    illustration: "ios",
    eyebrow: "iOS application",
    title: "The iOS app is also on the way",
    description:
      "The iOS version is being created to provide iPhone users with the same fast, secure, and polished Mongosky experience.",
    paragraphs: [
      "Our developers are refining the interface, gestures, navigation, media experience, notifications, and overall performance for iOS devices.",
      "The app will be reviewed and tested carefully before release to ensure that it feels stable, intuitive, and consistent with the platform.",
      "Official App Store availability will be shared only after the iOS version is fully prepared for release.",
    ],
    statusLabel: "iOS version in development",
  },
];

export const mobileAppClosing = {
  eyebrow: "Launching soon",
  title: "Thank you for waiting with us",
  description:
    "Our developers are actively working on both versions of the app. We appreciate your patience while we complete the final development and testing needed for a reliable launch.",
  supportingText:
    "Official Android and iOS download information will be announced as soon as the apps are ready.",
  backButtonLabel: "Return to previous page",
};