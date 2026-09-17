return {
    {
        'folke/lazydev.nvim',
        ft = 'lua',
        opts = {
            library = {
                'lazy.nvim',
                { path = '${3rd}/luv/library', words = { 'vim%.uv' } },
                'LazyVim',
            },
        },
        config = function()
            local lazydev = require 'lazydev'
            lazydev.setup()
        end,
    },
    {
        'hrsh7th/nvim-cmp',
        opts = function(_, opts)
            opts.sources = opts.sources or {}
            table.insert(opts.sources, {
                name = 'lazydev',
                group_index = 0,
            })
        end,
    },
}
