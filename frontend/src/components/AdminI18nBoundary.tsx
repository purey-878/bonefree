import { Children, cloneElement, isValidElement } from "react"
import type { ReactElement, ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { translateAdminText } from "../i18n/adminPhrases"

const TEXT_PROPS = new Set([
  "alt",
  "aria-label",
  "cancelText",
  "caption",
  "confirmText",
  "data-label",
  "description",
  "helper",
  "label",
  "placeholder",
  "title",
  "valueLabel",
])

function translateStructuredValue(value: unknown, translate: (text: string) => string): unknown {
  if (Array.isArray(value)) return value.map((item) => translateStructuredValue(item, translate))
  if (!value || typeof value !== "object" || isValidElement(value)) return value

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    typeof item === "string" && TEXT_PROPS.has(key)
      ? translate(item)
      : Array.isArray(item)
        ? translateStructuredValue(item, translate)
        : item,
  ]))
}

export default function AdminI18nBoundary({ children }: { children: ReactNode }) {
  const { t } = useTranslation("admin")
  const translate = (value: string) => translateAdminText(value, t)

  const translateNode = (node: ReactNode): ReactNode => {
    if (typeof node === "string") return translate(node)
    if (!isValidElement(node)) return node

    const element = node as ReactElement<Record<string, unknown>>
    const nextProps: Record<string, unknown> = {}

    Object.entries(element.props).forEach(([key, value]) => {
      if (key === "children") {
        nextProps.children = Children.map(value as ReactNode, translateNode)
      } else if (typeof value === "string" && TEXT_PROPS.has(key)) {
        nextProps[key] = translate(value)
      } else if ((key === "options" || key === "config") && value && typeof value === "object") {
        nextProps[key] = translateStructuredValue(value, translate)
      }
    })

    return cloneElement(element, nextProps)
  }

  return <>{Children.map(children, translateNode)}</>
}
