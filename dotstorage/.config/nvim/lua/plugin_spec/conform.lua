return {
    'stevearc/conform.nvim',
    config = function()
        local conform = require 'conform'

        conform.setup {
            formatters = {},
            formatters_by_ft = {
                markdown = { 'oxfmt' },
                html = { 'oxfmt' },
                css = { 'oxfmt' },
                javascript = { 'prettierd' },
                javascriptreact = { 'prettierd' },
                lua = { 'stylua' },
                perl = { 'perl' },
                php = { 'pretty-php' },
                python = { 'black' },
                typescript = { 'prettierd' },
                typescriptreact = { 'prettierd' },
                typst = { 'prettypst' },
            },
            format_on_save = {
                -- These options will be passed to conform.format()
                timeout_ms = 1000,
                lsp_format = 'fallback',
            },
        }
    end,
}
