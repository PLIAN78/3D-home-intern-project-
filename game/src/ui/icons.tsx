import type { ReactNode } from "react";
import type { ModeId } from "../story/economy";

/**
 * A small set of line icons (24 × 24, 1.75 px strokes), drawn for this game so
 * the interface uses no emoji and no icon font. They inherit `currentColor`.
 */

function Svg({ children, size = 22 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

const GEAR_ICONS: Record<ModeId, ReactNode> = {
  walk: (
    <>
      <circle cx="12.5" cy="4.5" r="1.9" />
      <path d="M12 8.2 10.6 13.6l2.7 2.4.9 4.8" />
      <path d="M10.6 13.6 8.4 20.5" />
      <path d="M8 11.6l2.6-3.2 3 .6 2.4 2.6" />
    </>
  ),
  truck: (
    <>
      <path d="M2.5 15.5v-4h9.5V7.5h4.6l3 4h2v4" />
      <path d="M12 11.5h7.6" />
      <circle cx="7" cy="16.5" r="2" />
      <circle cx="17" cy="16.5" r="2" />
      <path d="M9 16.5h6" />
    </>
  ),
  horse: (
    <>
      <path d="M8.5 21v-4.5c0-2.6 1.1-4.6 3-6.1L8.2 9.1 9.4 6c2.7-.3 5 .5 6.9 2.4l3.2 3.4-1.2 2.1-3.1-1.2c-.6 1.6-.9 3.3-.9 5.2V21" />
      <path d="M12 4.2 13 2.5" />
      <circle cx="13.4" cy="8.1" r=".4" fill="currentColor" />
    </>
  ),
  car: (
    <>
      <path d="M2 16v-2.6l2.8-.9 3.7-3.4h6.2l3.9 3.4 3 .9V16" />
      <path d="M8.2 12.4h9.6" />
      <circle cx="6.5" cy="16.2" r="1.9" />
      <circle cx="17.5" cy="16.2" r="1.9" />
      <path d="M8.4 16.2h7.2" />
    </>
  ),
  jetpack: (
    <>
      <rect x="5.5" y="3.5" width="5.5" height="12" rx="2.75" />
      <rect x="13" y="3.5" width="5.5" height="12" rx="2.75" />
      <path d="M11 8h2" />
      <path d="M8.25 18v2.5M15.75 18v2.5" />
    </>
  ),
  heli: (
    <>
      <path d="M3 5.5h15" />
      <path d="M10.5 5.5v3" />
      <path d="M4.5 13c0-2.5 2.2-4.5 5.5-4.5h2c2.8 0 4.5 2 4.5 4.5s-1.7 3.5-4.5 3.5h-5C5.5 16.5 4.5 15 4.5 13Z" />
      <path d="M16.5 12.5h4.5M21 10v5" />
      <path d="M6.5 19.5h9M8 16.5v3M14 16.5v3" />
    </>
  ),
  trail: (
    <>
      <path d="M2.5 14.5v-4h8.5V6.5h5l2.8 4h2.7v4" />
      <path d="M10.5 4.5h6.5" />
      <circle cx="6.8" cy="16.2" r="2.6" />
      <circle cx="17.2" cy="16.2" r="2.6" />
    </>
  ),
  hauler: (
    <>
      <path d="M1.5 15.5v-4h11V7.5h4.5l3 4h2.5v4" />
      <rect x="3.5" y="7.8" width="6.5" height="3.7" rx=".6" />
      <circle cx="6" cy="16.5" r="2" />
      <circle cx="17.5" cy="16.5" r="2" />
      <path d="M8 16.5h7.5" />
    </>
  ),
  elephant: (
    <>
      <path d="M3.5 18.5v-6C3.5 9.2 6 7 9.5 7h4.2c3.2 0 5.6 2.4 5.6 5.6V16c0 1.4.7 2.3 1.7 2.5" />
      <path d="M13.5 8.5c-1.6 1.2-1.6 4.4 0 5.6" />
      <path d="M7 18.5v-3M12.5 18.5v-3" />
      <circle cx="16.4" cy="10.6" r=".45" fill="currentColor" />
    </>
  ),
};

export function GearIcon({ mode, size }: { mode: ModeId; size?: number }) {
  return <Svg size={size}>{GEAR_ICONS[mode]}</Svg>;
}

export function LockIcon({ size = 14 }: { size?: number }) {
  return (
    <Svg size={size}>
      <rect x="5" y="11" width="14" height="9.5" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </Svg>
  );
}

export function PlusIcon({ size = 16 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  );
}

export function MinusIcon({ size = 16 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M5 12h14" />
    </Svg>
  );
}

export function CrosshairIcon({ size = 16 }: { size?: number }) {
  return (
    <Svg size={size}>
      <circle cx="12" cy="12" r="6.5" />
      <path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4" />
    </Svg>
  );
}

export function CloseIcon({ size = 16 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function MapIcon({ size = 16 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="M3 6.5 9 4l6 2.5 6-2.5v13.5L15 20l-6-2.5L3 20Z" />
      <path d="M9 4v13.5M15 6.5V20" />
    </Svg>
  );
}

export function CheckIcon({ size = 16 }: { size?: number }) {
  return (
    <Svg size={size}>
      <path d="m5 12.5 4.5 4.5L19 7.5" />
    </Svg>
  );
}
