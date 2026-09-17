local env = vim.fn.environ()

local HOME = env.HOME

return {
    {
        'zenbones-theme/zenbones.nvim',
        dependencies = {
            'rktjmp/lush.nvim',
        },
        -- Parked in favour of Delta One (plugin_spec/onedark.lua); flip both
        -- `enabled` flags and the lazy `install.colorscheme` to come back.
        enabled = false,
        lazy = false,
        priority = 999,
        config = function()
            vim.g.zenbones = {
                transparent_background = true,
                italic_strings = false,
                italic_comments = false,
            }

            local state_file = (env.XDG_STATE_HOME or (HOME .. '/.local/state'))
                .. '/theme/mode'

            -- Canonical mode lives in the state file written by the `theme`
            -- command; default to dark when it hasn't been set yet.
            local function read_mode()
                local fd = io.open(state_file, 'r')
                if not fd then
                    return 'dark'
                end
                local mode = (fd:read 'l' or ''):gsub('%s+', '')
                fd:close()
                if mode == 'light' then
                    return 'light'
                end
                return 'dark'
            end

            local function apply(mode)
                vim.o.background = mode
                vim.cmd [[colorscheme zenbones]]
                package.loaded['customize_zenbones'] = nil
                require 'customize_zenbones'
            end

            apply(read_mode())

            -- Live switching: watch the state dir and re-apply when the mode flips.
            local uv = vim.uv or vim.loop
            local state_dir = vim.fn.fnamemodify(state_file, ':h')
            vim.fn.mkdir(state_dir, 'p')
            local watcher = uv.new_fs_event()
            if watcher then
                watcher:start(state_dir, {}, function(err)
                    if err then
                        return
                    end
                    vim.schedule(function()
                        apply(read_mode())
                    end)
                end)
            end
        end,
    },
    --{
    --    'rebelot/kanagawa.nvim',
    --    config = function()
    --        local kanagawa = require 'kanagawa'

    --        kanagawa.setup {
    --            transparent = true,
    --            theme = 'dragon',
    --            background = {
    --                dark = 'dragon',
    --            },
    --            colors = {
    --                theme = {
    --                    all = {
    --                        ui = {
    --                            bg_gutter = 'none',
    --                        },
    --                    },
    --                },
    --            },
    --        }

    --        vim.cmd [[colorscheme kanagawa]]
    --    end,
    --},
}
