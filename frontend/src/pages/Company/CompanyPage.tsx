import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Heart,
  Image as ImageIcon,
  MessageCircle,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";
import SEO from "../../components/SEO";

const SITE_URL = "https://mongosky.com";
const COMPANY_URL = `${SITE_URL}/company`;
const PAGE_TITLE = "About MongoSky | Our Story, Features and Founders";
const PAGE_DESCRIPTION =
  "Discover MongoSky, a social media platform whose development began in 2025, with Founder Murad Ahmed and Co-Founder Arafat Hasan Rohan.";

const features = [
  {
    icon: UserRound,
    title: "Your own profile",
    description: "Introduce yourself through your profile, photo, cover and the content you choose to share.",
  },
  {
    icon: ImageIcon,
    title: "Posts, photos and videos",
    description: "Share thoughts, everyday moments and creative work through text, images and video.",
  },
  {
    icon: Users,
    title: "People and connections",
    description: "Find people, explore profiles and follow accounts that interest you.",
  },
  {
    icon: MessageCircle,
    title: "Conversations around content",
    description: "Take part through comments, replies and reactions that keep conversations going.",
  },
  {
    icon: Heart,
    title: "Reels and discovery",
    description: "Explore short videos, discover content and save posts you want to revisit.",
  },
  {
    icon: ShieldCheck,
    title: "Account management",
    description: "Access settings for your profile, password, verification information and account deletion.",
  },
];

const leadership = [
  {
    name: "Murad Ahmed",
    alternateName: "Murad Ahmed Simanto",
    role: "Founder",
    path: "/founder",
    image: "/founder.jpg",
    description: "Leads MongoSky's product direction and platform development, including its frontend, backend and technical foundation.",
  },
  {
    name: "Arafat Hasan Rohan",
    alternateName: "A.H. Rohan",
    role: "Co-Founder",
    path: "/co-founder",
    image: "/co-founder.jpg",
    description: "Contributes to platform strategy, website management, branding and community development.",
  },
];

const priorities = [
  {
    title: "Simple to use",
    description: "Clear navigation and a consistent experience across mobile, tablet and desktop.",
  },
  {
    title: "Respectful participation",
    description: "Encouraging authentic sharing, thoughtful conversations and respect for other people.",
  },
  {
    title: "Privacy and control",
    description: "Helping people understand their account options and make informed choices about their information.",
  },
  {
    title: "Continuous improvement",
    description: "Developing the platform with attention to accessibility, performance and user feedback.",
  },
];

const questions = [
  {
    question: "What is MongoSky?",
    answer: "MongoSky is a social media platform for connecting with people, sharing content and taking part in online conversations and communities.",
  },
  {
    question: "When did MongoSky development begin?",
    answer: "Development of MongoSky began in 2025. The platform continues to evolve through ongoing development and improvements.",
  },
  {
    question: "Who is the Founder of MongoSky?",
    answer: "Murad Ahmed, also known as Murad Ahmed Simanto, is the Founder of MongoSky.",
  },
  {
    question: "Who is the Co-Founder of MongoSky?",
    answer: "Arafat Hasan Rohan, also known as A.H. Rohan, is the Co-Founder of MongoSky.",
  },
  {
    question: "What is MongoSky's official website?",
    answer: "MongoSky's official website is https://mongosky.com. This Company page and the linked leadership profiles explain the platform and the people behind it.",
  },
];

const organizationId = `${SITE_URL}/#organization`;
const websiteId = `${SITE_URL}/#website`;

const companySchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": organizationId,
      name: "MongoSky",
      alternateName: "MongoSky Social Media Platform",
      url: SITE_URL,
      description: PAGE_DESCRIPTION,
      industry: "Social Media Technology",
      location: { "@type": "Country", name: "Bangladesh" },
      founder: leadership.map((person) => ({
        "@id": `${SITE_URL}${person.path}#person`,
      })),
      mainEntityOfPage: { "@id": `${COMPANY_URL}#webpage` },
    },
    {
      "@type": "WebSite",
      "@id": websiteId,
      name: "MongoSky",
      url: SITE_URL,
      description: "A social media platform for connection, content sharing and online communities.",
      publisher: { "@id": organizationId },
    },
    {
      "@type": "AboutPage",
      "@id": `${COMPANY_URL}#webpage`,
      url: COMPANY_URL,
      name: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      inLanguage: "en",
      isPartOf: { "@id": websiteId },
      about: { "@id": organizationId },
      mainEntity: { "@id": organizationId },
    },
    ...leadership.map((person) => ({
      "@type": "Person",
      "@id": `${SITE_URL}${person.path}#person`,
      name: person.name,
      alternateName: person.alternateName,
      jobTitle: `${person.role} of MongoSky`,
      description: person.description,
      url: `${SITE_URL}${person.path}`,
      image: `${SITE_URL}${person.image}`,
      worksFor: { "@id": organizationId },
    })),
  ],
};

const sectionClass = "tw:mt-10 tw:sm:mt-14";
const headingClass = "tw:text-xl tw:font-bold tw:leading-8 tw:tracking-tight tw:text-slate-900 tw:sm:text-2xl";
const paragraphClass = "tw:mt-3 tw:text-base tw:leading-7 tw:text-slate-600";
const cardClass = "tw:min-w-0 tw:rounded-2xl tw:border tw:border-solid tw:border-slate-200 tw:bg-white tw:p-5 tw:sm:p-6";
const focusClass = "tw:focus-visible:outline-2 tw:focus-visible:outline-solid tw:focus-visible:outline-offset-4 tw:focus-visible:outline-rose-600";
const textLinkClass = `tw:inline-flex tw:min-h-11 tw:items-center tw:gap-2 tw:rounded-lg tw:font-semibold tw:text-rose-700 tw:no-underline tw:touch-manipulation tw:hover:underline ${focusClass}`;

