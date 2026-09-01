import type {
  AboutIllustrationType,
} from "./aboutContent";

type AboutIllustrationProps = {
  type: AboutIllustrationType;
};

const ConnectAndShareIllustration = () => {
  return (
    <svg
      className="about-vector"
      viewBox="0 0 520 280"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id="about-connect-background"
          x1="67"
          y1="38"
          x2="457"
          y2="244"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#DDF7EF" />
          <stop offset="1" stopColor="#F5FCFA" />
        </linearGradient>

        <linearGradient
          id="about-connect-profile"
          x1="210"
          y1="75"
          x2="310"
          y2="207"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#10A987" />
          <stop offset="1" stopColor="#007A62" />
        </linearGradient>
      </defs>

      <path
        d="M73 88C99 25 178 25 231 51C283 77 326 40 387 52C449 64 476 124 452 180C426 240 361 251 303 235C248 220 208 252 145 234C80 215 46 151 73 88Z"
        fill="url(#about-connect-background)"
      />

      <path
        d="M151 112L218 126"
        stroke="#8ECBBC"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="7 8"
      />

      <path
        d="M301 122L375 99"
        stroke="#8ECBBC"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="7 8"
      />

      <path
        d="M300 165L379 191"
        stroke="#8ECBBC"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="7 8"
      />

      <g>
        <rect
          x="68"
          y="75"
          width="96"
          height="78"
          rx="16"
          fill="#FFFFFF"
          stroke="#111827"
          strokeWidth="3"
        />

        <circle
          cx="92"
          cy="99"
          r="10"
          fill="#00866B"
        />

        <path
          d="M112 95H141"
          stroke="#111827"
          strokeWidth="5"
          strokeLinecap="round"
        />

        <path
          d="M88 124H143"
          stroke="#CAD4DA"
          strokeWidth="4"
          strokeLinecap="round"
        />

        <path
          d="M88 139H128"
          stroke="#CAD4DA"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>

      <g>
        <circle
          cx="260"
          cy="142"
          r="70"
          fill="#FFFFFF"
          stroke="#111827"
          strokeWidth="4"
        />

        <circle
          cx="260"
          cy="122"
          r="28"
          fill="url(#about-connect-profile)"
        />

        <path
          d="M213 193C220 160 238 148 260 148C282 148 300 160 307 193"
          fill="#DDF7EF"
          stroke="#00866B"
          strokeWidth="4"
          strokeLinecap="round"
        />

        <circle
          cx="307"
          cy="92"
          r="20"
          fill="#00866B"
          stroke="#FFFFFF"
          strokeWidth="5"
        />

        <path
          d="M298 92H316"
          stroke="#FFFFFF"
          strokeWidth="4"
          strokeLinecap="round"
        />

        <path
          d="M307 83V101"
          stroke="#FFFFFF"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>

      <g>
        <path
          d="M365 71H439C449 71 457 79 457 89V128C457 138 449 146 439 146H408L389 163V146H365C355 146 347 138 347 128V89C347 79 355 71 365 71Z"
          fill="#FFFFFF"
          stroke="#111827"
          strokeWidth="3"
          strokeLinejoin="round"
        />

        <circle cx="380" cy="109" r="5" fill="#00866B" />
        <circle cx="402" cy="109" r="5" fill="#00866B" />
        <circle cx="424" cy="109" r="5" fill="#00866B" />
      </g>

      <g>
        <circle
          cx="409"
          cy="203"
          r="39"
          fill="#FFFFFF"
          stroke="#111827"
          strokeWidth="3"
        />

        <path
          d="M409 221C390 210 381 200 381 188C381 177 390 170 400 170C405 170 409 173 409 177C413 173 417 170 423 170C433 170 441 177 441 188C441 200 431 210 409 221Z"
          fill="#EF4444"
        />
      </g>
    </svg>
  );
};

