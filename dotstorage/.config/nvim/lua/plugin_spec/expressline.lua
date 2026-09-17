return {
    'tjdevries/express_line.nvim',
    config = function()
        local env = vim.fn.environ()

        local HOME = env.HOME
        local MAX_BUFFER_NAME_LENGTH = 64
        local M = {}

        local builtin = require 'el.builtin'
        local extensions = require 'el.extensions'
        local sections = require 'el.sections'
        local subscribe = require 'el.subscribe'

        M.setup = function()
            local el = require 'el'
            --local is_tmux = vim.fn.environ().TMUX

            el.setup {
                generator = function()
                    local segments = {}

                    table.insert(segments, extensions.mode)
                    table.insert(segments, ' ')

                    --if not is_tmux then
                    --    table.insert(segments, sections.split)
                    --end

                    table.insert(segments, function(_window, buffer)
                        local name = buffer.name --[[@as string]]

                        if #name > MAX_BUFFER_NAME_LENGTH then
                            name = name:sub(1, MAX_BUFFER_NAME_LENGTH - 3) .. '...'
                        end

                        name = name:gsub(HOME .. '/', '~/')
                        return name
                    end)
                    table.insert(segments, builtin.modified)
                    table.insert(segments, sections.split)

                    table.insert(
                        segments,
                        subscribe.buf_autocmd('el-git-branch', 'BufEnter', function(win, buf)
                            local branch = extensions.git_branch(win, buf)
                            if branch then
                                return branch
                            end
                        end)
                    )
                    table.insert(segments, ' ')
                    table.insert(
                        segments,
                        subscribe.buf_autocmd('el-git-changes', 'BufWritePost', function(win, buf)
                            local changes = extensions.git_changes(win, buf)
                            if changes then
                                return changes
                            end
                        end)
                    )

                    table.insert(segments, builtin.filetype)

                    local file_encoding = vim.opt.fileencoding:get()
                    if #file_encoding > 0 then
                        table.insert(segments, '[')
                        table.insert(segments, file_encoding)
                        table.insert(segments, ']')
                        table.insert(segments, '[')
                        table.insert(segments, vim.opt.fileformat:get())
                        table.insert(segments, ']')
                    end

                    table.insert(segments, '[')
                    table.insert(segments, builtin.line_with_width(3))
                    table.insert(segments, ':')
                    table.insert(segments, builtin.column_with_width(2))
                    table.insert(segments, ']')

                    return segments
                end,
            }
        end

        M.setup()

        return M
    end,
}
