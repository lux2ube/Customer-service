import * as React from "react"

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    // We always set this to true to force the mobile layout,
    // but do it inside useEffect to prevent hydration mismatches.
    setIsMobile(true)
  }, [])

  return !!isMobile
}
