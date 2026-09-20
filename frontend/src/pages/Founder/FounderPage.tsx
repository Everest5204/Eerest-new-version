import SEO from "../../components/SEO";

export default function FounderPage() {

  const skills = [
    "Full Stack Web Development",
    "React.js",
    "Next.js",
    "Node.js",
    "Go Programming",
    "Python Development",
    "MongoDB",
    "PostgreSQL",
    "MySQL",
    "Firebase",
    "Supabase",
    "REST API Development",
    "Git & GitHub",
    "Backend Architecture",
    "Database Engineering",
    "System Design",
  ];


  const founderSchema = {
    "@context": "https://schema.org",
    "@type": "Person",

    "name": "Murad Ahmed Simanto",

    "alternateName": [
      "Murad Simanto",
      "Murad Ahmed"
    ],

    "image":
      "https://mongosky.com/founder.jpg",

    "url":
      "https://mongosky.com/founder",

    "jobTitle":
      "Founder of MongoSky and Full Stack Developer",

    "description":
      "Murad Ahmed Simanto is the Founder of MongoSky, a social media platform, and a Full Stack Developer specializing in frontend development, backend systems, database engineering, scalable web applications and technology products.",


    "nationality": {
      "@type": "Country",
      "name": "Bangladesh"
    },


    "founder": {
      "@type": "Organization",
      "name": "MongoSky",
      "url":
        "https://mongosky.com"
    },


    "worksFor": {
      "@type": "Organization",
      "name": "MongoSky Social Media Platform",
      "url":
        "https://mongosky.com"
    },


    "knowsAbout": skills,


    "sameAs": [
      "https://mongosky.com"
    ]
  };


  return (

    <main
      className="
      min-h-screen
      w-full
      bg-slate-50
      px-4
      py-12
      md:px-8
      "
    >


      <SEO
        title="Murad Ahmed Simanto | Founder of MongoSky"
        description="Official profile of Murad Ahmed Simanto, Founder of MongoSky and Full Stack Developer."
        image="/founder.jpg"
        url="https://mongosky.com/founder"
      />


      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(founderSchema)
        }}
      />



      <article
        className="
        mx-auto
        w-full
        max-w-6xl
        rounded-3xl
        bg-white
        p-6
        shadow-xl
        md:p-12
        "
      >



        <header
          className="
          flex
          flex-col
          items-center
          text-center
          "
        >


          <img
            src="/founder.jpg"
            alt="Murad Ahmed Simanto Founder of MongoSky"
            className="
            mx-auto
            h-52
            w-52
            rounded-full
            object-cover
            shadow-2xl
            border-4
            border-white
            "
          />



          <h1
            className="
            mt-8
            text-4xl
            font-extrabold
            text-slate-900
            md:text-5xl
            "
          >
            Murad Ahmed Simanto
          </h1>



          <p
            className="
            mt-3
            text-xl
            font-bold
            text-blue-600
            "
          >
            Founder of MongoSky | Full Stack Developer
          </p>



          <p
            className="
            mt-6
            max-w-4xl
            text-lg
            leading-8
            text-slate-600
            "
          >
            Murad Ahmed Simanto is the Founder of MongoSky,
            a modern social media platform focused on digital
            communication, content sharing and community building.
            He is a Full Stack Developer from Bangladesh who
            designs and develops scalable software solutions,
            backend systems and technology products.
          </p>


        </header>




        <section className="mt-16">

          <h2 className="text-3xl font-bold text-slate-900">
            Biography
          </h2>


          <p className="mt-5 leading-8 text-slate-600">
            Murad Ahmed Simanto is a technology entrepreneur
            and software developer from Bangladesh.
            His work focuses on building modern digital
            platforms with emphasis on scalability,
            performance and user experience.
          </p>

        </section>





        <section className="mt-16">

          <h2 className="text-3xl font-bold text-slate-900">
            Founder of MongoSky
          </h2>


          <p className="mt-5 leading-8 text-slate-600">
            MongoSky is a social media platform founded by
            Murad Ahmed Simanto. The platform is designed
            to help users connect, communicate, share content
            and build digital communities.
          </p>



          <p className="mt-5 leading-8 text-slate-600">

            As Founder, Murad Ahmed Simanto leads MongoSky's
            product direction, technical architecture,
            frontend development, backend engineering,
            database systems and continuous improvement.

          </p>


        </section>





        <section className="mt-16">


          <h2 className="text-3xl font-bold text-slate-900">
            Technical Expertise
          </h2>



          <div
            className="
            mt-8
            grid
            gap-4
            sm:grid-cols-2
            lg:grid-cols-3
            "
          >

            {
              skills.map(skill => (

                <div
                  key={skill}
                  className="
                  rounded-xl
                  border
                  border-slate-200
                  bg-slate-50
                  px-5
                  py-4
                  text-center
                  font-medium
                  text-slate-700
                  shadow-sm
                  "
                >

                  {skill}

                </div>

              ))
            }


          </div>


        </section>





        <section className="mt-16">


          <h2 className="text-3xl font-bold text-slate-900">
            Vision & Mission
          </h2>


          <p className="mt-5 leading-8 text-slate-600">

            Murad Ahmed Simanto's vision is to develop MongoSky
            into a trusted global social media platform by
            combining technology innovation, privacy,
            community and user-focused digital experiences.

          </p>


        </section>





        <section
          className="
          mt-16
          rounded-2xl
          bg-slate-100
          p-8
          "
        >


          <h2
            className="
            text-2xl
            font-bold
            text-slate-900
            "
          >
            Entity Information
          </h2>



          <div
            className="
            mt-6
            space-y-3
            text-slate-700
            "
          >

            <p>
              <b>Name:</b> Murad Ahmed Simanto
            </p>


            <p>
              <b>Entity Type:</b> Person
            </p>


            <p>
              <b>Role:</b> Founder of MongoSky
            </p>


            <p>
              <b>Organization:</b> MongoSky Social Media Platform
            </p>


            <p>
              <b>Profession:</b> Full Stack Developer
            </p>


            <p>
              <b>Country:</b> Bangladesh
            </p>


            <p>
              <b>Known For:</b> Founder and creator of MongoSky social media platform
            </p>


          </div>


        </section>



      </article>


    </main>

  );

}