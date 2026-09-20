import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Compass,
  Globe,
  Target,
  Users,
} from "lucide-react";
import SEO from "../../components/SEO";

const SITE_URL = "https://mongosky.com";
const PROFILE_URL = `${SITE_URL}/co-founder`;
const COMPANY_URL = `${SITE_URL}/company`;
const PERSON_ID = `${PROFILE_URL}#person`;
const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;
const FOUNDER_ID = `${SITE_URL}/founder#person`;
const PAGE_TITLE = "Arafat Hasan Rohan | Co-Founder of MongoSky";
const PAGE_DESCRIPTION =
  "Meet Arafat Hasan Rohan, also known as A.H. Rohan, Co-Founder of MongoSky. Explore his role in platform strategy, website management and community development.";

const coFounder = {
  name: "Arafat Hasan Rohan",
  alternateNames: ["A.H. Rohan", "Arafat Rohan"],
  role: "Co-Founder of MongoSky",
  country: "Bangladesh",
  image: "/co-founder.jpg",
};

const responsibilities = [
  {
    icon: Target,
    title: "Platform strategy",
    description: "Contributes to MongoSky's direction and planning, with a focus on useful experiences and the platform's continued development.",
  },
  {
    icon: Globe,
    title: "Website management",
    description: "Works on the management of the MongoSky website alongside the Founder and development team.",
  },
  {
    icon: Compass,
    title: "Brand development",
    description: "Contributes to MongoSky's identity and how the platform's purpose, values and social experience are communicated.",
  },
  {
    icon: Users,
    title: "Community development",
    description: "Focuses on community building and user engagement, supporting connections and meaningful participation on the platform.",
  },
];

const focusGroups = [
  {
    icon: Target,
    title: "Strategy and planning",
    areas: ["Digital Strategy", "Strategic Planning", "Technology Entrepreneurship"],
  },
  {
    icon: Compass,
    title: "Brand and innovation",
    areas: ["Brand Development", "Social Media Innovation"],
  },
  {
    icon: Users,
    title: "People and community",
    areas: ["Community Building", "User Engagement"],
  },
];

const principles = [
  {
    title: "Useful experiences",
    description: "Understand how people use social platforms and support experiences that are clear and relevant to their needs.",
  },
  {
    title: "Meaningful communities",
    description: "Encourage participation, authentic expression and respectful conversations between people.",
  },
  {
    title: "Thoughtful development",
    description: "Support MongoSky's long-term direction through planning, collaboration and attention to the user experience.",
  },
];

const questions = [
  {
    question: "Who is Arafat Hasan Rohan?",
    answer: "Arafat Hasan Rohan, also known as A.H. Rohan and Arafat Rohan, is the Co-Founder of MongoSky. He is a technology enthusiast and entrepreneur from Bangladesh.",
  },
  {
    question: "What is his role at MongoSky?",
    answer: "He contributes to platform strategy, website management, branding and community development, working with the Founder and development team.",
  },
  {
    question: "When did MongoSky development begin?",
    answer: "Development of MongoSky began in 2025. The platform continues to evolve through ongoing development and improvements.",
  },
  {
    question: "Who is MongoSky's Founder?",
    answer: "Murad Ahmed, also known as Murad Ahmed Simanto, is the Founder of MongoSky and a Full Stack Developer. He leads the platform's product direction and technical development.",
  },
];

