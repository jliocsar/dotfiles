return {
    'folke/todo-comments.nvim',
    dependencies = { 'nvim-lua/plenary.nvim' },
    config = function()
        local todo_comments = require 'todo-comments'

        -- TODO: Hello

        -- TODO(@jliocsar): Hello

        -- NOTE(@jliocsar): Hello

        -- WARN(@jliocsar): Hello

        -- PERF(@jliocsar): Hello

        -- HACK(@jliocsar): Hello

        -- TEST(@jliocsar): Hello

        -- FIXME(@jliocsar): Hello

        todo_comments.setup {
            search = { pattern = [[\b(KEYWORDS)(\([^\)]*\))?:]] },
            highlight = { pattern = [[.*<((KEYWORDS)%(\(.{-1,}\))?):]] },
            keywords = {
                FIX = {
                    icon = ' ', -- icon used for the sign, and in search results
                },
                TODO = { icon = ' ' },
                HACK = { icon = ' ' },
                WARN = { icon = ' ' },
                PERF = { icon = ' ' },
                NOTE = { icon = ' ' },
                TEST = { icon = ' ' },
            },
        }
    end,
}
