local dotfiles = require 'custom.dotfiles'

return {
    'stevearc/oil.nvim',
    config = function()
        local starting_dir = dotfiles.starting_dir
        local oil = require 'oil'
        local oil_actions = require 'oil.actions'

        local function oil_get_current_dir_without_trailing_slash()
            local current_dir = oil.get_current_dir()

            if not current_dir then
                return nil
            end

            return current_dir:gsub('%/$', '')
        end

        local function oil_is_in_starting_dir()
            local current_dir = oil_get_current_dir_without_trailing_slash()

            if not current_dir then
                return false
            end

            return current_dir == starting_dir
        end

        oil.setup {
            columns = {
                {
                    'mtime',
                    highlight = 'Comment',
                },
                {
                    'type',
                    highlight = 'Type',
                    icons = {
                        file = ' ',
                        directory = ' ',
                        link = '󱒄 ',
                    },
                },
            },
            delete_to_trash = true,
            keymaps = {
                ['<C-h>'] = {},
                ['<C-j>'] = {},
                ['<C-k>'] = {},
                ['<C-l>'] = {},
                ['-'] = {
                    function()
                        if oil_is_in_starting_dir() then
                            return
                        end

                        return oil_actions.parent.callback()
                    end,
                    mode = 'n',
                },
            },
            view_options = {
                show_hidden = true,
                is_always_hidden = function(name, bufnr)
                    if name ~= '..' then
                        return false
                    end

                    return oil_is_in_starting_dir()
                end,
            },
        }

        -- Open parent directory in floating window
        vim.keymap.set('n', '-', oil.open)
        vim.keymap.set('n', '<leader>-', function()
            if oil_is_in_starting_dir() then
                return
            end

            vim.cmd [[40vsplit | Oil]]
        end)
    end,
}
