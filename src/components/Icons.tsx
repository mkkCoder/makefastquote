/**
 * The dozen icons this app uses, hand-inlined.
 *
 * An icon package would be ~1 kB of actual glyphs and a few hundred kB of
 * everything else, and a CDN <script> tag would make a product whose whole
 * pitch is "no server, no external calls" depend on someone else's uptime and
 * break behind an ad blocker. Paths are from the Lucide set (ISC licensed).
 */

interface Props {
  className?: string;
  strokeWidth?: number;
}

const base = (className = 'w-4 h-4', strokeWidth = 2) => ({
  className,
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false as const,
});

export const IconFile = ({ className, strokeWidth }: Props) => (
  <svg {...base(className, strokeWidth)}>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v5h6" />
  </svg>
);

export const IconReceipt = ({ className, strokeWidth }: Props) => (
  <svg {...base(className, strokeWidth)}>
    <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
    <path d="M8 8h8M8 12h8M8 16h5" />
  </svg>
);

export const IconTrash = ({ className, strokeWidth }: Props) => (
  <svg {...base(className, strokeWidth)}>
    <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
  </svg>
);

export const IconPlus = ({ className, strokeWidth }: Props) => (
  <svg {...base(className, strokeWidth)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const IconDownload = ({ className, strokeWidth }: Props) => (
  <svg {...base(className, strokeWidth)}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 10l5 5 5-5M12 15V3" />
  </svg>
);

export const IconSun = ({ className, strokeWidth }: Props) => (
  <svg {...base(className, strokeWidth)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

export const IconMoon = ({ className, strokeWidth }: Props) => (
  <svg {...base(className, strokeWidth)}>
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
);

export const IconLock = ({ className, strokeWidth }: Props) => (
  <svg {...base(className, strokeWidth)}>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

export const IconCheck = ({ className, strokeWidth }: Props) => (
  <svg {...base(className, strokeWidth)}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

export const IconX = ({ className, strokeWidth }: Props) => (
  <svg {...base(className, strokeWidth)}>
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

export const IconSparkle = ({ className, strokeWidth }: Props) => (
  <svg {...base(className, strokeWidth)}>
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9Z" />
    <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z" />
  </svg>
);

export const IconUpload = ({ className, strokeWidth }: Props) => (
  <svg {...base(className, strokeWidth)}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <path d="M7 8l5-5 5 5M12 3v12" />
  </svg>
);

export const IconSave = ({ className, strokeWidth }: Props) => (
  <svg {...base(className, strokeWidth)}>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
    <path d="M17 21v-8H7v8M7 3v5h8" />
  </svg>
);

export const IconTable = ({ className, strokeWidth }: Props) => (
  <svg {...base(className, strokeWidth)}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M3 15h18M9 3v18" />
  </svg>
);

export const IconChevronUp = ({ className, strokeWidth }: Props) => (
  <svg {...base(className, strokeWidth)}>
    <path d="m18 15-6-6-6 6" />
  </svg>
);

export const IconChevronDown = ({ className, strokeWidth }: Props) => (
  <svg {...base(className, strokeWidth)}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

export const IconEraser = ({ className, strokeWidth }: Props) => (
  <svg {...base(className, strokeWidth)}>
    <path d="M20 20H8.5L3 14.5a2 2 0 0 1 0-2.8l8-8a2 2 0 0 1 2.8 0l6.5 6.5a2 2 0 0 1 0 2.8L14 20" />
    <path d="m9 9 6.5 6.5" />
  </svg>
);
