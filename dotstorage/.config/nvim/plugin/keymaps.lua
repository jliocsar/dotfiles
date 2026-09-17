local dotfiles = require 'custom.dotfiles'

-- # Context
local set = vim.keymap.set

---# Panes
---set('n', '<c-j>', '<c-w><c-j>')
---set('n', '<c-k>', '<c-w><c-k>')
---set('n', '<c-l>', '<c-w><c-l>')
---set('n', '<c-h>', '<c-w><c-h>')

-- # Utils
set('n', '<leader>pa', [[<cmd>echo expand('%:p')<CR>]], {
    desc = 'Prints the current file absolute path',
})
set('n', '<leader>ps', [[<cmd>echo v:servername<CR>]], {
    desc = 'Prints the socket path',
})
set('n', '<leader>ca', function()
    local abs_path = vim.fn.expand '%:p'
    vim.fn.setreg('+', abs_path)
    print('Copied to clipboard: ' .. abs_path)
end, {
    desc = 'Copies the current file absolute path to clipboard',
})
set('n', '<leader>cr', function()
    local rel_path = vim.fn.expand '%:p'
    local starting_dir = dotfiles.starting_dir
    assert(starting_dir, 'starting_dir is not set in dotfiles module')

    starting_dir = starting_dir:gsub('(%W)', '%%%1')

    rel_path = rel_path:gsub(starting_dir .. '/', '')
    vim.fn.setreg('+', rel_path)

    print('Copied to clipboard: ' .. rel_path)
end, {
    desc = 'Copies the current file relative path to clipboard',
})
set('n', '<leader>cs', function()
    local servername = vim.v.servername
    vim.fn.setreg('+', servername)
    print('Copied to clipboard: ' .. servername)
end, {
    desc = 'Copies the socket path to clipboard',
})

-- # Plugins
-- Just for an easy life interacting with these
-- ## Lazy
set('n', '<leader>ll', '<cmd>Lazy<CR>', { desc = 'Opens Lazy', noremap = true })
-- ## Mason
set('n', '<leader>m', '<cmd>Mason<CR>', { desc = 'Opens Mason', noremap = true })

set({ 'n', 'v' }, '<leader>x', '<cmd>.lua<CR>', { desc = 'Execute the current selected lines' })
set('n', '<leader>so', '<cmd>source %<CR>', { desc = 'Execute the current file' })

set('n', '<leader>sm', '<cmd>RenderMarkdown buf_toggle<CR>', { desc = 'Toggles render-markdown' })

-- # Buffers
-- ## Save/write/exit buffer
set('n', '<leader>w', '<cmd>w<CR>', { desc = 'Save current buffer' })
set('n', '<leader>Q', '<cmd>q<CR>', { desc = 'Quits nvim' })
-- ## Cycle between opened buffers
--    These shouldn't really be a thing here but I like having not to hit : and confirm the command so idk
--    Skill issue I guess
set('n', '<leader>bn', '<cmd>bn<CR>', { desc = 'Next buffer' })
set('n', '<leader>bp', '<cmd>bp<CR>', { desc = 'Previous buffer' })
set('n', '<leader>bd', '<cmd>bd<CR>', { desc = 'Deletes the current buffer' })
set('n', '<leader>qq', '<cmd>bd<CR>', { desc = 'Deletes the current buffer' })

-- # Tabs
-- ## Change tabs
set('n', '<leader>tc', '<cmd>tabnew<CR>', { desc = 'New tab' })
set('n', '<leader>tn', '<cmd>tabnext<CR>', { desc = 'Next tab' })
set('n', '<leader>tp', '<cmd>tabprevious<CR>', { desc = 'Previous tab' })

-- ## Clear highlights
set('n', '<leader>ch', '<cmd>noh<CR>', { desc = 'Clear highlights' })

-- ## Shows all errors in the current buffer
set('n', '<leader>le', vim.diagnostic.setloclist, { noremap = true })
-- ## Open floating window with the cursor error
set('n', '<leader>e', vim.diagnostic.open_float, { noremap = true, silent = true })
-- ## Shows the hints from types etc
set('n', '<leader>tt', function()
    vim.lsp.inlay_hint.enable(not vim.lsp.inlay_hint.is_enabled { bufnr = 0 }, { bufnr = 0 })
end)

-- # LSP
set('i', '<c-space>', vim.lsp.completion.get)

-- # Quickfix
set('n', ']]', '<cmd>cnext<CR>', { silent = true })
set('n', '[[', '<cmd>cprev<CR>', { silent = true })
set('n', '<leader>qf', function()
    if vim.bo.buftype == 'quickfix' then
        vim.cmd [[cclose]]
    else
        vim.cmd [[copen]]
    end
end, { silent = true })
set('n', '<leader>qc', function()
    vim.fn.setqflist {}
end, { silent = true })

-- # Awesome commands
set({ 'n', 'v' }, '<leader>X', function()
    local start_pos = vim.fn.getpos 'v'
    local end_pos = vim.fn.getpos '.'
    local selection_lines = vim.fn.getregion(start_pos, end_pos)
    local res = table.concat(selection_lines, '\n')

    res = vim.fn.system(res)

    local current_buf = vim.api.nvim_get_current_buf()

    vim.api.nvim_buf_set_lines(
        current_buf,
        vim.api.nvim_win_get_cursor(0)[1] + 1,
        vim.api.nvim_win_get_cursor(0)[1] + 1,
        false,
        vim.split(res, '\n')
    )
end, {
    desc = 'Execute current line in shell',
    noremap = true,
})
