; inherits: typescript

;; /*sql*/ `...`
(
  (comment) @c
  .
  (template_string) @injection.content
  (#match? @c "^/\\*\\s*sql\\s*\\*/$")
  (#set! injection.language "sql")
  (#set! injection.include-children)
)