const coFounderSchema = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "ProfilePage",
      "@id": `${PROFILE_URL}#webpage`,
      url: PROFILE_URL,
      name: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      inLanguage: "en",
      isPartOf: { "@id": WEBSITE_ID },
      mainEntity: { "@id": PERSON_ID },
    },
    {
      "@type": "Person",
      "@id": PERSON_ID,
      name: coFounder.name,
      alternateName: coFounder.alternateNames,
      url: PROFILE_URL,
      image: `${SITE_URL}${coFounder.image}`,
      description: PAGE_DESCRIPTION,
      jobTitle: coFounder.role,
      nationality: { "@type": "Country", name: coFounder.country },
      worksFor: { "@id": ORGANIZATION_ID },
      knowsAbout: focusGroups.flatMap((group) => group.areas),
      mainEntityOfPage: { "@id": `${PROFILE_URL}#webpage` },
    },
    {
      "@type": "Organization",
      "@id": ORGANIZATION_ID,
      name: "MongoSky",
      alternateName: "MongoSky Social Media Platform",
      url: SITE_URL,
      description: "MongoSky is a social media platform whose development began in 2025, with Founder Murad Ahmed and Co-Founder Arafat Hasan Rohan.",
      industry: "Social Media Technology",
      location: { "@type": "Country", name: "Bangladesh" },
      founder: [{ "@id": FOUNDER_ID }, { "@id": PERSON_ID }],
      mainEntityOfPage: COMPANY_URL,
    },
    {
      "@type": "WebSite",
      "@id": WEBSITE_ID,
      name: "MongoSky",
      url: SITE_URL,
      publisher: { "@id": ORGANIZATION_ID },
    },
    {
      "@type": "Person",
      "@id": FOUNDER_ID,
      name: "Murad Ahmed",
      alternateName: "Murad Ahmed Simanto",
      jobTitle: ["Founder of MongoSky", "Full Stack Developer"],
      url: `${SITE_URL}/founder`,
      worksFor: { "@id": ORGANIZATION_ID },
    },
  ],
};

const sectionClass = "tw:mt-10 tw:sm:mt-14";
const headingClass = "tw:text-xl tw:font-bold tw:leading-8 tw:tracking-tight tw:text-slate-900 tw:sm:text-2xl";
const paragraphClass = "tw:mt-3 tw:text-base tw:leading-7 tw:text-slate-600";
const cardClass = "tw:min-w-0 tw:rounded-2xl tw:border tw:border-solid tw:border-slate-200 tw:bg-white tw:p-5 tw:sm:p-6";
const focusClass = "tw:focus-visible:outline-2 tw:focus-visible:outline-solid tw:focus-visible:outline-offset-4 tw:focus-visible:outline-rose-600";
const textLinkClass = `tw:inline-flex tw:min-h-11 tw:items-center tw:gap-2 tw:rounded-lg tw:font-semibold tw:text-rose-700 tw:no-underline tw:touch-manipulation tw:hover:underline ${focusClass}`;

