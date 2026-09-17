return {
    'nvim-treesitter/nvim-treesitter',
    branch = 'main',
    build = ':TSUpdate',
    priority = 1000,
    dependencies = {},
    config = function()
        local nvim_treesitter = require 'nvim-treesitter'

        nvim_treesitter.setup {}

        local ensure_installed = {
            'lua',
            'javascript',
            'typescript',
            'perl',
            'tsx',
            'rust',
            'php',
            'html',
            'python',
            'markdown',
            'markdown_inline',
            'sql',
            'bash',
            'just',
        }

        nvim_treesitter.install(ensure_installed)

        -- On the `main` branch highlighting and indentation are provided by
        -- Neovim core; the plugin only ships parsers and queries. Start them
        -- per buffer, guarding filetypes that have no installed parser.
        vim.api.nvim_create_autocmd('FileType', {
            desc = 'Enable treesitter highlighting and indentation',
            callback = function(args)
                if not pcall(vim.treesitter.start, args.buf) then
                    return
                end
                vim.bo[args.buf].indentexpr = "v:lua.require'nvim-treesitter'.indentexpr()"
            end,
        })
    end,
}