const SafeCommunityIllustration = () => {
  return (
    <svg
      className="about-vector"
      viewBox="0 0 520 280"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id="about-safety-background"
          x1="61"
          y1="39"
          x2="457"
          y2="241"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#F0F9F7" />
          <stop offset="1" stopColor="#DDF7EF" />
        </linearGradient>

        <linearGradient
          id="about-safety-shield"
          x1="211"
          y1="44"
          x2="310"
          y2="220"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#12AE8B" />
          <stop offset="1" stopColor="#00755E" />
        </linearGradient>
      </defs>

      <path
        d="M72 89C103 29 176 24 230 49C287 75 329 38 391 54C451 70 476 127 449 184C421 241 357 251 298 235C242 220 201 250 143 233C79 214 41 149 72 89Z"
        fill="url(#about-safety-background)"
      />

      <circle
        cx="91"
        cy="76"
        r="9"
        fill="#00866B"
        opacity="0.2"
      />

      <circle
        cx="433"
        cy="207"
        r="12"
        fill="#00866B"
        opacity="0.14"
      />

      <g>
        <circle
          cx="120"
          cy="125"
          r="30"
          fill="#FFFFFF"
          stroke="#111827"
          strokeWidth="3"
        />

        <circle cx="120" cy="116" r="10" fill="#00866B" />

        <path
          d="M101 144C105 130 112 126 120 126C128 126 135 130 139 144"
          fill="#DDF7EF"
          stroke="#00866B"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>

      <g>
        <circle
          cx="400"
          cy="125"
          r="30"
          fill="#FFFFFF"
          stroke="#111827"
          strokeWidth="3"
        />

        <circle cx="400" cy="116" r="10" fill="#00866B" />

        <path
          d="M381 144C385 130 392 126 400 126C408 126 415 130 419 144"
          fill="#DDF7EF"
          stroke="#00866B"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>

      <path
        d="M151 125H196"
        stroke="#8ECBBC"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="7 8"
      />

      <path
        d="M324 125H369"
        stroke="#8ECBBC"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="7 8"
      />

      <g>
        <path
          d="M260 45L326 70V123C326 168 299 207 260 224C221 207 194 168 194 123V70L260 45Z"
          fill="url(#about-safety-shield)"
          stroke="#006A55"
          strokeWidth="4"
          strokeLinejoin="round"
        />

        <circle
          cx="260"
          cy="126"
          r="45"
          fill="#FFFFFF"
          opacity="0.16"
        />

        <path
          d="M233 126L251 144L289 105"
          stroke="#FFFFFF"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      <path
        d="M102 192C132 221 173 230 209 215"
        stroke="#111827"
        strokeWidth="4"
        strokeLinecap="round"
      />

      <path
        d="M311 215C347 230 388 221 418 192"
        stroke="#111827"
        strokeWidth="4"
        strokeLinecap="round"
      />

      <path
        d="M102 192L104 207"
        stroke="#111827"
        strokeWidth="4"
        strokeLinecap="round"
      />

      <path
        d="M418 192L416 207"
        stroke="#111827"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
};

const FutureGrowthIllustration = () => {
  return (
    <svg
      className="about-vector"
      viewBox="0 0 520 280"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id="about-growth-background"
          x1="64"
          y1="38"
          x2="456"
          y2="246"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#DDF7EF" />
          <stop offset="1" stopColor="#F7FCFB" />
        </linearGradient>

        <linearGradient
          id="about-growth-screen"
          x1="148"
          y1="68"
          x2="270"
          y2="224"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#12AE8B" />
          <stop offset="1" stopColor="#00755E" />
        </linearGradient>
      </defs>

      <path
        d="M69 93C94 34 165 20 222 47C278 73 322 41 382 51C445 62 478 119 456 177C434 237 371 256 310 237C253 219 209 252 147 235C82 217 43 154 69 93Z"
        fill="url(#about-growth-background)"
      />

      <g>
        <rect
          x="118"
          y="51"
          width="154"
          height="190"
          rx="27"
          fill="#FFFFFF"
          stroke="#111827"
          strokeWidth="4"
        />

        <rect
          x="134"
          y="73"
          width="122"
          height="143"
          rx="15"
          fill="url(#about-growth-screen)"
        />

        <path
          d="M173 62H217"
          stroke="#111827"
          strokeWidth="5"
          strokeLinecap="round"
        />

        <circle
          cx="195"
          cy="228"
          r="6"
          fill="#111827"
        />

        <circle
          cx="195"
          cy="122"
          r="25"
          fill="#FFFFFF"
          opacity="0.95"
        />

        <path
          d="M155 180C161 151 174 143 195 143C216 143 229 151 235 180"
          fill="#DDF7EF"
          stroke="#FFFFFF"
          strokeWidth="4"
          strokeLinecap="round"
        />
      </g>

      <path
        d="M282 199C314 196 329 176 338 150C348 119 366 95 409 85"
        stroke="#00866B"
        strokeWidth="7"
        strokeLinecap="round"
      />

      <path
        d="M390 73L419 82L402 107"
        stroke="#00866B"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <g>
        <rect
          x="300"
          y="178"
          width="35"
          height="42"
          rx="8"
          fill="#FFFFFF"
          stroke="#111827"
          strokeWidth="3"
        />

        <rect
          x="347"
          y="155"
          width="35"
          height="65"
          rx="8"
          fill="#FFFFFF"
          stroke="#111827"
          strokeWidth="3"
        />

        <rect
          x="394"
          y="128"
          width="35"
          height="92"
          rx="8"
          fill="#FFFFFF"
          stroke="#111827"
          strokeWidth="3"
        />

        <rect
          x="309"
          y="192"
          width="17"
          height="19"
          rx="4"
          fill="#A9DED2"
        />

        <rect
          x="356"
          y="169"
          width="17"
          height="42"
          rx="4"
          fill="#54BDA6"
        />

        <rect
          x="403"
          y="142"
          width="17"
          height="69"
          rx="4"
          fill="#00866B"
        />
      </g>

      <circle
        cx="417"
        cy="68"
        r="9"
        fill="#10A987"
        opacity="0.25"
      />

      <circle
        cx="91"
        cy="199"
        r="12"
        fill="#007A62"
        opacity="0.13"
      />
    </svg>
  );
};

const AboutIllustration = ({
  type,
}: AboutIllustrationProps) => {
  if (type === "connect-and-share") {
    return <ConnectAndShareIllustration />;
  }

  if (type === "safe-community") {
    return <SafeCommunityIllustration />;
  }

  return <FutureGrowthIllustration />;
};

export default AboutIllustration;