export default function CoFounderPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    if (location.key === "default") {
      navigate("/company", { replace: true });
      return;
    }
    navigate(-1);
  };

  return (
    <div className="tw:min-h-dvh tw:w-full tw:bg-white tw:font-sans tw:leading-normal tw:text-slate-900">
      <SEO
        title={PAGE_TITLE}
        description={PAGE_DESCRIPTION}
        image={`${SITE_URL}${coFounder.image}`}
        url={PROFILE_URL}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(coFounderSchema).replace(/</g, "\\u003c"),
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
          <p className="tw:text-lg tw:font-semibold">Co-Founder</p>
        </div>
      </header>

      <main aria-labelledby="co-founder-name" className="tw:mx-auto tw:w-full tw:max-w-5xl tw:px-5 tw:pt-8 tw:pb-[calc(2rem+env(safe-area-inset-bottom))] tw:sm:px-8 tw:sm:pt-12">
        <section aria-labelledby="co-founder-name" className="tw:rounded-3xl tw:border tw:border-solid tw:border-rose-100 tw:bg-rose-50 tw:px-5 tw:py-8 tw:sm:px-9 tw:sm:py-10">
          <div className="tw:flex tw:flex-col tw:items-start tw:gap-6 tw:sm:flex-row tw:sm:items-center tw:sm:gap-8">
            <img
              src={coFounder.image}
              alt={`${coFounder.name}, ${coFounder.role}`}
              width={144}
              height={144}
              fetchPriority="high"
              decoding="async"
              className="tw:block tw:size-28 tw:shrink-0 tw:rounded-3xl tw:object-cover tw:sm:size-36"
            />
            <div className="tw:min-w-0">
              <p className="tw:text-sm tw:font-semibold tw:text-rose-700">{coFounder.role}</p>
              <h1 id="co-founder-name" className="tw:mt-2 tw:text-3xl tw:font-bold tw:leading-tight tw:tracking-tight tw:text-slate-900 tw:sm:text-4xl">{coFounder.name}</h1>
              <p className="tw:mt-3 tw:text-base tw:font-medium tw:leading-7 tw:text-slate-700">Strategy, community and brand development</p>
              <p className="tw:mt-2 tw:text-sm tw:leading-6 tw:text-slate-600">Also known as {coFounder.alternateNames.join(" and ")} · {coFounder.country}</p>
            </div>
          </div>
          <p className="tw:mt-6 tw:max-w-3xl tw:text-base tw:leading-7 tw:text-slate-700 tw:sm:text-lg tw:sm:leading-8">
            Arafat Hasan Rohan is the Co-Founder of MongoSky, a social media
            platform for connecting people, sharing content and building
            online communities. He contributes to its strategy, website
            management, branding and community development.
          </p>
          <Link to="/company" className={`tw:mt-6 tw:inline-flex tw:min-h-12 tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:bg-rose-600 tw:px-5 tw:py-3 tw:text-sm tw:font-semibold tw:text-white tw:no-underline tw:touch-manipulation tw:hover:bg-rose-700 ${focusClass}`}>
            Explore MongoSky <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </section>

        <section aria-labelledby="co-founder-profile-title" className={sectionClass}>
          <h2 id="co-founder-profile-title" className={headingClass}>Profile at a glance</h2>
          <dl className="tw:mt-4 tw:grid tw:gap-3 tw:sm:grid-cols-2">
            {[
              { label: "Role", value: coFounder.role },
              { label: "Also known as", value: "A.H. Rohan" },
              { label: "Country", value: coFounder.country },
              { label: "MongoSky development began", value: "2025" },
            ].map((fact) => (
              <div key={fact.label} className="tw:rounded-2xl tw:bg-slate-50 tw:p-5">
                <dt className="tw:text-sm tw:text-slate-600">{fact.label}</dt>
                <dd className="tw:mt-2 tw:text-base tw:font-semibold tw:leading-6 tw:text-slate-900">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="co-founder-biography-title" className={sectionClass}>
          <h2 id="co-founder-biography-title" className={headingClass}>About Arafat Hasan Rohan</h2>
          <p className={paragraphClass}>
            Arafat Hasan Rohan is a technology enthusiast and entrepreneur
            from Bangladesh. His interests include digital innovation,
            online communities, user experience and modern technology platforms.
          </p>
          <p className={paragraphClass}>
            At MongoSky, he focuses on the connection between platform strategy
            and the people using the service. His work includes website
            management, brand development and supporting the growth of the
            platform's community.
          </p>
        </section>

        <section aria-labelledby="co-founder-story-title" className={`${sectionClass} tw:rounded-3xl tw:bg-slate-50 tw:p-5 tw:sm:p-8`}>
          <p className="tw:text-sm tw:font-semibold tw:text-rose-700">The MongoSky journey</p>
          <h2 id="co-founder-story-title" className={`tw:mt-2 ${headingClass}`}>MongoSky's story began in 2025</h2>
          <p className={paragraphClass}>
            Development of MongoSky began in 2025. The platform brings together
            profiles, posts, photos, videos, reels and social interactions to
            help people express themselves and connect with others.
          </p>
          <p className={paragraphClass}>
            Founder Murad Ahmed leads its product direction and technical
            development. As Co-Founder, Arafat Hasan Rohan works with the
            Founder and development team on strategy, website management,
            branding and community development.
          </p>
          <Link to="/company" className={`tw:mt-3 tw:text-sm ${textLinkClass}`}>Read the Company story <ArrowRight size={17} aria-hidden="true" /></Link>
        </section>

        <section aria-labelledby="co-founder-role-title" className={sectionClass}>
          <h2 id="co-founder-role-title" className={headingClass}>His role at MongoSky</h2>
          <div className="tw:mt-5 tw:grid tw:gap-4 tw:sm:grid-cols-2">
            {responsibilities.map(({ icon: Icon, title, description }) => (
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

        <section aria-labelledby="co-founder-focus-title" className={sectionClass}>
          <h2 id="co-founder-focus-title" className={headingClass}>Areas of focus</h2>
          <p className={paragraphClass}>His interests and contributions bring together strategy, brand development and community participation.</p>
          <div className="tw:mt-5 tw:grid tw:gap-4 tw:lg:grid-cols-3">
            {focusGroups.map(({ icon: Icon, title, areas }) => (
              <article key={title} className={cardClass}>
                <div className="tw:flex tw:items-center tw:gap-3">
                  <Icon size={21} className="tw:shrink-0 tw:text-rose-600" aria-hidden="true" />
                  <h3 className="tw:text-base tw:font-semibold tw:leading-6">{title}</h3>
                </div>
                <ul className="tw:m-0 tw:mt-4 tw:flex tw:list-none tw:flex-wrap tw:gap-2 tw:p-0">
                  {areas.map((area) => (
                    <li key={area} className="tw:max-w-full tw:rounded-lg tw:bg-slate-100 tw:px-3 tw:py-2 tw:text-sm tw:leading-5 tw:text-slate-700">{area}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="co-founder-vision-title" className={sectionClass}>
          <h2 id="co-founder-vision-title" className={headingClass}>Vision and approach</h2>
          <p className={paragraphClass}>
            His vision is to contribute to a social platform where people
            can connect, communicate, share ideas and create meaningful
            communities. Three priorities guide this approach.
          </p>
          <div className="tw:mt-5 tw:grid tw:gap-4 tw:md:grid-cols-3">
            {principles.map((principle) => (
              <article key={principle.title} className="tw:rounded-2xl tw:bg-slate-50 tw:p-5">
                <h3 className="tw:text-base tw:font-semibold tw:leading-6">{principle.title}</h3>
                <p className="tw:mt-2 tw:text-sm tw:leading-6 tw:text-slate-600">{principle.description}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="co-founder-questions-title" className={sectionClass}>
          <h2 id="co-founder-questions-title" className={headingClass}>Common questions</h2>
          <div className="tw:mt-5 tw:grid tw:gap-3">
            {questions.map((item) => (
              <article key={item.question} className={cardClass}>
                <h3 className="tw:text-base tw:font-semibold tw:leading-6">{item.question}</h3>
                <p className="tw:mt-2 tw:text-sm tw:leading-7 tw:text-slate-600">{item.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="co-founder-related-title" className={`${sectionClass} tw:rounded-3xl tw:border tw:border-solid tw:border-rose-100 tw:bg-rose-50 tw:p-5 tw:sm:p-8`}>
          <h2 id="co-founder-related-title" className={headingClass}>Meet MongoSky's Founder</h2>
          <p className={paragraphClass}>Learn about Murad Ahmed, also known as Murad Ahmed Simanto, and his work as MongoSky's Founder and Full Stack Developer.</p>
          <Link to="/founder" className={`tw:mt-3 tw:text-sm ${textLinkClass}`}>Read Murad Ahmed's profile <ArrowRight size={17} className="tw:shrink-0" aria-hidden="true" /></Link>
        </section>

        <footer className="tw:mt-10 tw:border-0 tw:border-t tw:border-solid tw:border-slate-200 tw:pt-6">
          <p className="tw:text-lg tw:font-bold">MongoSky</p>
          <p className="tw:mt-2 tw:text-sm tw:leading-6 tw:text-slate-600">People, ideas and the work behind the platform.</p>
          <nav aria-label="Company information" className="tw:mt-3 tw:flex tw:flex-wrap tw:gap-x-5 tw:gap-y-1 tw:text-sm">
            <Link to="/company" className={textLinkClass}>Company</Link>
            <Link to="/founder" className={textLinkClass}>Founder</Link>
            <Link to="/about" className={textLinkClass}>About the platform</Link>
            <Link to="/privacy-policy" className={textLinkClass}>Privacy Policy</Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}