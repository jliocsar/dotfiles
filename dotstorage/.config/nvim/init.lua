vim.g.mapleader = ' '
vim.g.db_adapter_spanner = 'db#adapter#spanner#'

local lazypath = vim.fn.stdpath 'data' .. '/lazy/lazy.nvim'

if not (vim.uv or vim.loop).fs_stat(lazypath) then
    local lazyrepo = 'https://github.com/folke/lazy.nvim.git'
    local out = vim.fn.system {
        'git',
        'clone',
        '--filter=blob:none',
        '--branch=stable',
        lazyrepo,
        lazypath,
    }
    if vim.v.shell_error ~= 0 then
        vim.api.nvim_echo({
            { 'Failed to clone lazy.nvim:\n', 'ErrorMsg' },
            { out, 'WarningMsg' },
            { '\nPress any key to exit...' },
        }, true, {})
        vim.fn.getchar()
        os.exit(1)
    end
end

vim.opt.rtp:prepend(lazypath)

local lazy = require 'lazy'

lazy.setup {
    spec = {
        { import = 'plugin_spec/' },
    },
    change_detection = {
        enabled = true,
        notify = true,
    },
    checker = {
        enabled = true,
    },
    install = {
        colorscheme = { 'onedark' },
        --colorscheme = { 'zenbones' },
    },
    ui = {
        border = 'single',
        backdrop = 100,
        icons = {
            cmd = '',
            config = '',
            event = '',
            ft = '',
            init = '',
            import = '',
            keys = '',
            plugin = '󰏗',
            runtime = '󰍹',
            source = '',
            start = '',
            task = '󰅌',
            list = {
                plugins = '󰏗',
                runtime = '󰍹',
                config = '',
                mason = '󰣪',
            },
        },
    },
}
