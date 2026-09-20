-- Renders ```mermaid fences as ASCII diagrams (via mermaid-ascii) while
-- render-markdown is active. The fence content lines are concealed and the
-- diagram is shown as virtual lines in their place.

-- mermaid source -> rendered lines, or false when mermaid-ascii failed.
-- Keyed by the full block text so unchanged blocks never re-run the binary.
local diagram_cache = {} ---@type table<string, string[]|false>

---@param source string
---@return string[]|false
local function render_mermaid(source)
    local cached = diagram_cache[source]
    if cached ~= nil then
        return cached
    end
    local result = vim.system({ 'mermaid-ascii', '-f', '-' }, { stdin = source, text = true }):wait(2000)
    local rendered = false ---@type string[]|false
    if result.code == 0 and result.stdout and #result.stdout > 0 then
        rendered = vim.split(result.stdout, '\n', { trimempty = true })
    else
        vim.notify('mermaid-ascii failed: ' .. (result.stderr or 'unknown error'), vim.log.levels.WARN)
    end
    diagram_cache[source] = rendered
    return rendered
end

local mermaid_query = vim.treesitter.query.parse(
    'markdown',
    [[
    (fenced_code_block
      (info_string (language) @lang)
      (code_fence_content) @content)
    ]]
)

---@param ctx render.md.handler.Context
---@return render.md.Mark[]
local function parse_mermaid_blocks(ctx)
    local marks = {} ---@type render.md.Mark[]
    for _, match in mermaid_query:iter_matches(ctx.root, ctx.buf) do
        local captured = {} ---@type table<string, TSNode>
        for id, nodes in pairs(match) do
            -- nvim 0.11 yields a node list per capture, older versions a single node.
            captured[mermaid_query.captures[id]] = type(nodes) == 'table' and nodes[1] or nodes
        end
        local lang_node, content_node = captured.lang, captured.content
        if lang_node and content_node and vim.treesitter.get_node_text(lang_node, ctx.buf) == 'mermaid' then
            local diagram = render_mermaid(vim.treesitter.get_node_text(content_node, ctx.buf))
            if diagram then
                local start_row, start_col, end_row, end_col = content_node:range()
                local indent = string.rep(' ', start_col)
                marks[#marks + 1] = {
                    conceal = true,
                    start_row = start_row,
                    start_col = start_col,
                    opts = { end_row = end_row, end_col = end_col, conceal_lines = '' },
                    replace = vim.tbl_map(function(line)
                        return { { indent .. line, 'RenderMarkdownCode' } }
                    end, diagram),
                }
            end
        end
    end
    return marks
end

return {
    'MeanderingProgrammer/render-markdown.nvim',
    dependencies = { 'nvim-treesitter/nvim-treesitter' },
    ---@module 'render-markdown'
    ---@type render.md.UserConfig
    opts = {
        enabled = false,
        anti_conceal = {
            enabled = true,
            disabled_modes = { 'n' },
        },
        custom_handlers = {
            markdown = { extends = true, parse = parse_mermaid_blocks },
        },
    },
}
