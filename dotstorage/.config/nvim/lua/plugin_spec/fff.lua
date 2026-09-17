local dotfiles = require 'custom.dotfiles'
local starting_dir = dotfiles.starting_dir

-- Two things fff computes in ways its config can't reach, fixed up once the
-- windows exist. fff only recomputes its layout on `VimResized`, so these stick
-- for the life of the picker but are lost if the terminal is resized.
local function apply_ivy_window_tweaks()
    local picker_state = require('fff.picker_ui.picker_ui_state').state

    -- Telescope centres the picker title on the top border; fff hardcodes
    -- `title_pos` to the left.
    local input_win = picker_state.input_win

    if input_win and vim.api.nvim_win_is_valid(input_win) then
        local input_config = vim.api.nvim_win_get_config(input_win)

        if input_config.title then
            input_config.title_pos = 'center'
            vim.api.nvim_win_set_config(input_win, input_config)
        end
    end

    -- fff seats the list at `input_row + 2`, leaving a border row between the
    -- prompt and the first result that Telescope doesn't have. Pulling the list
    -- up one row closes it; the list's own top border lands on the prompt's text
    -- row, where the higher-zindex prompt hides it. Height is left alone so the
    -- list can't overrun the bottom of the pane -- results fill downwards, so the
    -- freed row at the bottom stays empty.
    local list_win = picker_state.list_win

    if list_win and vim.api.nvim_win_is_valid(list_win) then
        local list_config = vim.api.nvim_win_get_config(list_win)

        list_config.row = list_config.row - 1
        vim.api.nvim_win_set_config(list_win, list_config)
    end
end

-- Telescope marks the selected row with a caret in the gutter. fff spends that
-- gutter on git status signs, so hide the signs and draw the caret in their place.
local function build_ivy_renderer()
    local file_renderer = require 'fff.picker_ui.file_renderer'

    return {
        render_line = file_renderer.render_line,
        apply_highlights = function(item, ctx, item_idx, buf, ns_id, line_idx, line_content)
            -- The default renderer draws a git sign for any item carrying a
            -- status, so hide the status to leave the gutter free.
            local item_without_git_status = vim.tbl_extend('force', {}, item)
            item_without_git_status.git_status = nil

            file_renderer.apply_highlights(
                item_without_git_status,
                ctx,
                item_idx,
                buf,
                ns_id,
                line_idx,
                line_content
            )

            if ctx.cursor ~= item_idx then
                return
            end

            vim.api.nvim_buf_set_extmark(buf, ns_id, line_idx - 1, 0, {
                sign_text = '>',
                sign_hl_group = 'TelescopeSelectionCaret',
                -- Outranks fff's own git (1000) and multi-select (1001) signs
                priority = 1002,
            })
        end,
    }
end

local function find_files()
    require('fff').find_files {
        cwd = starting_dir,
        renderer = build_ivy_renderer(),
    }
    apply_ivy_window_tweaks()
end

local function live_grep(extra_opts)
    return function()
        local grep_opts = vim.tbl_deep_extend('force', { cwd = starting_dir }, extra_opts or {})

        require('fff').live_grep(grep_opts)
        apply_ivy_window_tweaks()
    end
end

return {
    'dmtrKovalenko/fff.nvim',
    build = function()
        -- downloads a prebuilt binary or falls back to cargo build
        require('fff.download').download_or_build_binary()
    end,
    -- for nixos:
    -- build = "nix run .#release",
    -- Mirrors Telescope's `ivy` theme: a full-width pane docked to the bottom of
    -- the editor, prompt on top, results below.
    opts = {
        prompt = '  ',
        layout = {
            anchor = 'bottom',
            width = 1.0,
            -- `layout.height` only validates ratios, but it also accepts a function
            -- resolved against the terminal size, which is how we reach ivy's
            -- absolute 25 lines on any screen.
            height = function(_, terminal_height)
                return math.min(1, 25 / terminal_height)
            end,
            prompt_position = 'top',
            preview_position = 'right',
            preview_size = 0.5,
            -- 8 border chars (top-left, top, top-right, right, bottom-right,
            -- bottom, bottom-left, left) + 5 T-junction chars. Only the top edge
            -- draws, giving `ivy`'s single rule above the prompt. The prompt sits
            -- at a higher zindex than the list, so its blank bottom edge paints
            -- over the rule the list would otherwise draw between the two.
            border = {
                { '─', '─', '─', ' ', ' ', ' ', ' ', ' ' },
                { ' ', ' ', ' ', ' ', ' ' },
            },
            -- `false`, not `nil`: config merging drops nil keys, so nil would leave
            -- the default in place and relocate the preview on narrow terminals
            flex = false,
            min_list_height = 0,
            -- Telescope draws no scrollbar
            show_scrollbar = false,
        },
        -- Telescope's `preview.hide_on_startup`. fff has no toggle keymap, so this
        -- hides the preview for good.
        preview = {
            enabled = false,
        },
        hl = {
            -- Blend into the buffer instead of floating above it
            normal = 'Normal',
            prompt = 'Question',
            -- Telescope draws the title in the border's own colour
            title = 'FloatBorder',
            -- fff defaults to CursorLine (grey); this is the same group backing
            -- the caret, so row and caret share one background
            cursor = 'TelescopeSelection',
        },
        -- Enabling this appends a frecency indicator (🔥/⭐/✨/•) plus a score to
        -- every result, which Telescope has no equivalent of.
        debug = {
            enabled = false,
            show_scores = false,
        },
    },
    lazy = false, -- the plugin lazy-initialises itself
    keys = {
        {
            'ff',
            find_files,
            desc = 'FFFind files',
        },
        {
            'fg',
            live_grep(),
            desc = 'LiFFFe grep',
        },
        {
            'fz',
            live_grep {
                grep = {
                    modes = {
                        'fuzzy',
                        'plain',
                    },
                },
            },
            desc = 'Live fffuzy grep',
        },
        {
            'fc',
            function()
                live_grep { query = vim.fn.expand '<cword>' }()
            end,
            desc = 'Search current word',
        },
    },
}
