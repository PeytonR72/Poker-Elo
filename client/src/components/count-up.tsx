import { useEffect } from "react"
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react"

import { cn } from "../lib/utils.js"

/**
 * Pure default formatter — rounds to the nearest integer and groups with
 * en-US thousands separators. Extracted so it can be unit-tested without
 * mounting the component (house convention: pure cores tested, components thin).
 */
export function defaultCountUpFormat(n: number): string {
  return Math.round(n).toLocaleString("en-US")
}

/**
 * Spring-based number animator. Animates from the previous value to the new
 * value whenever `value` changes (never from 0 on every render). Renders
 * tabular-nums and snaps instantly when the user prefers reduced motion.
 */
export function CountUp({
  value,
  format = defaultCountUpFormat,
  className,
}: {
  value: number
  format?: (n: number) => string
  className?: string
}) {
  const reduced = useReducedMotion()
  const motionValue = useMotionValue(value)
  const spring = useSpring(motionValue, {
    stiffness: 120,
    damping: 20,
    mass: 0.6,
  })
  // When reduced motion is preferred, read the raw value (instant snap).
  const source = reduced ? motionValue : spring
  const text = useTransform(source, (n) => format(n))

  useEffect(() => {
    motionValue.set(value)
  }, [value, motionValue])

  return (
    <motion.span className={cn("tabular-nums", className)}>{text}</motion.span>
  )
}

export default CountUp
