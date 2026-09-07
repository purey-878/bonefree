import { Fragment, type ReactNode } from 'react'
import type { LegalNodeInput } from '../../services/legalDocumentService'
import { safeLegalLink, type LegalVariables } from './legalContent'
import '../../pages/Legal.css'

export function LegalNodeView({ node, variables }: { node: LegalNodeInput; variables: LegalVariables }) {
  const children = node.content?.map((child, index) => <LegalNodeView key={index} node={child} variables={variables} />)
  let content: ReactNode
  switch (node.type) {
    case 'doc': return <>{children}</>
    case 'paragraph': return <p>{children}</p>
    case 'heading': return node.attrs?.level === 3 ? <h3>{children}</h3> : <h2>{children}</h2>
    case 'bulletList': return <ul>{children}</ul>
    case 'orderedList': return <ol start={node.attrs?.start ?? 1} type={node.attrs?.type ?? '1'}>{children}</ol>
    case 'listItem': return <li>{children}</li>
    case 'hardBreak': return <br />
    case 'organizationVariable': content = variables[node.attrs?.name ?? 'organization_name']; break
    case 'text': content = node.text; break
    default: return null
  }
  for (const [index, mark] of (node.marks ?? []).entries()) {
    if (mark.type === 'bold') content = <strong key={index}>{content}</strong>
    if (mark.type === 'italic') content = <em key={index}>{content}</em>
    if (mark.type === 'link') {
      const href = safeLegalLink(mark.attrs?.href)
      if (href) content = <a key={index} href={href} rel="noopener noreferrer">{content}</a>
    }
  }
  return <>{content}</>
}

export default function LegalBody({ body, variables }: { body: LegalNodeInput; variables: LegalVariables }) {
  const sections: LegalNodeInput[][] = []
  for (const node of body.content ?? []) {
    if (node.type === 'heading' && node.attrs?.level === 2 || !sections.length) sections.push([])
    sections[sections.length - 1].push(node)
  }
  return <div className="legal-content">{sections.map((nodes, index) => <section className="legal-card" key={index}>
    {nodes.map((node, childIndex) => <Fragment key={childIndex}><LegalNodeView node={node} variables={variables} /></Fragment>)}
  </section>)}</div>
}
