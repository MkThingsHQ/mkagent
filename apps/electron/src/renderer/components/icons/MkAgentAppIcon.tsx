import mkagentIcon from "@/assets/mkagent_app_icon.svg"

interface MkAgentAppIconProps {
  className?: string
  size?: number
}

/**
 * MkAgentAppIcon - Displays the MkAgent app icon.
 */
export function MkAgentAppIcon({ className, size = 64 }: MkAgentAppIconProps) {
  return (
    <img
      src={mkagentIcon}
      alt="MkAgent"
      width={size}
      height={size}
      className={className}
    />
  )
}
