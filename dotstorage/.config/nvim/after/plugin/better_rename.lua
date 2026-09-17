---@param current_name string
--[[
local function create_rename_window(current_name)
    local buf = vim.api.nvim_create_buf(false, true)
    vim.api.nvim_buf_set_lines(buf, 0, -1, false, { current_name })

    local name_len = #current_name
    local _, cursor_column = unpack(vim.api.nvim_win_get_cursor(0))
    cursor_column = cursor_column + 1

    local win = vim.api.nvim_open_win(buf, true, {
        title = 'Rename',
        relative = 'cursor',
        width = name_len + 10,
        height = 1,
        col = 0,
        row = 1,
        border = { '┌', '─', '┐', '│', '┘', '─', '└', '│' },
        focusable = true,
        fixed = true,
    })

    vim.api.nvim_set_option_value('buftype', 'nofile', { buf = buf })
    vim.api.nvim_set_option_value('bufhidden', 'delete', { buf = buf })
    vim.api.nvim_set_option_value('swapfile', false, { buf = buf })
    vim.api.nvim_set_option_value('textwidth', 0, { buf = buf })
    vim.api.nvim_set_option_value('formatoptions', '', { buf = buf })

    vim.api.nvim_set_option_value('number', false, { win = win })
    vim.api.nvim_set_option_value('relativenumber', false, { win = win })
    vim.api.nvim_set_option_value('wrap', false, { win = win })
    vim.api.nvim_set_option_value('linebreak', false, { win = win })

    vim.keymap.set({ 'i', 'n' }, '<CR>', function()
        local to = vim.api.nvim_get_current_line()

        vim.api.nvim_win_close(win, true)

        vim.schedule(function()
            vim.lsp.buf.rename(to)
        end)
    end, { buffer = buf, nowait = true })
end

local ts_utils = require 'nvim-treesitter.ts_utils'

-- ## Rename the symbol
vim.keymap.set('n', '<leader>r', function()
    local node = ts_utils.get_node_at_cursor()
    local name = vim.treesitter.get_node_text(node, 0)
    local node_type = node:type()
    local is_identifier = string.find(node_type, 'identifier')

    if is_identifier then
        return
    end

    create_rename_window(name)
end, { noremap = true, silent = true })
--]]
