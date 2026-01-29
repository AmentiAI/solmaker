import type { SVGProps } from "react"

export function HalloweenIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      {/* Pumpkin body */}
      <path d="M12 2c-2 0-3.5 1-4.5 2.5C6.5 6 6 8 6 10c0 3 1 5.5 2.5 7 1 1 2.5 1.5 3.5 1.5s2.5-.5 3.5-1.5c1.5-1.5 2.5-4 2.5-7 0-2-.5-4-1.5-5.5C15.5 3 14 2 12 2z" />
      {/* Stem */}
      <path d="M12 2v-1c0-.5.5-1 1-1s1 .5 1 1v1" />
      {/* Left eye */}
      <path d="M9 9l1.5 1.5L9 12z" />
      {/* Right eye */}
      <path d="M15 9l-1.5 1.5L15 12z" />
      {/* Mouth */}
      <path d="M9 14c.5 1 1.5 2 3 2s2.5-1 3-2" />
    </svg>
  )
}
