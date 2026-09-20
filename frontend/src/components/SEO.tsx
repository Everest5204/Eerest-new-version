import { useEffect } from "react";


interface SEOProps {

  title: string;

  description: string;

  image?: string;

  url?: string;

}



export default function SEO({

  title,

  description,

  image = "/mongosky-ai.png",

  url = "https://mongosky.com",

}: SEOProps) {



  useEffect(() => {



    document.title = title;



    const setMeta = (

      attribute: "name" | "property",

      key: string,

      content: string

    ) => {



      let tag = document.querySelector(

        `meta[${attribute}="${key}"]`

      );



      if (!tag) {


        tag = document.createElement("meta");


        tag.setAttribute(

          attribute,

          key

        );


        document.head.appendChild(tag);


      }



      tag.setAttribute(

        "content",

        content

      );


    };





    const setLink = (

      rel: string,

      href: string

    ) => {



      let link = document.querySelector(

        `link[rel="${rel}"]`

      );



      if (!link) {


        link = document.createElement("link");


        link.setAttribute(

          "rel",

          rel

        );


        document.head.appendChild(link);


      }



      link.setAttribute(

        "href",

        href

      );


    };







    // Basic SEO


    setMeta(

      "name",

      "description",

      description

    );



    setMeta(

      "name",

      "robots",

      "index, follow"

    );





    // Open Graph SEO



    setMeta(

      "property",

      "og:title",

      title

    );



    setMeta(

      "property",

      "og:description",

      description

    );



    setMeta(

      "property",

      "og:type",

      "website"

    );



    setMeta(

      "property",

      "og:url",

      url

    );



    setMeta(

      "property",

      "og:image",

      image

    );



    setMeta(

      "property",

      "og:site_name",

      "MongoSky"

    );







    // Twitter SEO



    setMeta(

      "name",

      "twitter:card",

      "summary_large_image"

    );



    setMeta(

      "name",

      "twitter:title",

      title

    );



    setMeta(

      "name",

      "twitter:description",

      description

    );



    setMeta(

      "name",

      "twitter:image",

      image

    );







    // Canonical URL



    setLink(

      "canonical",

      url

    );





  }, [

    title,

    description,

    image,

    url

  ]);





  return null;


}