export default function CompanyPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    if (location.key === "default") {
      navigate("/about", { replace: true });
      return;
    }
    navigate(-1);
  };

  return (
    <div className="tw:min-h-dvh tw:w-full tw:bg-white tw:font-sans tw:leading-normal tw:text-slate-900">
      <SEO
        title={PAGE_TITLE}
        description={PAGE_DESCRIPTION}
        image={`${SITE_URL}/mongosky-ai.png`}
        url={COMPANY_URL}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(companySchema).replace(/</g, "\\u003c"),
        }}
      />

      <header className="tw:border-0 tw:border-b tw:border-solid tw:border-slate-100 tw:bg-white tw:pt-[env(safe-area-inset-top)]">
        <div className="tw:mx-auto tw:flex tw:min-h-16 tw:w-full tw:max-w-5xl tw:items-center tw:gap-2 tw:px-3 tw:sm:px-6">
          <button
            type="button"
            onClick={handleBack}
            aria-label="Go back"
            className={`tw:flex tw:size-11 tw:shrink-0 tw:cursor-pointer tw:items-center tw:justify-center tw:rounded-full tw:border-0 tw:bg-transparent tw:p-0 tw:text-slate-900 tw:touch-manipulation tw:hover:bg-slate-100 ${focusClass}`}
          >
            <ArrowLeft size={22} aria-hidden="true" />
          </button>
          <p className="tw:text-lg tw:font-semibold">Company</p>
        </div>
      </header>

      <main aria-labelledby="company-title" className="tw:mx-auto tw:w-full tw:max-w-5xl tw:px-5 tw:pt-8 tw:pb-[calc(2rem+env(safe-area-inset-bottom))] tw:sm:px-8 tw:sm:pt-12">
        <section aria-labelledby="company-title" className="tw:rounded-3xl tw:border tw:border-solid tw:border-rose-100 tw:bg-rose-50 tw:px-5 tw:py-8 tw:sm:px-9 tw:sm:py-12">
          <p className="tw:text-sm tw:font-semibold tw:text-rose-700">Connecting people. Sharing possibilities.</p>
          <h1 id="company-title" className="tw:mt-3 tw:text-4xl tw:font-bold tw:leading-tight tw:tracking-tight tw:text-slate-900 tw:sm:text-5xl">About MongoSky</h1>
          <p className="tw:mt-5 tw:max-w-2xl tw:text-base tw:leading-7 tw:text-slate-700 tw:sm:text-lg tw:sm:leading-8">
            MongoSky is a social media platform for connecting with people,
            sharing ideas and content, and building meaningful online communities.
            Development began in 2025, with Founder Murad Ahmed and
            Co-Founder Arafat Hasan Rohan.
          </p>
          <div className="tw:mt-6 tw:flex tw:flex-wrap tw:gap-3">
            <Link to="/signup" className={`tw:inline-flex tw:min-h-12 tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:bg-rose-600 tw:px-5 tw:py-3 tw:text-sm tw:font-semibold tw:text-white tw:no-underline tw:touch-manipulation tw:hover:bg-rose-700 ${focusClass}`}>
              Join MongoSky <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link to="/login" className={`tw:inline-flex tw:min-h-12 tw:items-center tw:justify-center tw:rounded-xl tw:border tw:border-solid tw:border-rose-200 tw:bg-white tw:px-5 tw:py-3 tw:text-sm tw:font-semibold tw:text-slate-900 tw:no-underline tw:touch-manipulation tw:hover:bg-rose-100 ${focusClass}`}>
              Log in
            </Link>
          </div>
        </section>

        <section aria-labelledby="company-facts-title" className={sectionClass}>
          <h2 id="company-facts-title" className={headingClass}>MongoSky at a glance</h2>
          <dl className="tw:mt-4 tw:grid tw:gap-3 tw:sm:grid-cols-3">
            {[
              { label: "Development started", value: "2025" },
              { label: "Platform category", value: "Social media" },
              { label: "Country", value: "Bangladesh" },
            ].map((fact) => (
              <div key={fact.label} className="tw:rounded-2xl tw:bg-slate-50 tw:p-5">
                <dt className="tw:text-sm tw:text-slate-600">{fact.label}</dt>
                <dd className="tw:mt-2 tw:text-lg tw:font-bold tw:text-slate-900">{fact.value}</dd>
              </div>
            ))}
          </dl>
          <p className="tw:mt-3 tw:text-sm tw:leading-6 tw:text-slate-600">
            Official website:{" "}
            <a href={SITE_URL} className={textLinkClass}>mongosky.com</a>
          </p>
        </section>

        <section aria-labelledby="company-story-title" className={sectionClass}>
          <h2 id="company-story-title" className={headingClass}>Our story started in 2025</h2>
          <p className={paragraphClass}>
            MongoSky began as a social media development project in 2025,
            with a focus on making connection, communication and content sharing
            easier to bring together in one place.
          </p>
          <p className={paragraphClass}>
            That work continues today. The platform brings together profiles,
            posts, photos, videos, reels and social interactions, while ongoing
            development focuses on a clearer, more dependable experience.
          </p>
        </section>

        <section aria-labelledby="company-features-title" className={sectionClass}>
          <h2 id="company-features-title" className={headingClass}>What you can do on MongoSky</h2>
          <p className={paragraphClass}>Make a space for your interests, your ideas and your connections.</p>
          <div className="tw:mt-5 tw:grid tw:gap-4 tw:sm:grid-cols-2 tw:lg:grid-cols-3">
            {features.map(({ icon: Icon, title, description }) => (
              <article key={title} className={cardClass}>
                <div className="tw:flex tw:size-11 tw:items-center tw:justify-center tw:rounded-xl tw:bg-rose-50 tw:text-rose-600">
                  <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
                </div>
                <h3 className="tw:mt-4 tw:text-base tw:font-semibold tw:leading-6">{title}</h3>
                <p className="tw:mt-2 tw:text-sm tw:leading-6 tw:text-slate-600">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="company-mission-title" className={`${sectionClass} tw:rounded-3xl tw:bg-slate-50 tw:p-5 tw:sm:p-8`}>
          <h2 id="company-mission-title" className={headingClass}>Our mission and vision</h2>
          <div className="tw:mt-4 tw:grid tw:gap-6 tw:sm:grid-cols-2">
            <div>
              <h3 className="tw:text-base tw:font-semibold tw:text-rose-700">Our mission</h3>
              <p className={paragraphClass}>To help people express themselves, share what matters and build meaningful connections through an accessible social experience.</p>
            </div>
            <div>
              <h3 className="tw:text-base tw:font-semibold tw:text-rose-700">Our vision</h3>
              <p className={paragraphClass}>To grow MongoSky into a trusted social platform through thoughtful design, responsible communication and continuous improvement.</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="company-leadership-title" className={sectionClass}>
          <h2 id="company-leadership-title" className={headingClass}>The people behind MongoSky</h2>
          <div className="tw:mt-5 tw:grid tw:gap-4 tw:sm:grid-cols-2">
            {leadership.map((person) => (
              <article key={person.path} className={cardClass}>
                <img src={person.image} alt={`${person.name}, ${person.role} of MongoSky`} width={80} height={80} loading="lazy" decoding="async" className="tw:block tw:size-20 tw:rounded-2xl tw:object-cover" />
                <p className="tw:mt-4 tw:text-sm tw:font-semibold tw:text-rose-700">{person.role}</p>
                <h3 className="tw:mt-1 tw:text-xl tw:font-bold tw:leading-7">{person.name}</h3>
                <p className="tw:mt-1 tw:text-sm tw:leading-6 tw:text-slate-500">Also known as {person.alternateName}</p>
                <p className="tw:mt-3 tw:text-sm tw:leading-6 tw:text-slate-600">{person.description}</p>
                <Link to={person.path} aria-label={`Read about ${person.name}`} className={`tw:mt-3 tw:text-sm ${textLinkClass}`}>
                  Read profile <ArrowRight size={17} aria-hidden="true" />
                </Link>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="company-priorities-title" className={sectionClass}>
          <h2 id="company-priorities-title" className={headingClass}>What guides our development</h2>
          <div className="tw:mt-5 tw:grid tw:gap-4 tw:sm:grid-cols-2">
            {priorities.map((priority) => (
              <article key={priority.title} className="tw:rounded-2xl tw:bg-slate-50 tw:p-5">
                <h3 className="tw:text-base tw:font-semibold">{priority.title}</h3>
                <p className="tw:mt-2 tw:text-sm tw:leading-6 tw:text-slate-600">{priority.description}</p>
              </article>
            ))}
          </div>
          <p className={paragraphClass}>
            Our ongoing work also includes improving the mobile experience and
            developing useful AI-assisted features as the platform evolves.
          </p>
          <Link to="/privacy-policy" className={`tw:mt-2 tw:text-sm ${textLinkClass}`}>Read our Privacy Policy <ArrowRight size={17} aria-hidden="true" /></Link>
        </section>

        <section aria-labelledby="company-questions-title" className={sectionClass}>
          <h2 id="company-questions-title" className={headingClass}>Common questions</h2>
          <div className="tw:mt-5 tw:grid tw:gap-3">
            {questions.map((item) => (
              <article key={item.question} className={cardClass}>
                <h3 className="tw:text-base tw:font-semibold tw:leading-6">{item.question}</h3>
                <p className="tw:mt-2 tw:text-sm tw:leading-7 tw:text-slate-600">{item.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <footer className="tw:mt-10 tw:border-0 tw:border-t tw:border-solid tw:border-slate-200 tw:pt-6">
          <p className="tw:text-lg tw:font-bold">MongoSky</p>
          <p className="tw:mt-2 tw:text-sm tw:leading-6 tw:text-slate-600">A social media platform for people, ideas and communities.</p>
          <nav aria-label="Company information" className="tw:mt-3 tw:flex tw:flex-wrap tw:gap-x-5 tw:gap-y-1 tw:text-sm">
            <Link to="/about" className={textLinkClass}>About the platform</Link>
            <Link to="/founder" className={textLinkClass}>Founder</Link>
            <Link to="/co-founder" className={textLinkClass}>Co-Founder</Link>
            <Link to="/privacy-policy" className={textLinkClass}>Privacy Policy</Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}