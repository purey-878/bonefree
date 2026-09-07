import type { ReactNode } from "react"
import "./AdminPageContent.css"

type AdminPageContentProps = {
  children: ReactNode
  className?: string
}

export default function AdminPageContent({ children, className = "" }: AdminPageContentProps) {
  return <div className={`ad-content ${className}`.trim()}>{children}</div>
}
