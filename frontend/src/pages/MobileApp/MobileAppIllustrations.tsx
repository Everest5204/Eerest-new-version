import {
  memo,
} from "react";

import type {
  MobileAppIllustrationKey,
} from "./mobileAppContent";

type MobileAppIllustrationProps = {
  type: MobileAppIllustrationKey;
  className?: string;
};

const DevelopmentIllustration = () => {
  return (
    <svg
      viewBox="0 0 680 460"
      role="img"
      aria-label="Developer team building the Mongosky mobile application"
      focusable="false"
    >
      <defs>
        <linearGradient
          id="developmentPhone"
          x1="246"
          y1="43"
          x2="440"
          y2="406"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#20384C" />
          <stop offset="1" stopColor="#101F2C" />
        </linearGradient>

        <linearGradient
          id="developmentScreen"
          x1="266"
          y1="69"
          x2="418"
          y2="373"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#F7FFFC" />
          <stop offset="0.55" stopColor="#EAF8F4" />
          <stop offset="1" stopColor="#E9F1FF" />
        </linearGradient>

        <linearGradient
          id="developmentAccent"
          x1="278"
          y1="121"
          x2="403"
          y2="248"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#00A483" />
          <stop offset="1" stopColor="#5678E8" />
        </linearGradient>

        <filter
          id="developmentShadow"
          x="-30%"
          y="-30%"
          width="170%"
          height="180%"
          colorInterpolationFilters="sRGB"
        >
          <feDropShadow
            dx="0"
            dy="20"
            stdDeviation="20"
            floodColor="#15394A"
            floodOpacity="0.2"
          />
        </filter>
      </defs>

      <ellipse
        cx="341"
        cy="403"
        rx="260"
        ry="30"
        fill="#DCEAE6"
        opacity="0.7"
      />

      <circle
        cx="338"
        cy="218"
        r="191"
        fill="#EAF8F4"
      />

      <circle
        cx="338"
        cy="218"
        r="153"
        fill="#F5FBF9"
      />

      <path
        d="M102 102C145 46 208 34 257 69"
        fill="none"
        stroke="#88CCBB"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray="3 16"
      />

      <path
        d="M461 64C529 67 576 111 585 166"
        fill="none"
        stroke="#93A9EF"
        strokeWidth="5"
        strokeLinecap="round"
        strokeDasharray="3 16"
      />

      <g filter="url(#developmentShadow)">
        <rect
          x="240"
          y="35"
          width="201"
          height="375"
          rx="40"
          fill="url(#developmentPhone)"
        />

        <rect
          x="255"
          y="55"
          width="171"
          height="328"
          rx="27"
          fill="url(#developmentScreen)"
        />

        <rect
          x="303"
          y="44"
          width="75"
          height="10"
          rx="5"
          fill="#546A78"
        />

        <circle
          cx="340.5"
          cy="396"
          r="7"
          fill="#566B79"
        />

        <circle
          cx="340"
          cy="154"
          r="62"
          fill="url(#developmentAccent)"
        />

        <path
          d="M316 133L292 154L316 175"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <path
          d="M365 133L389 154L365 175"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="9"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <path
          d="M352 118L329 190"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="8"
          strokeLinecap="round"
        />

        <rect
          x="281"
          y="242"
          width="119"
          height="12"
          rx="6"
          fill="#CAD8D5"
        />

        <rect
          x="281"
          y="242"
          width="82"
          height="12"
          rx="6"
          fill="#00A483"
        />

        <rect
          x="281"
          y="273"
          width="81"
          height="8"
          rx="4"
          fill="#637587"
        />

        <rect
          x="281"
          y="293"
          width="119"
          height="7"
          rx="3.5"
          fill="#CBD5DF"
        />

        <rect
          x="281"
          y="310"
          width="100"
          height="7"
          rx="3.5"
          fill="#D8E0E7"
        />

        <rect
          x="281"
          y="327"
          width="112"
          height="7"
          rx="3.5"
          fill="#CBD5DF"
        />

        <circle
          cx="292"
          cy="354"
          r="8"
          fill="#00A483"
        />

        <path
          d="M288 354L291 357L297 350"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <rect
          x="308"
          y="350"
          width="66"
          height="8"
          rx="4"
          fill="#8B9AA7"
        />
      </g>

      <g>
        <circle
          cx="142"
          cy="243"
          r="37"
          fill="#E8A67C"
        />

        <path
          d="M111 240C111 213 125 198 147 198C172 198 183 215 180 239C167 228 149 222 128 224C125 231 119 237 111 240Z"
          fill="#22394C"
        />

        <path
          d="M81 403C84 330 102 282 142 282C183 282 205 331 209 403"
          fill="#5475E1"
        />

        <path
          d="M174 309C204 318 224 335 250 356"
          fill="none"
          stroke="#E8A67C"
          strokeWidth="17"
          strokeLinecap="round"
        />

        <path
          d="M239 350L260 369"
          fill="none"
          stroke="#E8A67C"
          strokeWidth="15"
          strokeLinecap="round"
        />

        <rect
          x="58"
          y="383"
          width="170"
          height="20"
          rx="10"
          fill="#284559"
        />
      </g>

      <g>
        <circle
          cx="537"
          cy="248"
          r="36"
          fill="#BD8062"
        />

        <path
          d="M505 245C505 216 522 201 543 201C564 201 577 217 575 242C563 233 548 227 530 229C524 237 516 242 505 245Z"
          fill="#182E3E"
        />

        <path
          d="M470 403C475 330 496 287 537 287C577 287 597 332 602 403"
          fill="#00866B"
        />

        <path
          d="M504 316C480 327 464 345 437 365"
          fill="none"
          stroke="#BD8062"
          strokeWidth="17"
          strokeLinecap="round"
        />

        <path
          d="M447 357L427 374"
          fill="none"
          stroke="#BD8062"
          strokeWidth="15"
          strokeLinecap="round"
        />

        <rect
          x="455"
          y="383"
          width="170"
          height="20"
          rx="10"
          fill="#284559"
        />
      </g>

      <circle
        cx="92"
        cy="163"
        r="12"
        fill="#00A483"
        opacity="0.72"
      />

      <circle
        cx="601"
        cy="212"
        r="10"
        fill="#6685EB"
        opacity="0.72"
      />

      <path
        d="M118 71L124 86L140 92L124 98L118 114L112 98L96 92L112 86L118 71Z"
        fill="#60C3AA"
      />

      <path
        d="M565 87L570 99L583 104L570 109L565 122L560 109L547 104L560 99L565 87Z"
        fill="#7E91E8"
      />
    </svg>
  );
};

