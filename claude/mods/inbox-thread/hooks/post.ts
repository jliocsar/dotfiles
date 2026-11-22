// Pure helpers: what a turn's post says and carries. No `$` in here.

// Prompts other tools submit to wake a session. Their turns aren't julio's.
export const WAKE_MARKERS = ['(captain-waiter) wake:', '(captain-ctx'] as const

// Shorter answers with no files are "ok" / "done." noise.
export const MIN_ANSWER = 20
export const MAX_FILES = 10
const MAX_QUOTE = 280
const MAX_SUBJECT = 72

const IMAGE = /\.(png|jpe?g|gif|webp|svg)$/i
const DOC = /\.(html?|pdf|mp4|webm|mov)$/i
const MD = /\.(md|markdown)$/i
const PLAN_DIR = '/.claude/plans/'

// An absolute or ~ path to a file of a kind worth showing, as prose or a
// markdown link writes it.
const MENTION =
  /(?:^|[\s(\[`'"<])((?:~\/|\/)[^\s`'"()<>[\]]*?\.(?:png|jpe?g|gif|webp|svg|html?|pdf|mp4|webm|mov|md|markdown))(?=$|[\s)\]`'".,:;!?>])/gim

export const isWake = (text: string) => WAKE_MARKERS.some(m => text.includes(m))

const expand = (path: string, home: string | undefined) =>
  path.startsWith('~/') && home ? `${home}${path.slice(1)}` : path

export const mentionedPaths = (answer: string, home: string | undefined): string[] =>
  [...answer.matchAll(MENTION)].map(m => expand(m[1] ?? '', home)).filter(p => p.startsWith('/'))

const refused = (path: string) => (path.split('/').pop() ?? '').startsWith('.env')

// The turn's files worth sending, in the order seen, before the existence
// check: what the answer names (any kind above) and what the turn wrote or
// showed (images and docs; a markdown file only when it is a plan).
export const candidates = (
  answer: string,
  touched: readonly string[],
  home: string | undefined,
): string[] => {
  const named = mentionedPaths(answer, home)
  const made = touched.filter(p => IMAGE.test(p) || DOC.test(p) || (MD.test(p) && p.includes(PLAN_DIR)))

  return [...new Set([...named, ...made])].filter(p => !refused(p)).slice(0, MAX_FILES)
}

export const isImage = (path: string) => IMAGE.test(path)

const oneLine = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, ' ').trim()

  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

export const subjectFor = (cwd: string, prompt: string) => {
  const dir = cwd.split('/').filter(Boolean).pop() ?? cwd
  const first = oneLine(prompt.split('\n').find(l => l.trim()) ?? '', MAX_SUBJECT)

  return first ? `${dir}: ${first}` : `${dir}: claude session`
}

// Stable per session id, so a resume or reload lands in the same thread.
export const threadNameFor = (cwd: string, sessionId: string) => {
  const dir = cwd.split('/').filter(Boolean).pop() ?? cwd

  return `claude · ${dir} · ${sessionId.slice(0, 8)}`
}

export type Post = { body: string; attachments: string[] }

// The answer, led by the prompt that asked for it (when a person typed one),
// images inline unless the answer already shows them, the rest attached.
export const buildPost = (answer: string, prompt: string | undefined, files: readonly string[]): Post => {
  const images = files.filter(isImage)
  const attachments = files.filter(f => !isImage(f))
  const inline = images.filter(p => !answer.includes(`](${p})`))
  const parts = [
    prompt?.trim() ? `> ${oneLine(prompt, MAX_QUOTE)}` : '',
    answer.trim(),
    inline.map(p => `![${p.split('/').pop()}](${p})`).join('\n'),
  ]

  return { body: parts.filter(Boolean).join('\n\n'), attachments }
}

export const sectionText = (thread: string) =>
  [
    '# Plannotator Inbox thread',
    `This session is one Plannotator Inbox thread, named "${thread}". Your final answer each turn is posted there by itself, with the images, HTML and plan files it names by absolute path, so name the files the person should see by absolute path.`,
    `When you call plannotator_inbox send_message yourself (a :::question decision, a report), pass thread: "${thread}" so it lands in this thread, not a new one. A turn where you send one is not posted again, so put in it what the person needs. Don't send the answer twice.`,
  ].join('\n\n')

// Before the session's thread has a name (the first prompt's turn).
export const sectionPendingText = () =>
  [
    '# Plannotator Inbox thread',
    'This session is one Plannotator Inbox thread. It is being named now; its name shows here from your next request on. Your final answer each turn is posted there by itself, with the images, HTML and plan files it names by absolute path, so name the files the person should see by absolute path.',
    "Don't call plannotator_inbox send_message yourself until this section names the thread: the answer reaches the person anyway.",
  ].join('\n\n')

// --- naming the thread ---

export const TITLE_MODEL = 'haiku'
const MAX_TITLE = 60
const MAX_TITLE_WORDS = 8
const MAX_TITLE_INPUT = 2000
// Fewer words than this and the answer goes in too.
const THIN_PROMPT_WORDS = 4

export const TITLE_SYSTEM =
  'You name conversation threads in an inbox. Answer with the title alone: 3 to 6 plain words saying what the conversation is about, sentence case, no quotes, no trailing period, no emoji.'

const words = (text: string) => text.split(/\s+/).filter(Boolean)

export const isThin = (prompt: string) => words(prompt).length < THIN_PROMPT_WORDS

export const titlePrompt = (prompt: string, answer?: string) =>
  [
    'Name the thread for this conversation.',
    `<request>\n${prompt.trim().slice(0, MAX_TITLE_INPUT)}\n</request>`,
    answer?.trim() ? `<reply>\n${answer.trim().slice(0, MAX_TITLE_INPUT)}\n</reply>` : '',
  ]
    .filter(Boolean)
    .join('\n\n')

// The model's reply as one plain line, or undefined when nothing usable is left.
export const cleanTitle = (reply: string): string | undefined => {
  const line = reply.split('\n').map(l => l.trim()).find(Boolean) ?? ''
  const bare = line
    .replace(/^(title|thread)\s*:\s*/i, '')
    .replace(/[*_`#"“”‘’]/g, '')
    .replace(/^'+|'+$/g, '')
    .replace(/[.!?:;,\s]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
  let title = words(bare).slice(0, MAX_TITLE_WORDS).join(' ')
  if (title.length > MAX_TITLE) title = title.slice(0, MAX_TITLE).replace(/\s+\S*$/, '')

  return /\p{L}/u.test(title) ? title : undefined
}

// How plannotator compares thread names: no case, spacing or invisible characters.
export const normName = (name: string) =>
  name.normalize('NFKC').replace(/[​-‍⁠﻿\s]/g, '').toLowerCase()

// The open threads' names in a read_thread listing (`· name "<name>" ·`).
export const parseThreadNames = (listing: string): string[] =>
  [...listing.matchAll(/· name "([^"\n]*)"/g)].map(m => m[1] ?? '').filter(Boolean)

// `name`, or `name (2)`, `name (3)`... when another open thread has it: a send
// by name joins the newest open thread of that name, whoever opened it.
export const uniqueName = (name: string, taken: readonly string[]) => {
  const used = new Set(taken.map(normName))
  if (!used.has(normName(name))) return name
  let n = 2
  while (used.has(normName(`${name} (${n})`))) n++

  return `${name} (${n})`
}
