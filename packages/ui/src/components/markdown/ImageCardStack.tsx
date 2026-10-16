import * as React from 'react'
import {
  animate,
  easeIn,
  mix,
  motion,
  useMotionValue,
  useTransform,
  wrap,
} from 'motion/react'
import { cn } from '../../lib/utils'
import { SPRING, TWEEN } from '../../motion/presets'

export interface ImageCardStackItem {
  src: string
  label?: string
  alt?: string
  /** Optional image ratio (width / height). Defaults to 4/3. */
  ratio?: number
}

export interface ImageCardStackProps {
  items: ImageCardStackItem[]
  currentIndex: number
  onIndexChange: (index: number) => void
  className?: string
  maxRotate?: number
  minSwipeDistanceRatio?: number
  minSwipeVelocity?: number
  /** Max stack height in px. Defaults to 320. */
  maxHeight?: number
  /** Fraction of container size used by cards (0..1). Defaults to 0.8. */
  stackScale?: number
  /** Called when the top card is tapped/clicked. */
  onTopCardTap?: () => void
}

export function ImageCardStack({
  items,
  currentIndex,
  onIndexChange,
  className,
  maxRotate = 5,
  minSwipeDistanceRatio = 0.5,
  minSwipeVelocity = 50,
  maxHeight = 320,
  stackScale = 0.8,
  onTopCardTap,
}: ImageCardStackProps) {
  const ref = React.useRef<HTMLUListElement>(null)
  const [width, setWidth] = React.useState(400)

  React.useEffect(() => {
    if (!ref.current) return

    const updateWidth = () => {
      if (!ref.current) return
      setWidth(ref.current.offsetWidth)
    }

    updateWidth()

    const observer = new ResizeObserver(updateWidth)
    observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  if (items.length === 0) {
    return null
  }

  const setNextImage = () => {
    onIndexChange(wrap(0, items.length, currentIndex + 1))
  }

  return (
    <ul
      ref={ref}
      className={cn('relative w-full h-full list-none m-0 p-0 mx-auto', className)}
      style={{ maxHeight }}
    >
      {items.map((item, index) => (
        <StackImage
          key={`${item.src}-${index}`}
          src={item.src}
          ratio={item.ratio ?? 4 / 3}
          alt={item.alt || item.label || `Image ${index + 1}`}
          index={index}
          currentIndex={currentIndex}
          totalImages={items.length}
          maxRotate={maxRotate}
          minDistance={Math.max(80, width * minSwipeDistanceRatio)}
          minSpeed={minSwipeVelocity}
          stackScale={Math.min(1, Math.max(0.5, stackScale))}
          isTopCard={index === currentIndex}
          onTopCardTap={onTopCardTap}
          setNextImage={setNextImage}
        />
      ))}
    </ul>
  )
}

interface StackImageProps {
  src: string
  ratio: number
  alt: string
  index: number
  totalImages: number
  currentIndex: number
  maxRotate: number
  minDistance: number
  minSpeed: number
  stackScale: number
  isTopCard: boolean
  onTopCardTap?: () => void
  setNextImage: () => void
}

function StackImage({
  src,
  ratio,
  alt,
  index,
  totalImages,
  currentIndex,
  maxRotate,
  minDistance,
  minSpeed,
  stackScale,
  isTopCard,
  onTopCardTap,
  setNextImage,
}: StackImageProps) {
  const baseRotation = mix(0, maxRotate, Math.sin(index))
  const x = useMotionValue(0)
  const rotate = useTransform(x, [0, 400], [baseRotation, baseRotation + 10], { clamp: false })
  const lastDragAtRef = React.useRef(0)

  const stackPosition = ((index - currentIndex + totalImages) % totalImages)
  const zIndex = totalImages - stackPosition

  const onDragEnd = () => {
    if (!isTopCard) return
    const distance = Math.abs(x.get())
    const speed = Math.abs(x.getVelocity())

    // Release after a drag: the gesture spring keeps the flick's velocity (spec §6.2)
    if (distance > minDistance || speed > minSpeed) {
      setNextImage()
      animate(x, 0, SPRING.gesture)
      return
    }

    animate(x, 0, SPRING.gesture)
  }

  const depthProgress = totalImages > 1 ? stackPosition / (totalImages - 1) : 0

  // Keep every card fully opaque; depth is expressed via scale and vertical offset.
  const opacity = 1
  const scale = mix(1, 0.84, easeIn(depthProgress))
  const depthStep = 12
  const maxStackOffset = Math.max(0, (totalImages - 1) * depthStep)
  const stackLift = maxStackOffset * 0.45
  const y = stackPosition * depthStep - stackLift

  return (
    <motion.li
      className={cn(
        'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2',
        'overflow-hidden rounded-lg bg-raised will-change-transform',
        'shadow-elev-2'
      )}
      style={{
        width: 'auto',
        height: `${Math.round(stackScale * 100)}%`,
        maxWidth: '100%',
        maxHeight: '100%',
        aspectRatio: ratio,
        zIndex,
        rotate,
        x,
      }}
      // Cards rise into place from a small offset (96% of their scale, 8px below) — never from far
      // away or zero scale; reduced motion keeps only the fade (MotionConfig). Spatial moves ride
      // the base spring, opacity a tween.
      initial={{ opacity: 0, scale: scale * 0.96, y: y + 8 }}
      animate={{ opacity, scale, y }}
      whileTap={isTopCard ? { scale: 0.98 } : {}}
      transition={{ ...SPRING.base, opacity: TWEEN.fast }}
      drag={isTopCard ? 'x' : false}
      onDragStart={() => {
        lastDragAtRef.current = Date.now()
      }}
      onDragEnd={onDragEnd}
      onTap={() => {
        if (!isTopCard) return
        if (Date.now() - lastDragAtRef.current < 260) return
        onTopCardTap?.()
      }}
    >
      <img
        src={src}
        alt={alt}
        className="h-full w-full object-cover select-none touch-none"
        onPointerDown={(event) => event.preventDefault()}
        draggable={false}
      />
    </motion.li>
  )
}
