import * as Arr from 'effect/Array'
import * as Predicate from 'effect/Predicate'

import { escapeAttribute, escapeText } from './escape.ts'

export class Raw {
  readonly html: string

  constructor(html: string) {
    this.html = html
  }
}

export type AttributeValue = string | number | bigint | boolean | null | undefined

export type Node = Raw | AttributeValue | readonly Node[]

export interface Attributes {
  readonly children?: Node
  readonly [attribute: string]: AttributeValue | Node
}

export type Component = (props: Attributes) => Node

const VOID_ELEMENTS: ReadonlySet<string> = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
])

const ATTRIBUTE_ALIASES = new Map([
  ['className', 'class'],
  ['htmlFor', 'for'],
])

export const raw = (html: string): Raw => new Raw(html)

const isNodeList = (node: AttributeValue | Node): node is readonly Node[] => Arr.isArray(node)

const isText = (value: AttributeValue | Node): value is string | number | bigint =>
  Predicate.isString(value) || Predicate.isNumber(value) || Predicate.isBigInt(value)

export const render = (node: Node): string => {
  if (node instanceof Raw) {
    return node.html
  }

  if (isNodeList(node)) {
    return node.map(render).join('')
  }

  return isText(node) ? escapeText(String(node)) : ''
}

const renderAttribute = (name: string, value: AttributeValue | Node): string => {
  const attribute = ATTRIBUTE_ALIASES.get(name) ?? name

  if (value === true) {
    return ` ${attribute}`
  }

  return isText(value) ? ` ${attribute}="${escapeAttribute(String(value))}"` : ''
}

const serializeAttributes = (props: Attributes): string =>
  Object.entries(props)
    .filter(([name]) => name !== 'children')
    .map(([name, value]) => renderAttribute(name, value))
    .join('')

export const Fragment = (props: Attributes): Raw => raw(render(props.children))

export const jsx = (type: string | Component, props: Attributes): Raw => {
  if (Predicate.isString(type)) {
    const attributes = serializeAttributes(props)

    return VOID_ELEMENTS.has(type)
      ? raw(`<${type}${attributes}>`)
      : raw(`<${type}${attributes}>${render(props.children)}</${type}>`)
  }

  return raw(render(type(props)))
}

export const jsxs = jsx

export const jsxDEV = jsx

export declare namespace JSX {
  type Element = Raw

  interface ElementChildrenAttribute {
    readonly children?: Node
  }

  interface IntrinsicElements {
    readonly [tag: string]: Attributes
  }
}
