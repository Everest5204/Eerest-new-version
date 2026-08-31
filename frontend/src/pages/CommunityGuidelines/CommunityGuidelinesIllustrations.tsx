import { memo } from "react";

import type {
  CommunityGuidelineIllustrationKey,
} from "./communityGuidelinesContent";

type CommunityGuidelinesIllustrationProps = {
  type: CommunityGuidelineIllustrationKey;
  className?: string;
};

const RespectAndSafetyIllustration = () => {
  return (
    <svg
      viewBox="0 0 560 360"
      role="img"
      aria-label="People communicating safely around a protective shield"
      focusable="false"
    >
      <defs>
        <linearGradient
          id="respectBackground"
          x1="30"
          y1="24"
          x2="525"
          y2="340"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#EEF4FF" />
          <stop offset="0.52" stopColor="#F5F1FF" />
          <stop offset="1" stopColor="#E8FAFF" />
        </linearGradient>

        <linearGradient
          id="respectShield"
          x1="232"
          y1="74"
          x2="335"
          y2="257"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#6D5DFB" />
          <stop offset="1" stopColor="#4169E1" />
        </linearGradient>

        <linearGradient
          id="respectHeart"
          x1="254"
          y1="142"
          x2="307"
          y2="208"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FF8CAD" />
          <stop offset="1" stopColor="#FF4D7D" />
        </linearGradient>

        <filter
          id="respectShadow"
          x="-30%"
          y="-30%"
          width="160%"
          height="170%"
          colorInterpolationFilters="sRGB"
        >
          <feDropShadow
            dx="0"
            dy="14"
            stdDeviation="16"
            floodColor="#4D59A8"
            floodOpacity="0.18"
          />
        </filter>
      </defs>

      <rect
        x="12"
        y="12"
        width="536"
        height="336"
        rx="36"
        fill="url(#respectBackground)"
      />

      <circle cx="72" cy="68" r="28" fill="#FFFFFF" opacity="0.7" />
      <circle cx="503" cy="295" r="42" fill="#FFFFFF" opacity="0.52" />
      <circle cx="481" cy="61" r="10" fill="#8AD7E8" opacity="0.72" />
      <circle cx="89" cy="290" r="9" fill="#A79AFC" opacity="0.72" />

      <g filter="url(#respectShadow)">
        <rect
          x="185"
          y="54"
          width="190"
          height="252"
          rx="34"
          fill="#FFFFFF"
        />

        <path
          d="M280 80C309 99 335 105 348 108V169C348 219 317 255 280 272C243 255 212 219 212 169V108C225 105 251 99 280 80Z"
          fill="url(#respectShield)"
        />

        <path
          d="M280 210C273 203 247 185 247 161C247 147 257 138 270 138C278 138 285 143 280 148C286 142 292 138 301 138C314 138 323 147 323 161C323 185 297 203 280 210Z"
          fill="url(#respectHeart)"
        />

        <path
          d="M260 169L274 183L303 152"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      <g filter="url(#respectShadow)">
        <rect x="45" y="84" width="125" height="76" rx="22" fill="#FFFFFF" />

        <circle cx="75" cy="116" r="14" fill="#FFB78A" />
        <path
          d="M64 114C64 103 70 97 78 97C87 97 92 103 92 112C87 108 80 106 73 106C70 110 67 112 64 114Z"
          fill="#49366F"
        />
        <rect x="99" y="105" width="45" height="8" rx="4" fill="#7E75D8" />
        <rect x="99" y="122" width="32" height="7" rx="3.5" fill="#D4D1F7" />

        <path
          d="M146 154L156 172L128 157"
          fill="#FFFFFF"
        />
      </g>

      <g filter="url(#respectShadow)">
        <rect x="390" y="185" width="126" height="77" rx="22" fill="#FFFFFF" />

        <circle cx="420" cy="218" r="14" fill="#8AD7E8" />
        <path
          d="M410 216C410 205 416 199 424 199C433 199 438 205 438 214C433 210 426 208 419 208C416 212 413 214 410 216Z"
          fill="#234B6D"
        />
        <rect x="444" y="207" width="45" height="8" rx="4" fill="#4385D7" />
        <rect x="444" y="224" width="32" height="7" rx="3.5" fill="#CFE3F6" />

        <path
          d="M410 256L396 274L425 259"
          fill="#FFFFFF"
        />
      </g>

      <g>
        <circle cx="117" cy="230" r="31" fill="#FFFFFF" />
        <circle cx="117" cy="220" r="13" fill="#F2A879" />
        <path
          d="M91 252C94 236 104 229 117 229C130 229 140 236 143 252"
          fill="#6D5DFB"
        />
        <path
          d="M106 217C106 207 112 201 120 201C129 201 134 207 134 216C129 212 123 210 116 210C113 214 110 216 106 217Z"
          fill="#372B5D"
        />
      </g>

      <g>
        <circle cx="448" cy="117" r="31" fill="#FFFFFF" />
        <circle cx="448" cy="107" r="13" fill="#C98C69" />
        <path
          d="M422 139C425 123 435 116 448 116C461 116 471 123 474 139"
          fill="#35A7A0"
        />
        <path
          d="M437 104C437 94 443 88 451 88C460 88 465 94 465 103C460 99 454 97 447 97C444 101 441 103 437 104Z"
          fill="#253B52"
        />
      </g>
    </svg>
  );
};