const AndroidIllustration = () => {
  return (
    <svg
      viewBox="0 0 680 460"
      role="img"
      aria-label="Android version of the Mongosky mobile application"
      focusable="false"
    >
      <defs>
        <linearGradient
          id="androidBackground"
          x1="105"
          y1="35"
          x2="570"
          y2="425"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#E8FAF3" />
          <stop offset="1" stopColor="#DDF4EA" />
        </linearGradient>

        <linearGradient
          id="androidPhone"
          x1="218"
          y1="28"
          x2="470"
          y2="435"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#213C38" />
          <stop offset="1" stopColor="#102724" />
        </linearGradient>

        <linearGradient
          id="androidScreen"
          x1="237"
          y1="52"
          x2="450"
          y2="412"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#F8FFFC" />
          <stop offset="1" stopColor="#E3F8EF" />
        </linearGradient>

        <linearGradient
          id="androidRobot"
          x1="275"
          y1="143"
          x2="409"
          y2="291"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#38C99A" />
          <stop offset="1" stopColor="#00866B" />
        </linearGradient>

        <filter
          id="androidShadow"
          x="-30%"
          y="-30%"
          width="170%"
          height="180%"
          colorInterpolationFilters="sRGB"
        >
          <feDropShadow
            dx="0"
            dy="22"
            stdDeviation="21"
            floodColor="#164D3F"
            floodOpacity="0.21"
          />
        </filter>
      </defs>

      <ellipse
        cx="340"
        cy="405"
        rx="250"
        ry="32"
        fill="#CFE6DD"
      />

      <path
        d="M117 86C166 23 258 7 332 39C397 2 499 28 551 104C603 181 585 299 508 362C430 427 285 424 184 370C76 312 45 178 117 86Z"
        fill="url(#androidBackground)"
      />

      <circle
        cx="114"
        cy="238"
        r="52"
        fill="#FFFFFF"
        opacity="0.62"
      />

      <circle
        cx="565"
        cy="160"
        r="42"
        fill="#FFFFFF"
        opacity="0.58"
      />

      <g filter="url(#androidShadow)">
        <rect
          x="210"
          y="22"
          width="260"
          height="414"
          rx="48"
          fill="url(#androidPhone)"
        />

        <rect
          x="226"
          y="43"
          width="228"
          height="372"
          rx="34"
          fill="url(#androidScreen)"
        />

        <circle
          cx="340"
          cy="33"
          r="6"
          fill="#647A75"
        />

        <circle
          cx="340"
          cy="394"
          r="10"
          fill="#C9E5DB"
        />

        <circle
          cx="340"
          cy="212"
          r="112"
          fill="#D7F3E9"
        />

        <path
          d="M289 156L273 131"
          stroke="#00866B"
          strokeWidth="8"
          strokeLinecap="round"
        />

        <path
          d="M391 156L407 131"
          stroke="#00866B"
          strokeWidth="8"
          strokeLinecap="round"
        />

        <circle
          cx="270"
          cy="128"
          r="7"
          fill="#00866B"
        />

        <circle
          cx="410"
          cy="128"
          r="7"
          fill="#00866B"
        />

        <path
          d="M273 190C276 153 303 132 340 132C377 132 404 153 407 190Z"
          fill="url(#androidRobot)"
        />

        <rect
          x="273"
          y="199"
          width="134"
          height="101"
          rx="19"
          fill="url(#androidRobot)"
        />

        <rect
          x="247"
          y="208"
          width="18"
          height="72"
          rx="9"
          fill="#20AC82"
        />

        <rect
          x="415"
          y="208"
          width="18"
          height="72"
          rx="9"
          fill="#20AC82"
        />

        <rect
          x="292"
          y="290"
          width="22"
          height="58"
          rx="11"
          fill="#00866B"
        />

        <rect
          x="366"
          y="290"
          width="22"
          height="58"
          rx="11"
          fill="#00866B"
        />

        <circle
          cx="312"
          cy="166"
          r="7"
          fill="#FFFFFF"
        />

        <circle
          cx="368"
          cy="166"
          r="7"
          fill="#FFFFFF"
        />

        <path
          d="M319 241L334 256L365 225"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="11"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <rect
          x="273"
          y="368"
          width="134"
          height="11"
          rx="5.5"
          fill="#BCD9CF"
        />

        <rect
          x="273"
          y="368"
          width="92"
          height="11"
          rx="5.5"
          fill="#00A483"
        />
      </g>

      <path
        d="M146 165C117 197 112 240 128 272"
        fill="none"
        stroke="#62C8A8"
        strokeWidth="7"
        strokeLinecap="round"
      />

      <path
        d="M130 155L147 164L138 181"
        fill="none"
        stroke="#62C8A8"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <path
        d="M535 222C557 252 558 286 543 312"
        fill="none"
        stroke="#5DB899"
        strokeWidth="7"
        strokeLinecap="round"
      />

      <path
        d="M540 324L542 306L560 308"
        fill="none"
        stroke="#5DB899"
        strokeWidth="7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      <circle
        cx="111"
        cy="119"
        r="10"
        fill="#3EC69A"
      />

      <circle
        cx="571"
        cy="341"
        r="12"
        fill="#00A483"
        opacity="0.7"
      />
    </svg>
  );
};

