import React from 'react'

const paths = {
  location: (
    <>
      <path d="M12 21s7-5.7 7-12a7 7 0 1 0-14 0c0 6.3 7 12 7 12Z" />
      <circle cx="12" cy="9" r="2.3" />
    </>
  ),

  cart: (
    <>
      <path d="M3.5 4.5h2l1.5 9.2a2 2 0 0 0 2 1.7h6.8a2 2 0 0 0 2-1.5l1.2-6.2H6.2" />
      <circle cx="9.2" cy="19" r="1" />
      <circle cx="17.1" cy="19" r="1" />
    </>
  ),

  user: (
    <>
      <circle cx="12" cy="8" r="3.4" />
      <path d="M5.2 20c.8-3.2 3.1-5 6.8-5s6 1.8 6.8 5" />
    </>
  ),

  orders: (
    <>
      <path d="M6 3.8h9l3 3v13.4H6z" />
      <path d="M15 3.8v3h3M9 11h6M9 14.5h6M9 18h4" />
    </>
  ),

  search: (
    <>
      <circle cx="10.8" cy="10.8" r="5.8" />
      <path d="m15.2 15.2 4 4" />
    </>
  ),

  arrow: <path d="M5 12h13M13 7l5 5-5 5" />,

  truck: (
    <>
      <path d="M3.5 6.5h10v9h-10zM13.5 9h3l3 3v3.5h-3.1" />
      <circle cx="7" cy="17" r="1.6" />
      <circle cx="16.8" cy="17" r="1.6" />
    </>
  ),

  tag: (
    <>
      <path d="M4.5 5.5V11l8.2 8.2a2 2 0 0 0 2.8 0l3.7-3.7a2 2 0 0 0 0-2.8L11 4.5H5.5a1 1 0 0 0-1 1Z" />
      <circle cx="8" cy="8" r="1.2" />
    </>
  ),

  wallet: (
    <>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H18v14H6.5A2.5 2.5 0 0 1 4 15.5z" />
      <path d="M4 7h14M15 11h4v4h-4a2 2 0 0 1 0-4Z" />
    </>
  ),

  check: (
    <>
      <path d="m6.5 12.5 3.5 3.5 7.5-8" />
    </>
  ),

  percent: (
    <>
      <path d="M7 17 17 7" />
      <circle cx="7.5" cy="7.5" r="1.8" />
      <circle cx="16.5" cy="16.5" r="1.8" />
    </>
  ),

  grid: (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <rect x="14" y="14" width="6" height="6" rx="1" />
    </>
  ),
}

export default function NexIcon({
  name,
  size = 20,
  strokeWidth = 1.8,
  className = '',
  title,
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      {paths[name] || paths.grid}
    </svg>
  )
}
