import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Code2,
  Database,
  Layers3,
  MonitorSmartphone,
  Server,
  Target,
} from "lucide-react";
import SEO from "../../components/SEO";

const SITE_URL = "https://mongosky.com";
const PROFILE_URL = `${SITE_URL}/founder`;
const COMPANY_URL = `${SITE_URL}/company`;
const PERSON_ID = `${PROFILE_URL}#person`;
const ORGANIZATION_ID = `${SITE_URL}/#organization`;
const WEBSITE_ID = `${SITE_URL}/#website`;
const CO_FOUNDER_ID = `${SITE_URL}/co-founder#person`;
const PAGE_TITLE = "Murad Ahmed | Founder of MongoSky & Full Stack Developer";
const PAGE_DESCRIPTION =
  "Meet Murad Ahmed, also known as Murad Ahmed Simanto, Founder of MongoSky and a Full Stack Developer from Bangladesh. Explore his role and technical expertise.";

const founder = {
  name: "Murad Ahmed",
  alternateNames: ["Murad Ahmed Simanto", "Murad Simanto"],
  role: "Founder of MongoSky",
  profession: "Full Stack Developer",
  country: "Bangladesh",
  image: "/founder.jpg",
};

const responsibilities = [
  {
    icon: Target,
    title: "Product direction",
    description: "Leads MongoSky's product vision and the direction of its social experience, with attention to the needs of the people using it.",
  },
  {
    icon: MonitorSmartphone,
    title: "Frontend development",
    description: "Works on the interfaces people use to explore the platform, share content and manage their accounts across devices.",
  },
  {
    icon: Server,
    title: "Backend engineering",
    description: "Develops the services and APIs that connect the platform's interfaces with its application logic and data.",
  },
  {
    icon: Database,
    title: "Data and architecture",
    description: "Works on database systems and technical architecture, with a focus on maintainability, performance and future development.",
  },
];

const skillGroups = [
  {
    icon: Code2,
    title: "Web development",
    skills: ["Full Stack Web Development", "React.js", "Next.js"],
  },
  {
    icon: Server,
    title: "Backend development",
    skills: ["Node.js", "Go Programming", "Python Development", "REST API Development"],
  },
  {
    icon: Database,
    title: "Databases and services",
    skills: ["MongoDB", "PostgreSQL", "MySQL", "Firebase", "Supabase", "Database Engineering"],
  },
  {
    icon: Layers3,
    title: "Engineering and workflow",
    skills: ["Git & GitHub", "Backend Architecture", "System Design"],
  },
];

const principles = [
  {
    title: "People and usability",
    description: "Keep everyday actions clear and useful, from discovering content to managing an account.",
  },
  {
    title: "Privacy and responsibility",
    description: "Consider privacy, account control and responsible communication as the platform develops.",
  },
  {
    title: "Performance and growth",
    description: "Improve the technical foundation while keeping the experience responsive and the code maintainable.",
  },
];

const questions = [
  {
    question: "Who is Murad Ahmed?",
    answer: "Murad Ahmed, also known as Murad Ahmed Simanto and Murad Simanto, is the Founder of MongoSky and a Full Stack Developer from Bangladesh.",
  },
  {
    question: "What is his role at MongoSky?",
    answer: "He leads the platform's product direction and technical development, including frontend interfaces, backend services, database systems and architecture.",
  },
  {
    question: "When did MongoSky development begin?",
    answer: "Development of MongoSky began in 2025. The platform continues to evolve through ongoing development and improvements.",
  },
  {
    question: "Who is MongoSky's Co-Founder?",
    answer: "Arafat Hasan Rohan, also known as A.H. Rohan, is the Co-Founder of MongoSky. His work includes platform strategy, website management and community development.",
  },
];

