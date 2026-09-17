local dotfiles = require 'custom.dotfiles'

return {
    'nvim-telescope/telescope.nvim',
    dependencies = {
        'nvim-lua/plenary.nvim',
        'nvim-telescope/telescope-live-grep-args.nvim',
    },
    config = function()
        local starting_dir = dotfiles.starting_dir

        local telescope = require 'telescope'
        local actions = require 'telescope.actions'
        local builtin = require 'telescope.builtin'
        local layout = require 'telescope.actions.layout'

        local set = vim.keymap.set
        local theme = 'ivy'

        telescope.setup {
            pickers = {
                buffers = {
                    mappings = {
                        n = { ['dd'] = actions.delete_buffer },
                    },
                    theme = theme,
                },
                find_files = {
                    theme = theme,
                },
                help_tags = {
                    theme = theme,
                },
                oldfiles = {
                    theme = theme,
                },
                live_grep_args = {
                    theme = theme,
                },
            },
            defaults = {
                history = {
                    path = '~/.local/share/nvim/databases/telescope_history.sqlite3',
                    limit = 100,
                },
                prompt_prefix = '  ',
                mappings = {
                    n = {
                        ['<leader>fp'] = layout.toggle_preview,
                    },
                    i = {
                        ['<C-c>'] = { '<esc>', type = 'command' },
                    },
                },
                preview = {
                    hide_on_startup = true,
                },
            },
            extensions = {
                wrap_results = true,
                fzf = {},
            },
        }

        telescope.load_extension 'live_grep_args'

        local opts = {
            cwd = starting_dir,
        }

        ---@generic T
        ---@param cmd_fn T
        local function with_opts(cmd_fn, extra_opts)
            return function()
                extra_opts = extra_opts or {}

                local cmd_opts = vim.tbl_deep_extend('force', {}, opts, extra_opts)

                cmd_fn(cmd_opts)
            end
        end

        -- superseded by fff
        --set('n', '<leader>ff', with_opts(builtin.find_files), { desc = 'Telescope find files' })
        set('n', '<leader>fb', with_opts(builtin.buffers), { desc = 'Telescope buffers' })
        -- GOATED use more
        set('n', '<leader>fh', with_opts(builtin.help_tags), { desc = 'Telescope help tags' })
        set('n', '<leader>fo', function()
            builtin.oldfiles { theme = theme }
        end, { desc = 'Telescope old files' })
        -- Drop the builtin `live_grep` from Telescope by the `live_grep_args` one from the extension
        -- This will make so we can filter files etc. while grepping
        --set('n', '<leader>fg', with_auto_resume(builtin.live_grep), { desc = 'Telescope live grep' })
        -- superseded by fff
        --set(
        --    'n',
        --    '<leader>fg',
        --    with_opts(telescope.extensions.live_grep_args.live_grep_args, { theme = theme }),
        --    { desc = 'Telescope live grep with args' }
        --)
    end,
}
