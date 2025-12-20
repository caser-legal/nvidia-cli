// NVIDIA Animated Background
// Inspired by build.nvidia.com - dark gradient with animated glowing orbs

"use client";

import * as React from "react";

export function NvidiaBackground() {
  return (
    <div className="nvidia-bg">
      <div className="nvidia-bg-gradient" />
      <div className="nvidia-bg-orbs">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
        <div className="orb orb-4" />
      </div>
      <div className="nvidia-bg-noise" />
    </div>
  );
}

// Animated center element (pulsing rings)
export function NvidiaAnimatedCenter() {
  return (
    <div className="nvidia-center-animation">
      <div className="ring ring-1" />
      <div className="ring ring-2" />
      <div className="ring ring-3" />
      <div className="core" />
    </div>
  );
}

// NVIDIA Logo SVG
export function NvidiaLogo({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 351.29 65.24"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M157.86,14.77h11.57V50.5h22.22v9.73H157.86Z" />
      <path d="M109.06,14.77h11.57V60.23H109.06Z" />
      <path d="M68.61,14.77H82.74c15.54,0,25.27,9.73,25.27,22.73s-9.73,22.73-25.27,22.73H68.61Zm13.11,35.73c9.22,0,14.32-5.61,14.32-13s-5.1-13-14.32-13H80.18V50.5Z" />
      <path d="M0,14.77H12.6L28.65,43.36,44.7,14.77H57.3V60.23H45.73V32.15L31.72,57.16H25.58L11.57,32.15V60.23H0Z" />
      <path d="M192.77,14.77h11.57V60.23H192.77Z" />
      <path d="M247.59,14.77h13.11l21.71,45.46H269.8l-4.59-10.24H239.94l-4.59,10.24H222.74Zm6.63,11.57-7.65,16.36h15.29Z" />
      <path d="M284.34,60.23,305.54,14.77h13.62l21.2,45.46H327.75l-4.59-10.24H297.89l-4.59,10.24Zm19.18-33.89-7.65,16.36h15.29Z" />
    </svg>
  );
}

// NVIDIA Eye Logo (the iconic eye symbol)
export function NvidiaEyeLogo({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M9.47 5.33C6.93 5.68 4.67 7.13 3.2 9.33c-.4.6-.4.6.13 1.07 2.27 2 5.07 3.13 8.07 3.27 1.87.07 3.6-.27 5.27-1 1.13-.5 2.4-1.27 3.13-1.93l.4-.33-.33-.47c-1.47-2.13-3.67-3.6-6.2-4.13-.93-.2-3.27-.27-4.2-.13v.01zm3.6 1.2c2.13.4 4 1.53 5.27 3.13l.27.4-.4.27c-1.8 1.27-3.93 1.93-6.2 1.93-2.4 0-4.53-.67-6.4-2l-.33-.27.27-.4c1.33-1.87 3.47-3.07 5.8-3.27.4-.07 1.33 0 1.73.2h-.01z"
        fill="currentColor"
      />
      <path
        d="M11.07 7.4c-1.13.27-2 1.2-2.2 2.33-.13.67 0 1.4.4 2 .93 1.4 2.87 1.67 4.13.53.47-.4.8-1 .93-1.6.2-1.07-.2-2.07-1.07-2.73-.6-.47-1.47-.67-2.2-.53h.01zm1.2 1.27c.67.27 1.07.93 1.07 1.67 0 .53-.2 1-.6 1.33-.93.8-2.4.4-2.8-.73-.33-.93.13-1.93 1.07-2.27.4-.13.87-.13 1.27 0h-.01z"
        fill="currentColor"
      />
    </svg>
  );
}
