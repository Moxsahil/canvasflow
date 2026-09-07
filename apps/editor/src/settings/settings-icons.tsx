/**
 * The dialog's glyphs, traced from the design's own exported SVGs rather than
 * borrowed from an icon set — same geometry, same stroke weights, no drift.
 *
 * The exported files paint a fixed stroke (blue for the selected row, grey for
 * the rest); here that is `currentColor`, so a row states its own colour once
 * and the icon follows the label.
 */

const NAV_ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  strokeWidth: 1.2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

export function SearchIcon() {
  return (
    <svg
      width={14}
      height={14}
      viewBox="0 0 14 14"
      fill="none"
      strokeWidth={1.05}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path
        d="M6.41667 10.5C8.67183 10.5 10.5 8.67183 10.5 6.41667C10.5 4.1615 8.67183 2.33333 6.41667 2.33333C4.1615 2.33333 2.33333 4.1615 2.33333 6.41667C2.33333 8.67183 4.1615 10.5 6.41667 10.5Z"
        stroke="currentColor"
      />
      <path d="M11.6667 11.6667L9.625 9.625" stroke="currentColor" />
    </svg>
  );
}

export function ProfileIcon() {
  return (
    <svg {...NAV_ICON_PROPS}>
      <path
        d="M8 8C9.47276 8 10.6667 6.80609 10.6667 5.33333C10.6667 3.86057 9.47276 2.66667 8 2.66667C6.52724 2.66667 5.33333 3.86057 5.33333 5.33333C5.33333 6.80609 6.52724 8 8 8Z"
        stroke="currentColor"
      />
      <path
        d="M2.66667 14V13.3333C2.66667 12.2725 3.08809 11.2551 3.83824 10.5049C4.58839 9.75476 5.6058 9.33333 6.66667 9.33333H9.33333C10.3942 9.33333 11.4116 9.75476 12.1618 10.5049C12.9119 11.2551 13.3333 12.2725 13.3333 13.3333V14"
        stroke="currentColor"
      />
    </svg>
  );
}

export function AccountIcon() {
  return (
    <svg {...NAV_ICON_PROPS}>
      <path
        d="M8 2L12.6667 4V7.33333C12.6667 10.3333 10.6667 12.6667 8 14C5.33333 12.6667 3.33333 10.3333 3.33333 7.33333V4L8 2Z"
        stroke="currentColor"
      />
    </svg>
  );
}

export function WorkspaceIcon() {
  return (
    <svg {...NAV_ICON_PROPS}>
      <path
        d="M6 7.46667C7.17821 7.46667 8.13333 6.51154 8.13333 5.33333C8.13333 4.15513 7.17821 3.2 6 3.2C4.82179 3.2 3.86667 4.15513 3.86667 5.33333C3.86667 6.51154 4.82179 7.46667 6 7.46667Z"
        stroke="currentColor"
      />
      <path
        d="M2 13.3333V12.6667C2 11.7826 2.35119 10.9348 2.97631 10.3096C3.60143 9.68452 4.44928 9.33333 5.33333 9.33333H6.66667C7.55072 9.33333 8.39857 9.68452 9.02369 10.3096C9.64881 10.9348 10 11.7826 10 12.6667V13.3333"
        stroke="currentColor"
      />
      <path
        d="M10.6667 3.66667C10.9168 3.86651 11.1187 4.12009 11.2575 4.40861C11.3963 4.69713 11.4683 5.01318 11.4683 5.33333C11.4683 5.65349 11.3963 5.96954 11.2575 6.25806C11.1187 6.54657 10.9168 6.80015 10.6667 7"
        stroke="currentColor"
      />
      <path
        d="M12 9.46667C12.6177 9.7355 13.1394 10.1852 13.4964 10.7564C13.8534 11.3276 14.029 11.9937 14 12.6667V13.3333"
        stroke="currentColor"
      />
    </svg>
  );
}

export function NotificationsIcon() {
  return (
    <svg {...NAV_ICON_PROPS}>
      <path
        d="M12 5.33333C12 4.27247 11.5786 3.25505 10.8284 2.50491C10.0783 1.75476 9.06087 1.33333 8 1.33333C6.93913 1.33333 5.92172 1.75476 5.17157 2.50491C4.42143 3.25505 4 4.27247 4 5.33333C4 9.33333 2.66667 10 2.66667 10H13.3333C13.3333 10 12 9.33333 12 5.33333Z"
        stroke="currentColor"
      />
      <path
        d="M7 13.3333C7.12512 13.4752 7.279 13.5888 7.45142 13.6667C7.62383 13.7445 7.81083 13.7847 8 13.7847C8.18917 13.7847 8.37617 13.7445 8.54858 13.6667C8.721 13.5888 8.87488 13.4752 9 13.3333"
        stroke="currentColor"
      />
    </svg>
  );
}

export function BillingIcon() {
  return (
    <svg {...NAV_ICON_PROPS}>
      <path
        d="M12.6667 3.66667H3.33333C2.41286 3.66667 1.66667 4.41286 1.66667 5.33333V10.6667C1.66667 11.5871 2.41286 12.3333 3.33333 12.3333H12.6667C13.5871 12.3333 14.3333 11.5871 14.3333 10.6667V5.33333C14.3333 4.41286 13.5871 3.66667 12.6667 3.66667Z"
        stroke="currentColor"
      />
      <path d="M1.66667 6.66667H14.3333" stroke="currentColor" />
    </svg>
  );
}

export function PrivacyIcon() {
  return (
    <svg {...NAV_ICON_PROPS}>
      <path
        d="M11.6667 7H4.33333C3.41286 7 2.66667 7.74619 2.66667 8.66667V12C2.66667 12.9205 3.41286 13.6667 4.33333 13.6667H11.6667C12.5871 13.6667 13.3333 12.9205 13.3333 12V8.66667C13.3333 7.74619 12.5871 7 11.6667 7Z"
        stroke="currentColor"
      />
      <path
        d="M5.33333 7V4.66667C5.33333 3.95942 5.61428 3.28115 6.11438 2.78105C6.61448 2.28095 7.29276 2 8 2C8.70724 2 9.38552 2.28095 9.88562 2.78105C10.3857 3.28115 10.6667 3.95942 10.6667 4.66667V7"
        stroke="currentColor"
      />
    </svg>
  );
}