const AuthenticityAndTrustIllustration = () => {
  return (
    <svg
      viewBox="0 0 560 360"
      role="img"
      aria-label="Verified profile and connected trust signals"
      focusable="false"
    >
      <defs>
        <linearGradient
          id="trustBackground"
          x1="24"
          y1="20"
          x2="534"
          y2="345"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FFF3E9" />
          <stop offset="0.5" stopColor="#F6F0FF" />
          <stop offset="1" stopColor="#EDF7FF" />
        </linearGradient>

        <linearGradient
          id="trustCard"
          x1="168"
          y1="55"
          x2="397"
          y2="305"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#FAFAFF" />
        </linearGradient>

        <linearGradient
          id="trustVerified"
          x1="336"
          y1="74"
          x2="382"
          y2="124"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#6E62F6" />
          <stop offset="1" stopColor="#3F82E0" />
        </linearGradient>

        <filter
          id="trustShadow"
          x="-30%"
          y="-30%"
          width="160%"
          height="170%"
          colorInterpolationFilters="sRGB"
        >
          <feDropShadow
            dx="0"
            dy="16"
            stdDeviation="18"
            floodColor="#644C8F"
            floodOpacity="0.17"
          />
        </filter>
      </defs>

      <rect
        x="12"
        y="12"
        width="536"
        height="336"
        rx="36"
        fill="url(#trustBackground)"
      />

      <path
        d="M93 193C145 135 194 117 245 123"
        fill="none"
        stroke="#C9C1F3"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="8 11"
      />

      <path
        d="M321 235C385 261 433 249 479 205"
        fill="none"
        stroke="#BFDDF2"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="8 11"
      />

      <g filter="url(#trustShadow)">
        <rect
          x="157"
          y="45"
          width="246"
          height="270"
          rx="34"
          fill="url(#trustCard)"
        />

        <rect
          x="179"
          y="67"
          width="202"
          height="56"
          rx="19"
          fill="#F2F0FF"
        />

        <circle cx="210" cy="95" r="17" fill="#F6B386" />
        <path
          d="M197 93C197 81 204 75 213 75C223 75 229 82 229 92C223 87 216 85 208 85C205 89 201 92 197 93Z"
          fill="#40325E"
        />

        <rect x="241" y="82" width="83" height="9" rx="4.5" fill="#554B86" />
        <rect x="241" y="100" width="58" height="7" rx="3.5" fill="#C6C1E4" />

        <circle cx="357" cy="95" r="24" fill="url(#trustVerified)" />
        <path
          d="M346 95L353 102L368 87"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <rect x="179" y="145" width="202" height="67" rx="20" fill="#F7F8FC" />
        <rect x="198" y="163" width="108" height="9" rx="4.5" fill="#827BA3" />
        <rect x="198" y="181" width="162" height="7" rx="3.5" fill="#D3D1DF" />
        <rect x="198" y="195" width="124" height="7" rx="3.5" fill="#E0DFE8" />

        <rect x="179" y="231" width="96" height="55" rx="18" fill="#EEEAFE" />
        <circle cx="204" cy="258" r="13" fill="#7567EF" />
        <path
          d="M198 258L203 263L211 253"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="226" y="249" width="33" height="7" rx="3.5" fill="#8E84D8" />
        <rect x="226" y="263" width="24" height="6" rx="3" fill="#C8C2EE" />

        <rect x="286" y="231" width="95" height="55" rx="18" fill="#EAF7FB" />
        <circle cx="311" cy="258" r="13" fill="#49A8BC" />
        <path
          d="M305 258L310 263L318 253"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="333" y="249" width="32" height="7" rx="3.5" fill="#6AA9B6" />
        <rect x="333" y="263" width="23" height="6" rx="3" fill="#B9DEE5" />
      </g>

      <g filter="url(#trustShadow)">
        <circle cx="88" cy="206" r="42" fill="#FFFFFF" />
        <circle cx="88" cy="206" r="23" fill="#FFB176" />
        <path
          d="M77 205L85 213L101 195"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      <g filter="url(#trustShadow)">
        <circle cx="480" cy="196" r="42" fill="#FFFFFF" />
        <circle cx="480" cy="196" r="23" fill="#58B6C6" />
        <path
          d="M469 196L477 204L493 186"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      <path
        d="M98 78L103 90L116 95L103 100L98 113L93 100L80 95L93 90L98 78Z"
        fill="#F6AA66"
      />

      <path
        d="M471 74L475 84L486 88L475 92L471 103L467 92L456 88L467 84L471 74Z"
        fill="#887AF5"
      />

      <circle cx="115" cy="285" r="8" fill="#9D8EF8" opacity="0.7" />
      <circle cx="462" cy="286" r="9" fill="#F0A66C" opacity="0.72" />
    </svg>
  );
};

