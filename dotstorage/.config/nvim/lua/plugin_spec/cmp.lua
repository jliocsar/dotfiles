return {
    'hrsh7th/nvim-cmp',
    dependencies = {
        'hrsh7th/cmp-nvim-lsp',
    },
    config = function()
        local lspkind = require 'lspkind'
        local cmp = require 'cmp'

        lspkind.setup {
            mode = 'symbol_text',
            preset = 'default',
            symbol_map = {
                Text = '󰉿',
                Method = '󰆧',
                Function = '󰊕',
                Constructor = '',
                Field = '󰜢',
                Variable = '󰀫',
                Class = '󰠱',
                Interface = '',
                Module = '',
                Property = '󰜢',
                Unit = '󰑭',
                Value = '󰎠',
                Enum = '',
                Keyword = '󰌋',
                Snippet = '',
                Color = '󰏘',
                File = '󰈙',
                Reference = '󰈇',
                Folder = '󰉋',
                EnumMember = '',
                Constant = '󰏿',
                Struct = '󰙅',
                Event = '',
                Operator = '󰆕',
                TypeParameter = '',
            },
        }

        local kind_formatter = lspkind.cmp_format {
            mode = 'symbol_text',
            menu = {
                buffer = '[buf]',
                nvim_lsp = '[lsp]',
                nvim_lua = '[api]',
                path = '[path]',
            },
        }

        cmp.setup {
            sources = {
                {
                    name = 'lazydev',
                    -- set group index to 0 to skip loading LuaLS completions as lazydev recommends it
                    group_index = 0,
                },
                { name = 'nvim_lsp' },
            },
            mapping = {
                ['<C-Space>'] = cmp.mapping.complete(),
                ['<C-n>'] = cmp.mapping.select_next_item { behavior = cmp.SelectBehavior.Insert },
                ['<C-p>'] = cmp.mapping.select_prev_item { behavior = cmp.SelectBehavior.Insert },
                ['<C-y>'] = cmp.mapping(
                    cmp.mapping.confirm {
                        behavior = cmp.ConfirmBehavior.Insert,
                        select = true,
                    },
                    { 'i', 'c' }
                ),
            },

            snippet = {
                expand = function(args)
                    vim.snippet.expand(args.body)
                end,
            },

            formatting = {
                fields = { 'abbr', 'kind', 'menu' },
                expandable_indicator = true,
                format = function(entry, vim_item)
                    -- Lspkind setup for icons
                    vim_item = kind_formatter(entry, vim_item)

                    -- Tailwind colorizer setup
                    --vim_item = require('tailwindcss-colorizer-cmp').formatter(entry, vim_item)

                    return vim_item
                end,
            },

            sorting = {
                priority_weight = 2,
                comparators = {
                    cmp.config.compare.offset,
                    cmp.config.compare.exact,
                    cmp.config.compare.score,
                    cmp.config.compare.recently_used,
                    cmp.config.compare.locality,
                    cmp.config.compare.kind,
                    cmp.config.compare.sort_text,
                    cmp.config.compare.length,
                    cmp.config.compare.order,
                },
            },
            window = {
                completion = cmp.config.window.bordered {
                    border = 'single',
                },
                documentation = cmp.config.window.bordered {
                    border = 'single',
                },
            },
        }

        cmp.setup.filetype({ 'sql' }, {
            sources = {
                { name = 'vim-dadbod-completion' },
                { name = 'buffer' },
            },
        })
    end,
}
