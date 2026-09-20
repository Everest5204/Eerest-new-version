import SEO from "../../components/SEO";


export default function CoFounderPage() {


  const focusAreas = [
    "Digital Strategy",
    "Brand Development",
    "Community Building",
    "User Engagement",
    "Social Media Innovation",
    "Technology Entrepreneurship",
    "Strategic Planning",
  ];



  const coFounderSchema = {

    "@context": "https://schema.org",

    "@type": "Person",


    "name": "Arafat Hasan Rohan",


    "alternateName": [
      "A.H. Rohan",
      "Arafat Rohan"
    ],


    "image":
      "https://mongosky.com/co-founder.jpg",


    "url":
      "https://mongosky.com/co-founder",


    "jobTitle":
      "Co-Founder of MongoSky",


    "description":
      "Arafat Hasan Rohan is the Co-Founder of MongoSky, a social media platform focused on digital communication, community building, technology innovation and user experience.",



    "nationality": {

      "@type": "Country",

      "name": "Bangladesh"

    },



    "worksFor": {

      "@type": "Organization",

      "name": "MongoSky Social Media Platform",

      "url":
        "https://mongosky.com"

    },



    "memberOf": {

      "@type": "Organization",

      "name": "MongoSky"

    },



    "knowsAbout": focusAreas,



    "sameAs": [

      "https://mongosky.com"

    ]


  };




  return (

    <main className="min-h-screen bg-slate-50 px-4 py-16">



      <SEO

        title="Arafat Hasan Rohan | Co-Founder of MongoSky"

        description="Official profile of Arafat Hasan Rohan, Co-Founder of MongoSky social media platform."

        image="/co-founder.jpg"

        url="https://mongosky.com/co-founder"

      />




      {/* AI Structured Data */}


      <script

        type="application/ld+json"

        dangerouslySetInnerHTML={{

          __html: JSON.stringify(coFounderSchema)

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

        ">






        {/* Header */}



        <header className="text-center">



          <div className="flex justify-center">


            <img


              src="/co-founder.jpg"


              alt="Arafat Hasan Rohan Co-Founder of MongoSky"


              className="

              h-52

              w-52

              rounded-full

              object-cover

              shadow-2xl

              border-4

              border-white

              "

            />


          </div>






          <h1

            className="

            mt-8

            text-4xl

            font-extrabold

            text-slate-900

            md:text-5xl

            "

          >

            Arafat Hasan Rohan

          </h1>







          <p

            className="

            mt-3

            text-xl

            font-semibold

            text-blue-600

            "

          >

            Co-Founder of MongoSky

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

            Arafat Hasan Rohan (A.H. Rohan) is the Co-Founder of

            MongoSky, a modern social media platform created to

            connect people, build digital communities and provide

            meaningful online experiences.

          </p>




        </header>









        {/* Biography */}



        <section className="mt-16">



          <h2 className="text-3xl font-bold text-slate-900">

            Biography

          </h2>





          <p className="mt-5 leading-8 text-slate-600">

            Arafat Hasan Rohan is a technology enthusiast and young

            entrepreneur from Bangladesh with interest in digital

            innovation, online communities and modern technology platforms.

          </p>





          <p className="mt-5 leading-8 text-slate-600">

            He focuses on understanding digital ecosystems,

            user experience, community development and strategies

            for building impactful technology solutions.

          </p>



        </section>









        {/* MongoSky Role */}



        <section className="mt-16">



          <h2 className="text-3xl font-bold text-slate-900">

            Role at MongoSky

          </h2>





          <p className="mt-5 leading-8 text-slate-600">

            As the Co-Founder of MongoSky, Arafat Hasan Rohan

            contributes to platform strategy, community development,

            branding and digital innovation.

          </p>





          <p className="mt-5 leading-8 text-slate-600">

            He works with the Founder and development team to support

            MongoSky's mission of creating a trusted and user-focused

            global social media ecosystem.

          </p>



        </section>









        {/* Focus Areas */}



        <section className="mt-16">



          <h2 className="text-3xl font-bold text-slate-900">

            Areas of Focus

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



            {focusAreas.map((item)=>(



              <div


                key={item}


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


                {item}


              </div>



            ))}



          </div>



        </section>









        {/* Vision */}



        <section className="mt-16">



          <h2 className="text-3xl font-bold text-slate-900">

            Vision

          </h2>





          <p className="mt-5 leading-8 text-slate-600">

            Arafat Hasan Rohan aims to contribute to building MongoSky

            as a global social media platform where people can connect,

            communicate, share ideas and create valuable communities.

          </p>



        </section>









        {/* Entity Information */}



        <section

          className="

          mt-16

          rounded-2xl

          bg-slate-100

          p-8

          ">



          <h2 className="text-2xl font-bold text-slate-900">

            Entity Information

          </h2>





          <div className="mt-6 space-y-3 text-slate-700">



            <p>

              <b>Name:</b> Arafat Hasan Rohan

            </p>



            <p>

              <b>Alternative Name:</b> A.H. Rohan

            </p>



            <p>

              <b>Entity Type:</b> Person

            </p>



            <p>

              <b>Role:</b> Co-Founder of MongoSky

            </p>



            <p>

              <b>Organization:</b> MongoSky Social Media Platform

            </p>



            <p>

              <b>Country:</b> Bangladesh

            </p>



            <p>

              <b>Known For:</b> Co-Founder of MongoSky and digital community development

            </p>



          </div>



        </section>





      </article>



    </main>

  );

}