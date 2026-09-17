local dotfiles = require 'custom.dotfiles'

---@param val string
---@return string
local function dedent(val)
    return val
end

---@param file_path string
local function get_lua_markdown(file_path)
    local file_content = vim.fn.readfile(file_path) --[[@as table<string>]]
    local formatted_content = ''
    local code_block = ''

    for _, line in pairs(file_content) do
        line = line --[[@as string]]

        if line:gsub('^%s+', ''):gsub('%s+$', '') == '' then
            goto continue
        end

        local is_comment = line:sub(1, 2) == '--'
        local is_empty_line = line:gsub('%s+', '') == ''

        if is_comment then
            if #code_block > 0 then
                formatted_content = formatted_content .. code_block .. '```\n'
                code_block = ''
            end

            local content_candidate = line
                -- remove starting comment markers
                :gsub('^%-%-%s+', '')
                -- remove long comment markers
                :gsub('^%-%-%[%[%s+', '')
                -- replace ending long comment markers with separator
                :gsub('%-%-%]%]%s*', '---')

            local head = content_candidate:sub(1, 1)

            if head ~= '-' then
                formatted_content = formatted_content .. '\n' .. content_candidate .. '\n'
            end
        elseif is_empty_line then
            if #code_block > 0 then
                formatted_content = formatted_content .. code_block .. '```'
                code_block = ''
            end

            formatted_content = formatted_content .. '\n'
        elseif #code_block > 0 then
            code_block = code_block .. line .. '\n'
        else
            code_block = '\n```lua\n' .. line .. '\n'
        end

        ::continue::
    end

    if #code_block > 0 then
        code_block = dedent(code_block)
        formatted_content = formatted_content .. code_block .. '```\n'
    end

    return formatted_content
end

---@param text string
local function create_markdown_output_window(text)
    -- Trim text before showing
    text = text:gsub('^%s+', ''):gsub('%s$', '')

    local buf = vim.api.nvim_create_buf(false, true)
    vim.api.nvim_buf_set_lines(buf, 0, 0, false, vim.split(text, '\n'))

    local win = vim.api.nvim_open_win(buf, true, {
        relative = 'editor',
        -- Center the window
        width = 160,
        height = 30,
        col = vim.o.columns / 2 - 80,
        row = vim.o.lines / 2 - 15,
        border = { '┌', '─', '┐', '│', '┘', '─', '└', '│' },
        focusable = true,
    })

    vim.api.nvim_set_option_value('modifiable', false, { buf = buf })
    vim.api.nvim_set_option_value('buftype', 'nofile', { buf = buf })
    vim.api.nvim_set_option_value('bufhidden', 'delete', { buf = buf })
    vim.api.nvim_set_option_value('filetype', 'markdown', { buf = buf })
    vim.api.nvim_set_option_value('swapfile', false, { buf = buf })
    vim.api.nvim_set_option_value('number', false, { win = win })
    vim.api.nvim_set_option_value('relativenumber', false, { win = win })
end

local ConfigFilePath = {
    better_rename = '/after/plugin/better_rename.lua',
    block_context_inline_hint = '/after/plugin/block_context_inline_hint.lua',
    dotfiles = '/after/plugin/dotfiles.lua',
    neovide = '/after/plugin/neovide.lua',
    filetypes = '/plugin/filetypes.lua',
    keymaps = '/plugin/keymaps.lua',
    options = '/plugin/options.lua',
}

local config_file_path_keys = {}

for key, _ in pairs(ConfigFilePath) do
    table.insert(config_file_path_keys, key)
end

vim.api.nvim_create_user_command('Dotfiles', function(opts)
    local command = opts.args
    local config_file_path = ConfigFilePath[command]

    if not config_file_path then
        return
    end

    local file_path = dotfiles.NVIM_CONFIG_ROOT .. config_file_path
    local keymaps_content = get_lua_markdown(file_path)

    create_markdown_output_window(keymaps_content)
end, {
    desc = 'W.I.P.',
    nargs = 1,
    complete = function()
        return config_file_path_keys
    end,
    -- complete = 'file', -- Suggests filenames as arguments
})
