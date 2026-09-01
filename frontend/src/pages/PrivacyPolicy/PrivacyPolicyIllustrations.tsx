import type {
  PrivacyPolicyIllustrationType,
} from "./privacyPolicyContent";

type PrivacyPolicyIllustrationProps = {
  type: PrivacyPolicyIllustrationType;
};

const DataProtectionIllustration = () => {
  return (
    <svg
      className="privacy-policy-vector"
      viewBox="0 0 520 280"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id="privacy-data-shield"
          x1="205"
          y1="52"
          x2="316"
          y2="214"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#10A987" />
          <stop offset="1" stopColor="#007A62" />
        </linearGradient>

        <linearGradient
          id="privacy-data-glow"
          x1="78"
          y1="34"
          x2="438"
          y2="246"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#DDF7EF" />
          <stop offset="1" stopColor="#F2FBF8" />
        </linearGradient>
      </defs>

      <path
        d="M82 63C126 16 196 28 240 49C296 76 336 37 391 54C450 72 472 132 442 185C411 240 351 257 292 240C234 223 205 256 144 236C80 214 38 110 82 63Z"
        fill="url(#privacy-data-glow)"
      />

      <circle
        cx="104"
        cy="73"
        r="8"
        fill="#10A987"
        opacity="0.25"
      />

      <circle
        cx="419"
        cy="197"
        r="11"
        fill="#007A62"
        opacity="0.16"
      />

      <path
        d="M157 143H202"
        stroke="#9CCFC3"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="7 8"
      />

      <path
        d="M319 142H367"
        stroke="#9CCFC3"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="7 8"
      />

      <g>
        <ellipse
          cx="126"
          cy="112"
          rx="49"
          ry="18"
          fill="#FFFFFF"
          stroke="#111827"
          strokeWidth="3"
        />

        <path
          d="M77 112V171C77 181 99 189 126 189C153 189 175 181 175 171V112"
          fill="#FFFFFF"
          stroke="#111827"
          strokeWidth="3"
        />

        <path
          d="M77 141C77 151 99 159 126 159C153 159 175 151 175 141"
          stroke="#111827"
          strokeWidth="3"
        />

        <path
          d="M77 170C77 180 99 188 126 188C153 188 175 180 175 170"
          stroke="#111827"
          strokeWidth="3"
        />

        <ellipse
          cx="126"
          cy="112"
          rx="36"
          ry="10"
          fill="#DDF7EF"
        />
      </g>

      <g>
        <path
          d="M260 48L321 72V124C321 166 296 203 260 218C224 203 199 166 199 124V72L260 48Z"
          fill="url(#privacy-data-shield)"
          stroke="#006A55"
          strokeWidth="4"
          strokeLinejoin="round"
        />

        <path
          d="M237 126V111C237 98 247 88 260 88C273 88 283 98 283 111V126"
          stroke="#FFFFFF"
          strokeWidth="7"
          strokeLinecap="round"
        />

        <rect
          x="227"
          y="121"
          width="66"
          height="54"
          rx="13"
          fill="#FFFFFF"
        />

        <circle
          cx="260"
          cy="146"
          r="7"
          fill="#00866B"
        />

        <path
          d="M260 152V160"
          stroke="#00866B"
          strokeWidth="5"
          strokeLinecap="round"
        />
      </g>

      <g>
        <rect
          x="366"
          y="85"
          width="83"
          height="108"
          rx="14"
          fill="#FFFFFF"
          stroke="#111827"
          strokeWidth="3"
        />

        <path
          d="M388 111H428"
          stroke="#00866B"
          strokeWidth="5"
          strokeLinecap="round"
        />

        <path
          d="M388 135H431"
          stroke="#CBD5E1"
          strokeWidth="4"
          strokeLinecap="round"
        />

        <path
          d="M388 154H422"
          stroke="#CBD5E1"
          strokeWidth="4"
          strokeLinecap="round"
        />

        <circle
          cx="407"
          cy="178"
          r="13"
          fill="#E1F7F0"
        />

        <path
          d="M401 178L405 182L414 173"
          stroke="#00866B"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
};

const PrivacyControlIllustration = () => {
  return (
    <svg
      className="privacy-policy-vector"
      viewBox="0 0 520 280"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id="privacy-control-background"
          x1="76"
          y1="42"
          x2="450"
          y2="242"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#E4F7F2" />
          <stop offset="1" stopColor="#F7FBFA" />
        </linearGradient>

        <linearGradient
          id="privacy-control-user"
          x1="92"
          y1="91"
          x2="202"
          y2="207"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#10A987" />
          <stop offset="1" stopColor="#007A62" />
        </linearGradient>
      </defs>

      <path
        d="M67 97C93 35 170 25 224 53C275 79 315 43 376 52C438 62 474 113 458 171C442 230 382 252 323 237C264 222 223 253 160 237C91 219 40 162 67 97Z"
        fill="url(#privacy-control-background)"
      />

      <circle
        cx="425"
        cy="81"
        r="9"
        fill="#10A987"
        opacity="0.22"
      />

      <circle
        cx="76"
        cy="203"
        r="12"
        fill="#007A62"
        opacity="0.14"
      />

      <g>
        <circle
          cx="151"
          cy="135"
          r="67"
          fill="#FFFFFF"
          stroke="#111827"
          strokeWidth="3"
        />

        <circle
          cx="151"
          cy="118"
          r="25"
          fill="url(#privacy-control-user)"
        />

        <path
          d="M105 187C112 159 129 147 151 147C173 147 190 159 197 187"
          fill="#DDF7EF"
          stroke="#00866B"
          strokeWidth="4"
          strokeLinecap="round"
        />

        <circle
          cx="190"
          cy="84"
          r="20"
          fill="#FFFFFF"
          stroke="#111827"
          strokeWidth="3"
        />

        <path
          d="M181 84L187 90L199 77"
          stroke="#00866B"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>

      <path
        d="M220 139H264"
        stroke="#9CCFC3"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="7 8"
      />

      <g>
        <rect
          x="265"
          y="68"
          width="185"
          height="145"
          rx="22"
          fill="#FFFFFF"
          stroke="#111827"
          strokeWidth="3"
        />

        <path
          d="M292 105H420"
          stroke="#D1D9DE"
          strokeWidth="6"
          strokeLinecap="round"
        />

        <circle
          cx="333"
          cy="105"
          r="13"
          fill="#00866B"
          stroke="#FFFFFF"
          strokeWidth="4"
        />

        <path
          d="M292 141H420"
          stroke="#D1D9DE"
          strokeWidth="6"
          strokeLinecap="round"
        />

        <circle
          cx="386"
          cy="141"
          r="13"
          fill="#00866B"
          stroke="#FFFFFF"
          strokeWidth="4"
        />

        <path
          d="M292 177H420"
          stroke="#D1D9DE"
          strokeWidth="6"
          strokeLinecap="round"
        />

        <circle
          cx="316"
          cy="177"
          r="13"
          fill="#00866B"
          stroke="#FFFFFF"
          strokeWidth="4"
        />
      </g>

      <g>
        <circle
          cx="425"
          cy="207"
          r="32"
          fill="#00866B"
          stroke="#FFFFFF"
          strokeWidth="5"
        />

        <path
          d="M414 207L422 215L438 198"
          stroke="#FFFFFF"
          strokeWidth="5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
};

const PrivacyPolicyIllustration = ({
  type,
}: PrivacyPolicyIllustrationProps) => {
  if (type === "data-protection") {
    return <DataProtectionIllustration />;
  }

  return <PrivacyControlIllustration />;
};

export default PrivacyPolicyIllustration;