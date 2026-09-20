-- Renders ```mermaid fences as ASCII diagrams (via mermaid-ascii) while
-- render-markdown is active.
--
-- The diagram is usually taller than its source, and the cursor can only sit
-- on real buffer lines. So the source rows act as a viewport: diagram row
-- offset+N is overlaid onto source row N, rows before the viewport hang above
-- as virtual lines and rows after it hang below. j on the last source row (or
-- k on the first) slides the viewport instead of moving the cursor, so the
-- whole diagram can be walked with plain j/k.

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

---@class MermaidBlock
---@field start_row integer first source row, 0-indexed
---@field end_row integer row of the closing fence, 0-indexed (exclusive)
---@field max_offset integer diagram rows that don't fit in the source rows
---@field source string

-- Per buffer, the mermaid blocks found on the last render, keyed by start_row.
local blocks_by_buf = {} ---@type table<integer, table<integer, MermaidBlock>>
-- Per buffer, how far each block's viewport is scrolled, keyed by source text
-- so it survives edits elsewhere in the file and resets when the block changes.
local offset_by_buf = {} ---@type table<integer, table<string, integer>>

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
    local blocks = {} ---@type table<integer, MermaidBlock>
    blocks_by_buf[ctx.buf] = blocks
    local offsets = offset_by_buf[ctx.buf] or {}
    offset_by_buf[ctx.buf] = offsets

    for _, match in mermaid_query:iter_matches(ctx.root, ctx.buf) do
        local captured = {} ---@type table<string, TSNode>
        for id, nodes in pairs(match) do
            -- nvim 0.11 yields a node list per capture, older versions a single node.
            captured[mermaid_query.captures[id]] = type(nodes) == 'table' and nodes[1] or nodes
        end
        local lang_node, content_node = captured.lang, captured.content
        if lang_node and content_node and vim.treesitter.get_node_text(lang_node, ctx.buf) == 'mermaid' then
            local source = vim.treesitter.get_node_text(content_node, ctx.buf)
            local diagram = render_mermaid(source)
            if diagram then
                local start_row, start_col, end_row = content_node:range()
                local indent = string.rep(' ', start_col)
                local diagram_lines = vim.tbl_map(function(line)
                    -- Pad to the window width so the code background spans the full row.
                    local text = indent .. line
                    local padding = string.rep(' ', math.max(0, vim.o.columns - vim.fn.strdisplaywidth(text)))
                    return { { text .. padding, 'RenderMarkdownCode' } }
                end, diagram)

                local source_height = end_row - start_row
                local max_offset = math.max(0, #diagram_lines - source_height)
                local offset = math.min(offsets[source] or 0, max_offset)
                offsets[source] = offset
                blocks[start_row] = { start_row = start_row, end_row = end_row, max_offset = max_offset, source = source }

                if offset > 0 then
                    marks[#marks + 1] = {
                        conceal = true,
                        start_row = start_row,
                        start_col = 0,
                        opts = { virt_lines = vim.list_slice(diagram_lines, 1, offset), virt_lines_above = true },
                    }
                end
                local overlaid = math.min(source_height, #diagram_lines)
                for i = 1, overlaid do
                    marks[#marks + 1] = {
                        conceal = true,
                        start_row = start_row + i - 1,
                        start_col = 0,
                        opts = { virt_text = diagram_lines[offset + i], virt_text_pos = 'overlay' },
                    }
                end
                if #diagram_lines > offset + overlaid then
                    marks[#marks + 1] = {
                        conceal = true,
                        start_row = start_row + overlaid - 1,
                        start_col = 0,
                        opts = { virt_lines = vim.list_slice(diagram_lines, offset + overlaid + 1) },
                    }
                elseif source_height > overlaid then
                    marks[#marks + 1] = {
                        conceal = true,
                        start_row = start_row + overlaid,
                        start_col = 0,
                        opts = { end_row = end_row, end_col = 0, conceal_lines = '' },
                    }
                end
            end
        end
    end
    return marks
end

---@param buf integer
---@param row integer 0-indexed
---@return boolean
local function is_row_concealed(buf, row)
    local namespace = vim.api.nvim_get_namespaces()['render-markdown.nvim']
    if not namespace then
        return false
    end
    local extmarks = vim.api.nvim_buf_get_extmarks(buf, namespace, { row, 0 }, { row, -1 }, { details = true, overlap = true })
    for _, extmark in ipairs(extmarks) do
        if extmark[4].conceal_lines then
            return true
        end
    end
    return false
end

-- Slides a block's viewport by one row when the cursor is on its edge row.
-- Returns true when it did, meaning the cursor should stay put.
---@param buf integer
---@param row integer 0-indexed
---@param direction 1|-1
---@return boolean
local function scroll_diagram_viewport(buf, row, direction)
    local blocks = blocks_by_buf[buf]
    local config = require('render-markdown.state').get(buf)
    if not blocks or not config.enabled then
        return false
    end
    for _, block in pairs(blocks) do
        local on_edge = (direction == 1 and row == block.end_row - 1) or (direction == -1 and row == block.start_row)
        if on_edge then
            local offsets = offset_by_buf[buf]
            local next_offset = offsets[block.source] + direction
            if next_offset >= 0 and next_offset <= block.max_offset then
                offsets[block.source] = next_offset
                -- The plugin's debounce drops renders that arrive within 100ms of the
                -- last one, which makes held-down j look stuck. Bypass it for this one.
                local debounce = config.debounce
                config.debounce = 0
                require('render-markdown.api').render({ buf = buf })
                config.debounce = debounce
                return true
            end
            return false
        end
    end
    return false
end

-- j/k that walk rendered diagrams row by row and treat concealed lines
-- (e.g. hidden closing fences) as if they weren't there.
---@param buf integer
---@param direction 1|-1
local function move_over_concealed(buf, direction)
    local line_count = vim.api.nvim_buf_line_count(buf)
    local cursor = vim.api.nvim_win_get_cursor(0)
    local row = cursor[1] - 1
    for _ = 1, vim.v.count1 do
        if scroll_diagram_viewport(buf, row, direction) then
            break
        end
        row = row + direction
        while row >= 0 and row < line_count and is_row_concealed(buf, row) do
            row = row + direction
        end
    end
    if row >= 0 and row < line_count then
        vim.api.nvim_win_set_cursor(0, { row + 1, cursor[2] })
    end
end

-- Line numbers counted in j/k presses instead of buffer lines: virtual lines
-- (diagram rows, wrapped tables) get a number too, wrapped continuations don't.
---@param win integer
---@param from_lnum integer 1-indexed, exclusive
---@param to_lnum integer 1-indexed, inclusive
---@return integer virtual lines shown before the text of lines from+1..to
local function virtual_rows_between(win, from_lnum, to_lnum)
    return vim.api.nvim_win_text_height(win, { start_row = from_lnum, end_row = to_lnum - 1 }).fill
end

-- Lines hidden by conceal_lines take no screen row and j/k skip them.
---@param buf integer
---@param from_lnum integer 1-indexed, exclusive
---@param to_lnum integer 1-indexed, inclusive
---@return integer
local function concealed_rows_between(buf, from_lnum, to_lnum)
    local first_row, last_row = from_lnum, to_lnum - 1
    local count = 0
    local extmarks = vim.api.nvim_buf_get_extmarks(buf, -1, { first_row, 0 }, { last_row, -1 }, { details = true, overlap = true })
    for _, extmark in ipairs(extmarks) do
        local details = extmark[4]
        if details.conceal_lines then
            local mark_first, mark_last = extmark[2], details.end_row or extmark[2]
            if mark_last > mark_first and details.end_col == 0 then
                mark_last = mark_last - 1
            end
            local overlap = math.min(mark_last, last_row) - math.max(mark_first, first_row) + 1
            if overlap > 0 then
                count = count + overlap
            end
        end
    end
    return count
end

-- Row of lnum's text, relative to the cursor line's text row.
---@param win integer
---@param cursor_lnum integer
---@param lnum integer
---@return integer
local function row_offset(win, cursor_lnum, lnum)
    local buf = vim.api.nvim_win_get_buf(win)
    if lnum > cursor_lnum then
        return (lnum - cursor_lnum) + virtual_rows_between(win, cursor_lnum, lnum) - concealed_rows_between(buf, cursor_lnum, lnum)
    elseif lnum < cursor_lnum then
        return -((cursor_lnum - lnum) + virtual_rows_between(win, lnum, cursor_lnum) - concealed_rows_between(buf, lnum, cursor_lnum))
    end
    return 0
end

---@return string
function _G.RenderMarkdownStatusColumn()
    local win = vim.g.statusline_winid or vim.api.nvim_get_current_win()
    local lnum, virtnum = vim.v.lnum, vim.v.virtnum
    if virtnum > 0 then
        return '%s%= ' -- wrapped continuation, blank like the builtin number column
    end
    local cursor_lnum = vim.api.nvim_win_get_cursor(win)[1]
    if virtnum == 0 and lnum == cursor_lnum then
        return '%s%=%#CursorLineNr#' .. lnum .. ' '
    end
    local row = row_offset(win, cursor_lnum, lnum)
    if virtnum < 0 then
        -- v:virtnum counts -N..-1 for both the virtual lines above a line and the ones
        -- below it, so use the mark data to tell which side this one is on.
        local buf = vim.api.nvim_win_get_buf(win)
        local above, total = 0, 0
        local extmarks = vim.api.nvim_buf_get_extmarks(buf, -1, { lnum - 1, 0 }, { lnum - 1, -1 }, { details = true })
        for _, extmark in ipairs(extmarks) do
            local count = extmark[4].virt_lines and #extmark[4].virt_lines or 0
            total = total + count
            if extmark[4].virt_lines_above then
                above = above + count
            end
        end
        if -virtnum <= above then
            row = row + virtnum
        else
            row = row + 1 + (total - above) + virtnum
        end
    end
    return '%s%=%#LineNr#' .. math.abs(row) .. ' '
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
        win_options = {
            statuscolumn = { default = vim.o.statuscolumn, rendered = '%{%v:lua.RenderMarkdownStatusColumn()%}' },
        },
        custom_handlers = {
            markdown = { extends = true, parse = parse_mermaid_blocks },
        },
        on = {
            attach = function(ctx)
                for key, direction in pairs({ j = 1, k = -1 }) do
                    vim.keymap.set('n', key, function()
                        move_over_concealed(ctx.buf, direction)
                    end, { buffer = ctx.buf, desc = 'render-markdown: walk diagrams, skip concealed lines' })
                end
            end,
        },
    },
}
