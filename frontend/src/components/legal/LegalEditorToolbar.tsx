import { useEffect, useRef } from 'react'
import type { Editor } from '@tiptap/react'
import { Bold, Braces, ChevronDown, Italic, Link, List, ListOrdered, Redo2, Undo2, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import CustomSelect from '../ui/CustomSelect'
import type { LegalVariables } from './legalContent'

type ToolbarProps = {
  editor: Editor
  variables: LegalVariables
  disabled: boolean
  linkOpen: boolean
  onLink: () => void
}

export default function LegalEditorToolbar({ editor, variables, disabled, linkOpen, onLink }: ToolbarProps) {
  const { t } = useTranslation('legal')
  const variableMenu = useRef<HTMLDetailsElement>(null)
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (variableMenu.current && !variableMenu.current.contains(event.target as Node)) variableMenu.current.open = false
    }
    document.addEventListener('pointerdown', closeOutside)
    return () => document.removeEventListener('pointerdown', closeOutside)
  }, [])
  const style = editor.isActive('heading', { level: 2 }) ? 'heading'
    : editor.isActive('heading', { level: 3 }) ? 'subheading' : 'paragraph'
  const action = (label: string, Icon: LucideIcon, run: () => void, active?: boolean, unavailable = false) => (
    <button type="button" className="legal-tool-button" disabled={disabled || unavailable} title={t(label)}
      aria-label={t(label)} aria-pressed={active} onMouseDown={event => event.preventDefault()} onClick={run}>
      <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
    </button>
  )
  return <div className="legal-toolbar" role="toolbar" aria-label={t('formatting')}>
    <div className="legal-tool-group legal-style-group">
      <CustomSelect className="legal-style-select" menuClassName="legal-style-menu" menuMinWidth={210}
        value={style} disabled={disabled} aria-label={t('textStyle')}
        options={['paragraph', 'heading', 'subheading'].map(value => ({ value, label: t(value) }))}
        onSelectionCommit={() => editor.commands.focus()}
        onChange={value => {
          if (value === 'paragraph') editor.commands.setParagraph()
          else editor.commands.setHeading({ level: value === 'heading' ? 2 : 3 })
        }} />
    </div>
    <div className="legal-tool-group">
      {action('bold', Bold, () => editor.chain().focus().toggleBold().run(), editor.isActive('bold'))}
      {action('italic', Italic, () => editor.chain().focus().toggleItalic().run(), editor.isActive('italic'))}
    </div>
    <div className="legal-tool-group">
      {action('bulletList', List, () => editor.chain().focus().toggleBulletList().run(), editor.isActive('bulletList'))}
      {action('orderedList', ListOrdered, () => editor.chain().focus().toggleOrderedList().run(), editor.isActive('orderedList'))}
    </div>
    <div className="legal-tool-group">
      {action('link', Link, onLink, editor.isActive('link') || linkOpen)}
    </div>
    <div className="legal-tool-group">
      {action('undo', Undo2, () => editor.chain().focus().undo().run(), undefined, !editor.can().undo())}
      {action('redo', Redo2, () => editor.chain().focus().redo().run(), undefined, !editor.can().redo())}
    </div>
    <details ref={variableMenu} className="legal-variable-menu" onKeyDown={event => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.currentTarget.open = false
        event.currentTarget.querySelector('summary')?.focus()
      }
    }}>
      <summary title={t('insertVariable')} aria-disabled={disabled} onClick={event => { if (disabled) event.preventDefault() }}>
        <Braces size={18} aria-hidden="true" /><span>{t('insertVariable')}</span><ChevronDown size={14} className="legal-menu-chevron" aria-hidden="true" />
      </summary>
      <div className="legal-variable-options">
        {(['organization_name', 'organization_contact'] as const).map(name => <button type="button" key={name}
          disabled={disabled} onMouseDown={event => event.preventDefault()} onClick={() => {
            editor.chain().focus().insertContent({ type: 'organizationVariable', attrs: { name } }).run()
            if (variableMenu.current) variableMenu.current.open = false
          }}>
          <span>{t(name === 'organization_name' ? 'variableName' : 'variableContact')}</span>
          <small>{variables[name]}</small>
        </button>)}
      </div>
    </details>
  </div>
}
