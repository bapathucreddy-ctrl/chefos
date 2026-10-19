import { useEffect, useState } from "react"
import Brand from "./Brand"

export default function Splash() {
  const [visible, setVisible] = useState(
    () => !sessionStorage.getItem("chefos_splash_seen")
  )
  useEffect(() => {
    if (!visible) return
    const timer = setTimeout(
      () => {
        sessionStorage.setItem("chefos_splash_seen", "1")
        setVisible(false)
      },
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 150 : 3400
    )
    return () => clearTimeout(timer)
  }, [visible])
  if (!visible) return null
  return (
    <div className="brand-splash" role="status" aria-label="Welcome to Chefos">
      <div className="splash-orbit orbit-one" />
      <div className="splash-orbit orbit-two" />
      <div className="splash-orbit orbit-three" />
      <Brand />
      <p>GOOD FOOD. YOUR WAY.</p>
      <span className="splash-line" />
    </div>
  )
}
