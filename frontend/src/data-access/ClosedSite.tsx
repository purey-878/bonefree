import { ShieldCheck } from 'lucide-react'

import './closed-site.css'

export default function ClosedSite({ organizationName }: { organizationName: string }) {
  return (
    <main className="data-access-closed">
      <section>
        <ShieldCheck aria-hidden="true" />
        <span>{organizationName}</span>
        <h1>This site is no longer available</h1>
        <p>{organizationName} is no longer operating at this address. For questions about previous orders, please contact the organization directly.</p>
      </section>
    </main>
  )
}
