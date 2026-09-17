return {
    'goolord/alpha-nvim',
    config = function()
        local header = {
            '   ▄   ▄███▄   ████▄     ▄   ▄█ █▀▄▀█',
            '    █  █▀   ▀  █   █      █  ██ █ █ █',
            '██   █ ██▄▄    █   █ █     █ ██ █ █ █',
            '█ █  █ █▄   ▄▀ ▀████  █    █ ▐█ █   █',
            '█  █ █ ▀███▀           █▄ █   ▐    █ ',
            '█   ██                  ▐█        ▀  ',
            '                         ▌           ',
        }
        local alpha = require 'alpha'
        local dashboard = require 'alpha.themes.dashboard'

        -- Set header
        dashboard.section.header.val = header
        -- Set menu
        dashboard.section.buttons.val = {
            dashboard.button('n', '  New file', ':ene <BAR> startinsert <CR>'),
            dashboard.button('f', '  Find file', ':Telescope find_files <CR>'),
            dashboard.button('l', '󰒲  Lazy Plugin Manager', ':Lazy<CR>'),
            dashboard.button('m', '󰟾  Mason Package Manager', ':Mason<CR>'),
            dashboard.button('q', '󰩈  Quit Neovim', ':qa<CR>'),
        }
        dashboard.config.layout = {
            { type = 'padding', val = 4 },
            dashboard.section.header,
            { type = 'padding', val = 4 },
            dashboard.section.buttons,
            { type = 'padding', val = 4 },
            dashboard.section.footer,
            { type = 'padding', val = 1 },
        }

        vim.api.nvim_create_autocmd('User', {
            pattern = 'LazyVimStarted',
            callback = function()
                local lazy = require('lazy').stats()

                dashboard.section.footer.val =
                    string.format(' Loaded %d/%d plugins in %.2fms', lazy.loaded, lazy.count, lazy.startuptime)

                pcall(vim.cmd.AlphaRedraw)
            end,
        })

        alpha.setup(dashboard.config)
    end,
}