const IOSIllustration = () => {
  return (
    <svg
      viewBox="0 0 680 460"
      role="img"
      aria-label="iOS version of the Mongosky mobile application"
      focusable="false"
    >
      <defs>
        <linearGradient
          id="iosBackground"
          x1="93"
          y1="30"
          x2="583"
          y2="427"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#EEF1FF" />
          <stop offset="0.52" stopColor="#F4EEFF" />
          <stop offset="1" stopColor="#EAF7FF" />
        </linearGradient>

        <linearGradient
          id="iosPhone"
          x1="210"
          y1="21"
          x2="471"
          y2="440"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#2B3448" />
          <stop offset="1" stopColor="#111827" />
        </linearGradient>

        <linearGradient
          id="iosScreen"
          x1="230"
          y1="43"
          x2="450"
          y2="418"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#F8F9FF" />
          <stop offset="0.5" stopColor="#EDEBFF" />
          <stop offset="1" stopColor="#DDF4FF" />
        </linearGradient>

        <linearGradient
          id="iosOrb"
          x1="271"
          y1="134"
          x2="418"
          y2="290"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#7067F0" />
          <stop offset="0.52" stopColor="#517AE9" />
          <stop offset="1" stopColor="#2EA8B2" />
        </linearGradient>

        <filter
          id="iosShadow"
          x="-30%"
          y="-30%"
          width="170%"
          height="180%"
          colorInterpolationFilters="sRGB"
        >
          <feDropShadow
            dx="0"
            dy="22"
            stdDeviation="21"
            floodColor="#303A74"
            floodOpacity="0.2"
          />
        </filter>

        <filter
          id="iosOrbShadow"
          x="-40%"
          y="-40%"
          width="180%"
          height="180%"
          colorInterpolationFilters="sRGB"
        >
          <feDropShadow
            dx="0"
            dy="14"
            stdDeviation="14"
            floodColor="#4C59BF"
            floodOpacity="0.25"
          />
        </filter>
      </defs>

      <ellipse
        cx="340"
        cy="405"
        rx="250"
        ry="32"
        fill="#DCE1F1"
      />

      <path
        d="M101 111C145 34 247 5 330 41C406 3 514 31 567 115C616 194 590 309 506 370C418 433 275 425 174 367C73 309 48 202 101 111Z"
        fill="url(#iosBackground)"
      />

      <circle
        cx="117"
        cy="176"
        r="43"
        fill="#FFFFFF"
        opacity="0.58"
      />

      <circle
        cx="565"
        cy="283"
        r="49"
        fill="#FFFFFF"
        opacity="0.55"
      />

      <g filter="url(#iosShadow)">
        <rect
          x="207"
          y="18"
          width="266"
          height="421"
          rx="53"
          fill="url(#iosPhone)"
        />

        <rect
          x="222"
          y="36"
          width="236"
          height="385"
          rx="39"
          fill="url(#iosScreen)"
        />

        <rect
          x="302"
          y="45"
          width="76"
          height="24"
          rx="12"
          fill="#141C2B"
        />

        <circle
          cx="365"
          cy="57"
          r="4"
          fill="#394358"
        />

        <g filter="url(#iosOrbShadow)">
          <circle
            cx="340"
            cy="218"
            r="93"
            fill="url(#iosOrb)"
          />

          <circle
            cx="340"
            cy="218"
            r="67"
            fill="none"
            stroke="rgba(255, 255, 255, 0.3)"
            strokeWidth="2"
          />

          <circle
            cx="340"
            cy="185"
            r="23"
            fill="#FFFFFF"
          />

          <path
            d="M294 269C299 233 316 217 340 217C364 217 381 233 386 269"
            fill="#FFFFFF"
          />

          <circle
            cx="294"
            cy="180"
            r="13"
            fill="#B5DFF2"
          />

          <circle
            cx="390"
            cy="178"
            r="13"
            fill="#C8C2FA"
          />

          <circle
            cx="402"
            cy="247"
            r="11"
            fill="#B7EFE5"
          />

          <circle
            cx="280"
            cy="250"
            r="11"
            fill="#D9D4FF"
          />

          <path
            d="M303 186L318 194"
            stroke="#FFFFFF"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.7"
          />

          <path
            d="M377 188L362 195"
            stroke="#FFFFFF"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.7"
          />

          <path
            d="M392 242L374 236"
            stroke="#FFFFFF"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.7"
          />

          <path
            d="M290 242L307 235"
            stroke="#FFFFFF"
            strokeWidth="4"
            strokeLinecap="round"
            opacity="0.7"
          />
        </g>

        <rect
          x="270"
          y="337"
          width="140"
          height="12"
          rx="6"
          fill="#C8C9E8"
        />

        <rect
          x="270"
          y="337"
          width="86"
          height="12"
          rx="6"
          fill="#625CE5"
        />

        <rect
          x="292"
          y="369"
          width="96"
          height="8"
          rx="4"
          fill="#9A9DB9"
        />

        <rect
          x="306"
          y="398"
          width="68"
          height="5"
          rx="2.5"
          fill="#8B91A4"
        />
      </g>

      <rect
        x="196"
        y="103"
        width="7"
        height="52"
        rx="3.5"
        fill="#667086"
      />

      <rect
        x="477"
        y="130"
        width="7"
        height="72"
        rx="3.5"
        fill="#667086"
      />

      <path
        d="M130 103L136 118L152 124L136 130L130 146L124 130L108 124L124 118L130 103Z"
        fill="#8178EC"
      />

      <path
        d="M550 113L555 126L569 131L555 136L550 150L545 136L531 131L545 126L550 113Z"
        fill="#54AEC2"
      />

      <circle
        cx="115"
        cy="310"
        r="11"
        fill="#6A79E7"
        opacity="0.7"
      />

      <circle
        cx="570"
        cy="342"
        r="10"
        fill="#50A9BE"
        opacity="0.72"
      />
    </svg>
  );
};

const MobileAppIllustration = ({
  type,
  className = "",
}: MobileAppIllustrationProps) => {
  const illustrationClassName = [
    "mobileAppVector",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={illustrationClassName}
      data-illustration={type}
    >
      {type === "development" && (
        <DevelopmentIllustration />
      )}

      {type === "android" && (
        <AndroidIllustration />
      )}

      {type === "ios" && (
        <IOSIllustration />
      )}
    </div>
  );
};

export default memo(MobileAppIllustration);