const PrivacyAndReportingIllustration = () => {
  return (
    <svg
      viewBox="0 0 560 360"
      role="img"
      aria-label="Secure privacy controls and a reporting shield"
      focusable="false"
    >
      <defs>
        <linearGradient
          id="privacyBackground"
          x1="22"
          y1="20"
          x2="536"
          y2="344"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#EAFBF5" />
          <stop offset="0.52" stopColor="#EDF7FF" />
          <stop offset="1" stopColor="#F3EFFF" />
        </linearGradient>

        <linearGradient
          id="privacyPhone"
          x1="174"
          y1="53"
          x2="334"
          y2="313"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#283B63" />
          <stop offset="1" stopColor="#182743" />
        </linearGradient>

        <linearGradient
          id="privacyShield"
          x1="352"
          y1="127"
          x2="472"
          y2="273"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#46C4A3" />
          <stop offset="1" stopColor="#278EB2" />
        </linearGradient>

        <filter
          id="privacyShadow"
          x="-30%"
          y="-30%"
          width="170%"
          height="180%"
          colorInterpolationFilters="sRGB"
        >
          <feDropShadow
            dx="0"
            dy="16"
            stdDeviation="18"
            floodColor="#315B6C"
            floodOpacity="0.18"
          />
        </filter>
      </defs>

      <rect
        x="12"
        y="12"
        width="536"
        height="336"
        rx="36"
        fill="url(#privacyBackground)"
      />

      <circle cx="80" cy="78" r="31" fill="#FFFFFF" opacity="0.68" />
      <circle cx="491" cy="288" r="40" fill="#FFFFFF" opacity="0.55" />
      <circle cx="464" cy="64" r="9" fill="#55C5A7" opacity="0.75" />
      <circle cx="92" cy="293" r="10" fill="#7DA7E8" opacity="0.68" />

      <g filter="url(#privacyShadow)">
        <rect
          x="151"
          y="38"
          width="202"
          height="286"
          rx="36"
          fill="url(#privacyPhone)"
        />

        <rect x="166" y="57" width="172" height="237" rx="25" fill="#F9FCFF" />
        <rect x="223" y="47" width="58" height="7" rx="3.5" fill="#637493" />

        <circle cx="252" cy="112" r="34" fill="#E7F6F2" />

        <rect
          x="231"
          y="108"
          width="42"
          height="34"
          rx="10"
          fill="#42B99A"
        />

        <path
          d="M239 109V98C239 90 245 84 252 84C260 84 266 90 266 98V109"
          fill="none"
          stroke="#42B99A"
          strokeWidth="8"
          strokeLinecap="round"
        />

        <circle cx="252" cy="124" r="5" fill="#FFFFFF" />
        <path
          d="M252 128V135"
          stroke="#FFFFFF"
          strokeWidth="4"
          strokeLinecap="round"
        />

        <rect x="190" y="168" width="124" height="13" rx="6.5" fill="#354A70" />
        <rect x="202" y="194" width="100" height="8" rx="4" fill="#BFC9D8" />
        <rect x="214" y="211" width="76" height="8" rx="4" fill="#D5DCE7" />

        <rect x="190" y="245" width="124" height="31" rx="15.5" fill="#E8F6F2" />
        <circle cx="209" cy="260.5" r="8" fill="#43B99A" />
        <path
          d="M205 261L208 264L213 257"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="225" y="256" width="66" height="8" rx="4" fill="#6AAE9D" />

        <circle cx="252" cy="308" r="8" fill="#60708E" />
      </g>

      <g filter="url(#privacyShadow)">
        <path
          d="M415 112C438 127 459 132 470 135V190C470 233 445 264 415 279C385 264 360 233 360 190V135C371 132 392 127 415 112Z"
          fill="url(#privacyShield)"
        />

        <path
          d="M390 185C404 168 426 168 440 185C426 202 404 202 390 185Z"
          fill="#FFFFFF"
          opacity="0.96"
        />
        <circle cx="415" cy="185" r="9" fill="#2F9D9B" />
        <path
          d="M391 210L439 162"
          stroke="#FFFFFF"
          strokeWidth="7"
          strokeLinecap="round"
        />
      </g>

      <g filter="url(#privacyShadow)">
        <rect x="49" y="158" width="113" height="91" rx="24" fill="#FFFFFF" />

        <circle cx="79" cy="190" r="15" fill="#FFB477" />
        <path
          d="M70 191L77 198L89 182"
          fill="none"
          stroke="#FFFFFF"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        <rect x="103" y="182" width="35" height="8" rx="4" fill="#547199" />
        <rect x="103" y="199" width="27" height="7" rx="3.5" fill="#C5CFDC" />

        <rect x="68" y="222" width="75" height="9" rx="4.5" fill="#E5EAF0" />
      </g>

      <path
        d="M112 84C112 70 123 59 137 59"
        fill="none"
        stroke="#67BEAA"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <path
        d="M126 55L139 58L135 71"
        fill="none"
        stroke="#67BEAA"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
};

const CommunityGuidelinesIllustration = ({
  type,
  className = "",
}: CommunityGuidelinesIllustrationProps) => {
  const illustrationClassName = [
    "communityGuidelinesVector",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={illustrationClassName}>
      {type === "respect-and-safety" && (
        <RespectAndSafetyIllustration />
      )}

      {type === "authenticity-and-trust" && (
        <AuthenticityAndTrustIllustration />
      )}

      {type === "privacy-and-reporting" && (
        <PrivacyAndReportingIllustration />
      )}
    </div>
  );
};

export default memo(CommunityGuidelinesIllustration);