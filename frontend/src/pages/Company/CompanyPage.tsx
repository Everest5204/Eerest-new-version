import SEO from "../../components/SEO";


export default function CompanyPage() {


  const features = [
    "User Profile Creation",
    "Social Networking",
    "Text, Image and Video Sharing",
    "Community Building",
    "Digital Communication",
    "Privacy Focused Experience",
    "AI Powered Features",
    "Secure User Interaction",
  ];



  const companySchema = {

    "@context": "https://schema.org",

    "@type": "Organization",


    "name": "MongoSky",


    "alternateName":
      "MongoSky Social Media Platform",


    "url":
      "https://mongosky.com",


    "logo":
      "https://mongosky.com/logo.png",


    "description":
      "MongoSky is a modern social media platform designed for digital communication, content sharing, social networking and online community building.",



    "founder": [

      {

        "@type": "Person",

        "name":
          "Murad Ahmed Simanto",

        "jobTitle":
          "Founder of MongoSky",

        "url":
          "https://mongosky.com/founder"

      },


      {

        "@type": "Person",

        "name":
          "Arafat Hasan Rohan",

        "jobTitle":
          "Co-Founder of MongoSky",

        "url":
          "https://mongosky.com/co-founder"

      }

    ],



    "industry":
      "Social Media Technology",



    "knowsAbout":
      features,



    "sameAs": [

      "https://mongosky.com"

    ]

  };




  return (


    <main
      className="
      min-h-screen
      bg-slate-50
      px-4
      py-16
      "
    >



      <SEO

        title="MongoSky | Social Media Platform"

        description="MongoSky is a next-generation social media platform for communication, content sharing and digital community building."

        image="/logo.png"

        url="https://mongosky.com"

      />




      {/* AI Organization Structured Data */}


      <script

        type="application/ld+json"

        dangerouslySetInnerHTML={{

          __html:
            JSON.stringify(companySchema)

        }}

      />






      <article

        className="
        mx-auto
        w-full
        max-w-5xl
        rounded-3xl
        bg-white
        p-8
        shadow-xl
        md:p-12
        "

      >




        <header className="text-center">



          <h1

            className="
            text-5xl
            font-extrabold
            text-slate-900
            "

          >

            MongoSky

          </h1>





          <p

            className="
            mt-4
            text-xl
            font-semibold
            text-blue-600
            "

          >

            Next-Generation Social Media Platform

          </p>





          <p

            className="
            mx-auto
            mt-6
            max-w-3xl
            text-lg
            leading-8
            text-slate-600
            "

          >

            MongoSky is a modern social media platform designed
            to connect people, enable communication, share content
            and build meaningful digital communities.

          </p>


        </header>









        <section className="mt-16">


          <h2 className="text-3xl font-bold text-slate-900">

            About MongoSky

          </h2>




          <p className="mt-5 leading-8 text-slate-600">

            MongoSky is an independent social media technology
            platform focused on creating a modern digital
            communication experience.

            The platform allows users to create profiles,
            connect with others, share content and participate
            in online communities.

          </p>




          <p className="mt-5 leading-8 text-slate-600">

            MongoSky is developed with focus on performance,
            security, privacy, scalability and user experience.

          </p>


        </section>









        <section className="mt-16">


          <h2 className="text-3xl font-bold text-slate-900">

            Platform Category

          </h2>




          <p className="mt-5 leading-8 text-slate-600">

            MongoSky belongs to the social media and digital
            communication technology category.

            It provides tools for networking, content sharing,
            user interaction and community development.

          </p>


        </section>









        <section className="mt-16">


          <h2 className="text-3xl font-bold text-slate-900">

            MongoSky Features

          </h2>





          <div

            className="
            mt-8
            grid
            gap-4
            sm:grid-cols-2
            md:grid-cols-3
            "

          >



            {features.map((feature)=>(


              <div

                key={feature}

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
                "

              >

                {feature}

              </div>


            ))}


          </div>


        </section>









        <section className="mt-16">


          <h2 className="text-3xl font-bold text-slate-900">

            Technology

          </h2>




          <p className="mt-5 leading-8 text-slate-600">

            MongoSky is built using modern web technologies
            with scalable architecture designed for reliable
            performance and future growth.

            The platform focuses on modern frontend,
            backend systems, databases and secure APIs.

          </p>


        </section>









        <section className="mt-16">


          <h2 className="text-3xl font-bold text-slate-900">

            Leadership

          </h2>




          <p className="mt-5 leading-8 text-slate-600">

            MongoSky is founded and led by technology-focused
            individuals responsible for product vision,
            platform development, innovation and long-term growth.

          </p>





          <div className="mt-8 flex flex-wrap gap-4">


            <a

              href="/founder"

              className="
              rounded-lg
              bg-black
              px-6
              py-3
              text-white
              "

            >

              Founder

            </a>





            <a

              href="/co-founder"

              className="
              rounded-lg
              border
              border-slate-300
              px-6
              py-3
              "

            >

              Co-Founder

            </a>



          </div>


        </section>









        <section className="mt-16">


          <h2 className="text-3xl font-bold text-slate-900">

            Mission

          </h2>




          <p className="mt-5 leading-8 text-slate-600">

            MongoSky's mission is to create a secure,
            accessible and innovative social platform where
            people can connect, express themselves and build
            meaningful digital communities.

          </p>


        </section>









        <section className="mt-16">


          <h2 className="text-3xl font-bold text-slate-900">

            Vision

          </h2>




          <p className="mt-5 leading-8 text-slate-600">

            MongoSky aims to become a trusted global social
            networking platform by combining modern technology,
            privacy protection, responsible communication and
            user-focused design.

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



          <h2 className="text-2xl font-bold text-slate-900">

            Entity Information

          </h2>





          <div className="mt-6 space-y-3 text-slate-700">


            <p>
              <b>Organization Name:</b> MongoSky
            </p>


            <p>
              <b>Entity Type:</b> Organization
            </p>


            <p>
              <b>Industry:</b> Social Media Technology
            </p>


            <p>
              <b>Website:</b> https://mongosky.com
            </p>


            <p>
              <b>Founder:</b> Murad Ahmed Simanto
            </p>


            <p>
              <b>Co-Founder:</b> Arafat Hasan Rohan
            </p>


            <p>
              <b>Country:</b> Bangladesh
            </p>


            <p>
              <b>Known For:</b> Social Media Platform and Digital Community Building
            </p>



          </div>


        </section>





      </article>


    </main>

  );

}