const founderSchema = {
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
      name: founder.name,
      alternateName: founder.alternateNames,
      url: PROFILE_URL,
      image: `${SITE_URL}${founder.image}`,
      description: PAGE_DESCRIPTION,
      jobTitle: [founder.role, founder.profession],
      nationality: { "@type": "Country", name: founder.country },
      worksFor: { "@id": ORGANIZATION_ID },
      knowsAbout: skillGroups.flatMap((group) => group.skills),
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
      founder: [{ "@id": PERSON_ID }, { "@id": CO_FOUNDER_ID }],
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
      "@id": CO_FOUNDER_ID,
      name: "Arafat Hasan Rohan",
      alternateName: "A.H. Rohan",
      jobTitle: "Co-Founder of MongoSky",
      url: `${SITE_URL}/co-founder`,
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

export default function FounderPage() {
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
        image={`${SITE_URL}${founder.image}`}
        url={PROFILE_URL}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(founderSchema).replace(/</g, "\\u003c"),
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
          <p className="tw:text-lg tw:font-semibold">Founder</p>
        </div>
      </header>

      <main aria-labelledby="founder-name" className="tw:mx-auto tw:w-full tw:max-w-5xl tw:px-5 tw:pt-8 tw:pb-[calc(2rem+env(safe-area-inset-bottom))] tw:sm:px-8 tw:sm:pt-12">
        <section aria-labelledby="founder-name" className="tw:rounded-3xl tw:border tw:border-solid tw:border-rose-100 tw:bg-rose-50 tw:px-5 tw:py-8 tw:sm:px-9 tw:sm:py-10">
          <div className="tw:flex tw:flex-col tw:items-start tw:gap-6 tw:sm:flex-row tw:sm:items-center tw:sm:gap-8">
            <img
              src={founder.image}
              alt={`${founder.name}, ${founder.role}`}
              width={144}
              height={144}
              fetchPriority="high"
              decoding="async"
              className="tw:block tw:size-28 tw:shrink-0 tw:rounded-3xl tw:object-cover tw:sm:size-36"
            />
            <div className="tw:min-w-0">
              <p className="tw:text-sm tw:font-semibold tw:text-rose-700">{founder.role}</p>
              <h1 id="founder-name" className="tw:mt-2 tw:text-3xl tw:font-bold tw:leading-tight tw:tracking-tight tw:text-slate-900 tw:sm:text-4xl">{founder.name}</h1>
              <p className="tw:mt-3 tw:text-base tw:font-medium tw:leading-7 tw:text-slate-700">{founder.profession} · {founder.country}</p>
              <p className="tw:mt-2 tw:text-sm tw:leading-6 tw:text-slate-600">Also known as {founder.alternateNames.join(" and ")}</p>
            </div>
          </div>
          <p className="tw:mt-6 tw:max-w-3xl tw:text-base tw:leading-7 tw:text-slate-700 tw:sm:text-lg tw:sm:leading-8">
            Murad Ahmed is the Founder of MongoSky, a social media platform
            for connecting people, sharing content and building online communities.
            He leads the platform's product direction and technical development.
          </p>
          <Link to="/company" className={`tw:mt-6 tw:inline-flex tw:min-h-12 tw:items-center tw:justify-center tw:gap-2 tw:rounded-xl tw:bg-rose-600 tw:px-5 tw:py-3 tw:text-sm tw:font-semibold tw:text-white tw:no-underline tw:touch-manipulation tw:hover:bg-rose-700 ${focusClass}`}>
            Explore MongoSky <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </section>

        <section aria-labelledby="founder-profile-title" className={sectionClass}>
          <h2 id="founder-profile-title" className={headingClass}>Profile at a glance</h2>
          <dl className="tw:mt-4 tw:grid tw:gap-3 tw:sm:grid-cols-2">
            {[
              { label: "Role", value: founder.role },
              { label: "Profession", value: founder.profession },
              { label: "Country", value: founder.country },
              { label: "MongoSky development began", value: "2025" },
            ].map((fact) => (
              <div key={fact.label} className="tw:rounded-2xl tw:bg-slate-50 tw:p-5">
                <dt className="tw:text-sm tw:text-slate-600">{fact.label}</dt>
                <dd className="tw:mt-2 tw:text-base tw:font-semibold tw:leading-6 tw:text-slate-900">{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="founder-biography-title" className={sectionClass}>
          <h2 id="founder-biography-title" className={headingClass}>About Murad Ahmed</h2>
          <p className={paragraphClass}>
            Murad Ahmed, also known as Murad Ahmed Simanto, is a Full Stack
            Developer and technology entrepreneur from Bangladesh. His work
            spans frontend development, backend services, database systems and
            the architecture that brings these parts together.
          </p>
          <p className={paragraphClass}>
            Through MongoSky, he works on turning a social platform's product
            vision into everyday experiences, with a focus on usability,
            performance and a technical foundation that can continue to evolve.
          </p>
        </section>

        <section aria-labelledby="founder-story-title" className={`${sectionClass} tw:rounded-3xl tw:bg-slate-50 tw:p-5 tw:sm:p-8`}>
          <p className="tw:text-sm tw:font-semibold tw:text-rose-700">The MongoSky journey</p>
          <h2 id="founder-story-title" className={`tw:mt-2 ${headingClass}`}>Building MongoSky since 2025</h2>
          <p className={paragraphClass}>
            Development of MongoSky began in 2025. The platform brings together
            profiles, posts, photos, videos, reels and social interactions to
            help people express themselves and connect with others.
          </p>
          <p className={paragraphClass}>
            As Founder, Murad Ahmed leads its product direction and technical
            development. Arafat Hasan Rohan, MongoSky's Co-Founder, contributes
            to platform strategy, website management and community development.
          </p>
          <Link to="/company" className={`tw:mt-3 tw:text-sm ${textLinkClass}`}>Read the Company story <ArrowRight size={17} aria-hidden="true" /></Link>
        </section>

        <section aria-labelledby="founder-role-title" className={sectionClass}>
          <h2 id="founder-role-title" className={headingClass}>His role at MongoSky</h2>
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

        <section aria-labelledby="founder-skills-title" className={sectionClass}>
          <h2 id="founder-skills-title" className={headingClass}>Technical expertise</h2>
          <p className={paragraphClass}>His areas of work cover web applications, backend services, data and system design.</p>
          <div className="tw:mt-5 tw:grid tw:gap-4 tw:sm:grid-cols-2">
            {skillGroups.map(({ icon: Icon, title, skills }) => (
              <article key={title} className={cardClass}>
                <div className="tw:flex tw:items-center tw:gap-3">
                  <Icon size={21} className="tw:shrink-0 tw:text-rose-600" aria-hidden="true" />
                  <h3 className="tw:text-base tw:font-semibold tw:leading-6">{title}</h3>
                </div>
                <ul className="tw:m-0 tw:mt-4 tw:flex tw:list-none tw:flex-wrap tw:gap-2 tw:p-0">
                  {skills.map((skill) => (
                    <li key={skill} className="tw:max-w-full tw:rounded-lg tw:bg-slate-100 tw:px-3 tw:py-2 tw:text-sm tw:leading-5 tw:text-slate-700">{skill}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="founder-vision-title" className={sectionClass}>
          <h2 id="founder-vision-title" className={headingClass}>Vision and approach</h2>
          <p className={paragraphClass}>
            His vision is to develop MongoSky into a trusted social platform
            where people can share ideas, communicate responsibly and build
            meaningful communities. The work is guided by three priorities.
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

        <section aria-labelledby="founder-questions-title" className={sectionClass}>
          <h2 id="founder-questions-title" className={headingClass}>Common questions</h2>
          <div className="tw:mt-5 tw:grid tw:gap-3">
            {questions.map((item) => (
              <article key={item.question} className={cardClass}>
                <h3 className="tw:text-base tw:font-semibold tw:leading-6">{item.question}</h3>
                <p className="tw:mt-2 tw:text-sm tw:leading-7 tw:text-slate-600">{item.answer}</p>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="founder-related-title" className={`${sectionClass} tw:rounded-3xl tw:border tw:border-solid tw:border-rose-100 tw:bg-rose-50 tw:p-5 tw:sm:p-8`}>
          <h2 id="founder-related-title" className={headingClass}>Meet MongoSky's Co-Founder</h2>
          <p className={paragraphClass}>Learn about Arafat Hasan Rohan, also known as A.H. Rohan, and his role in MongoSky's development.</p>
          <Link to="/co-founder" className={`tw:mt-3 tw:text-sm ${textLinkClass}`}>Read Arafat Hasan Rohan's profile <ArrowRight size={17} className="tw:shrink-0" aria-hidden="true" /></Link>
        </section>

        <footer className="tw:mt-10 tw:border-0 tw:border-t tw:border-solid tw:border-slate-200 tw:pt-6">
          <p className="tw:text-lg tw:font-bold">MongoSky</p>
          <p className="tw:mt-2 tw:text-sm tw:leading-6 tw:text-slate-600">People, ideas and the work behind the platform.</p>
          <nav aria-label="Company information" className="tw:mt-3 tw:flex tw:flex-wrap tw:gap-x-5 tw:gap-y-1 tw:text-sm">
            <Link to="/company" className={textLinkClass}>Company</Link>
            <Link to="/co-founder" className={textLinkClass}>Co-Founder</Link>
            <Link to="/about" className={textLinkClass}>About the platform</Link>
            <Link to="/privacy-policy" className={textLinkClass}>Privacy Policy</Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}
