local env = vim.fn.environ()

-- The `theme` command writes the canonical dark/light mode here; onedark.nvim
-- has no notion of `vim.o.background`, so each mode maps to a named style.
local state_file = (env.XDG_STATE_HOME or (env.HOME .. '/.local/state')) .. '/theme/mode'

local styles = {
    dark = 'darker',
    light = 'light',
}

-- Delta One tokens, lifted 1:1 from Delta's bundled theme (themes/delta-one.json
-- inside the Delta binary). Keys are the Zed theme names, minus the dots.
-- Alpha-blended Zed colors (selection, search, mode pills) are pre-composited
-- over the editor background here because terminals can't blend.
local tokens = {
    dark = {
        bg = '#191C1F', -- editor.background
        bg_panel = '#202327', -- panel.background
        bg_surface = '#22252A', -- surface / elevated_surface.background
        bg_active_line = '#21252A', -- editor.active_line.background
        bg_hover = '#272A2F', -- element.hover
        bg_selected = '#2C2F35', -- element.selected
        border = '#32363E',
        border_selected = '#293B5B',
        text = '#DCE0E5',
        text_muted = '#A9AFBC',
        text_placeholder = '#878A98',
        editor_fg = '#ACB2BE',
        line_nr = '#4E5A5F',
        line_nr_active = '#D0D4DA',
        accent = '#74ADE8',

        comment = '#5D636F',
        comment_doc = '#878E98',
        keyword = '#B477CF',
        func = '#73ADE9',
        type = '#6EB4BF',
        string = '#A1C181',
        string_escape = '#878E98',
        number = '#BF956A', -- number, boolean, string.special, variable.special
        constant = '#DFC184',
        property = '#D07277',
        operator = '#6EB4BF',
        punctuation = '#B2B9C6',
        punctuation_special = '#B1574B',
        title = '#D07277',
        tag = '#74ADE8', -- tag, attribute, label
        namespace = '#DCE0E5',
        variable = '#ACB2BE',
        link_uri = '#6EB4BF',

        error = '#FF928A',
        warning = '#DEC184',
        info = '#74ADE8',
        hint = '#788CA6',
        created = '#A1C181',
        modified = '#DEC184',
        deleted = '#D07277',
        diff_plus = '#98C379',
        diff_minus = '#E06C75',
        diff_added_bg = '#1F2E25',
        diff_deleted_bg = '#381E23',
        diff_changed_bg = '#222A33', -- info.background over bg
        diff_text_bg = '#293B5B',

        selection = '#2F3F4F', -- players[0].selection over bg
        search = '#3D566F', -- search.match_background over bg
        search_active = '#6C5741', -- search.active_match_background over bg
        dim_red = '#A7545A',
        dim_yellow = '#B8985B',
        dim_cyan = '#3C818A',
        dim_magenta = '#8D54A0',

        -- Mode pills: created/keyword/deleted/number at 30% over bg.
        mode_insert = '#424E3C',
        mode_command = '#473754',
        mode_replace = '#503639',
        leap = '#4B4035',

        ansi = {
            '#282C34', '#E06C75', '#98C379', '#E5C07B', '#61AFEF', '#C678DD', '#56B6C2', '#ABB2BF',
            '#636D83', '#EA858B', '#AAD581', '#FFD885', '#85C1FF', '#D398EB', '#6ED5DE', '#FAFAFA',
        },
    },
    light = {
        bg = '#FAFAFA',
        bg_panel = '#EBEBEC',
        bg_surface = '#EBEBEC',
        bg_active_line = '#EBEBEC',
        bg_hover = '#DFDFE0',
        bg_selected = '#DADBDD',
        border = '#C9C9CA',
        border_selected = '#CBCDF6',
        text = '#242529',
        text_muted = '#58585A',
        text_placeholder = '#7E8086',
        editor_fg = '#242529',
        line_nr = '#B4B4BB',
        line_nr_active = '#44454B',
        accent = '#5C78E2',

        comment = '#A2A3A7',
        comment_doc = '#7C7E86',
        keyword = '#A449AB',
        func = '#5B79E3',
        type = '#3882B7',
        string = '#649F57',
        string_escape = '#7C7E86',
        number = '#AD6E25',
        constant = '#C18401',
        property = '#D3604F',
        operator = '#3882B7',
        punctuation = '#4D4F52',
        punctuation_special = '#B92B46',
        title = '#D3604F',
        tag = '#5C78E2',
        namespace = '#242529',
        variable = '#242529',
        link_uri = '#3882B7',

        error = '#D03A42',
        warning = '#A48819',
        info = '#5C78E2',
        hint = '#7274A7',
        created = '#669F59',
        modified = '#A48819',
        deleted = '#D36151',
        diff_plus = '#50A14F',
        diff_minus = '#E45649',
        diff_added_bg = '#CDE4D6',
        diff_deleted_bg = '#E6D1D5',
        diff_changed_bg = '#EEEEFC',
        diff_text_bg = '#CBCDF6',

        selection = '#D4DBF4',
        search = '#BBC6F0',
        search_active = '#E9DAA4',
        dim_red = '#9C2B26',
        dim_yellow = '#A48C5A',
        dim_cyan = '#0A7B92',
        dim_magenta = '#6A006A',

        mode_insert = '#CEDFCA',
        mode_command = '#E0C5E2',
        mode_replace = '#EECCC7',
        leap = '#E3D0BA',

        ansi = {
            '#000000', '#DE3E35', '#3F953A', '#D2B67C', '#2F5AF3', '#950095', '#0997B3', '#BBBBBB',
            '#000000', '#DE3E35', '#3F953A', '#D2B67C', '#2F5AF3', '#A00095', '#0BBCD6', '#FFFFFF',
        },
    },
}

-- onedark.nvim palette slots, filled from the Delta tokens so every group the
-- plugin defines (plugins included) already lands on the Delta palette.
local function palette(t)
    return {
        black = t.bg,
        bg0 = t.bg,
        bg1 = t.bg_surface,
        bg2 = t.bg_hover,
        bg3 = t.bg_selected,
        bg_d = t.bg_panel,
        bg_blue = t.accent,
        bg_yellow = t.warning,
        fg = t.editor_fg,
        purple = t.keyword,
        green = t.string,
        orange = t.number,
        blue = t.func,
        yellow = t.constant,
        cyan = t.type,
        red = t.property,
        grey = t.comment,
        light_grey = t.text_placeholder,
        dark_cyan = t.dim_cyan,
        dark_red = t.dim_red,
        dark_yellow = t.dim_yellow,
        dark_purple = t.dim_magenta,
        diff_add = t.diff_added_bg,
        diff_delete = t.diff_deleted_bg,
        diff_change = t.diff_changed_bg,
        diff_text = t.diff_text_bg,
    }
end

-- Groups where onedark.nvim's semantic mapping differs from Zed's `syntax`
-- block (e.g. properties are red and types cyan in One, not the other way),
-- plus the editor chrome and the custom groups the Zenbones setup carried.
local function highlights(t)
    local function fg(color, fmt)
        return { fg = color, fmt = fmt or 'NONE' }
    end

    return {
        -- Editor chrome
        LineNr = fg(t.line_nr),
        CursorLineNr = fg(t.line_nr_active),
        CursorLine = { bg = t.bg_active_line },
        ColorColumn = { bg = t.bg_active_line },
        NonText = fg(t.line_nr),
        Whitespace = fg(t.line_nr),
        SpecialKey = fg(t.line_nr),
        WinSeparator = fg(t.border),
        VertSplit = fg(t.border),
        FloatBorder = { fg = t.border, bg = t.bg_surface },
        NormalFloat = { fg = t.editor_fg, bg = t.bg_surface },
        Pmenu = { fg = t.editor_fg, bg = t.bg_surface },
        PmenuSel = { fg = t.text, bg = t.bg_selected },
        PmenuSbar = { bg = t.bg_surface },
        PmenuThumb = { bg = t.border },
        Visual = { bg = t.selection },
        VisualNOS = { bg = t.selection },
        Search = { fg = t.text, bg = t.search },
        IncSearch = { fg = t.text, bg = t.search_active },
        CurSearch = { fg = t.text, bg = t.search_active },
        Substitute = { fg = t.text, bg = t.search_active },
        StatusLine = { fg = t.text_placeholder, bg = 'NONE' },
        StatusLineNC = { fg = t.comment, bg = 'NONE' },
        Title = fg(t.title),
        Directory = fg(t.func),

        -- Vim syntax groups
        Identifier = fg(t.variable),
        Constant = fg(t.constant),
        Type = fg(t.type),
        StorageClass = fg(t.type),
        Structure = fg(t.type),
        Typedef = fg(t.type),
        Operator = fg(t.operator),
        Delimiter = fg(t.punctuation),
        Special = fg(t.number),
        SpecialChar = fg(t.string_escape),
        Macro = fg(t.keyword),
        Label = fg(t.tag),
        Tag = fg(t.tag),
        Error = fg(t.error),

        -- Treesitter captures
        ['@attribute'] = fg(t.tag),
        ['@attribute.builtin'] = fg(t.tag),
        ['@boolean'] = fg(t.number),
        ['@character'] = fg(t.string),
        ['@character.special'] = fg(t.punctuation_special),
        ['@comment.documentation'] = fg(t.comment_doc),
        ['@constant'] = fg(t.constant),
        ['@constant.builtin'] = fg(t.number),
        ['@constant.macro'] = fg(t.constant),
        ['@constructor'] = fg(t.func),
        ['@function.builtin'] = fg(t.func),
        ['@function.macro'] = fg(t.func),
        ['@keyword.debug'] = fg(t.keyword),
        ['@label'] = fg(t.tag),
        ['@markup.heading'] = fg(t.title, 'bold'),
        ['@markup.heading.1'] = fg(t.title, 'bold'),
        ['@markup.heading.2'] = fg(t.title, 'bold'),
        ['@markup.heading.3'] = fg(t.title, 'bold'),
        ['@markup.heading.4'] = fg(t.title, 'bold'),
        ['@markup.heading.5'] = fg(t.title, 'bold'),
        ['@markup.heading.6'] = fg(t.title, 'bold'),
        ['@markup.strong'] = fg(t.number, 'bold'),
        ['@markup.italic'] = fg(t.accent, 'italic'),
        ['@markup.link'] = fg(t.func, 'italic'),
        ['@markup.link.label'] = fg(t.func),
        ['@markup.link.url'] = fg(t.link_uri, 'underline'),
        ['@markup.list'] = fg(t.property),
        ['@markup.raw'] = fg(t.string),
        ['@markup.raw.block'] = fg(t.string),
        ['@module'] = fg(t.namespace),
        ['@module.builtin'] = fg(t.namespace),
        ['@operator'] = fg(t.operator),
        ['@property'] = fg(t.property),
        ['@punctuation.bracket'] = fg(t.punctuation),
        ['@punctuation.delimiter'] = fg(t.punctuation),
        ['@punctuation.special'] = fg(t.punctuation_special),
        ['@string.escape'] = fg(t.string_escape),
        ['@string.regexp'] = fg(t.number),
        ['@string.special'] = fg(t.number),
        ['@string.special.path'] = fg(t.string),
        ['@string.special.symbol'] = fg(t.number),
        ['@string.special.url'] = fg(t.link_uri, 'underline'),
        ['@tag'] = fg(t.tag),
        ['@tag.builtin'] = fg(t.tag),
        ['@tag.attribute'] = fg(t.tag),
        ['@tag.delimiter'] = fg(t.punctuation),
        ['@type'] = fg(t.type),
        ['@type.builtin'] = fg(t.type),
        ['@type.definition'] = fg(t.type),
        ['@variable'] = fg(t.variable),
        ['@variable.builtin'] = fg(t.number),
        ['@variable.member'] = fg(t.property),
        ['@variable.parameter'] = fg(t.variable),
        ['@variable.parameter.builtin'] = fg(t.number),

        -- LSP semantic tokens (onedark.nvim copies these from its own
        -- treesitter defaults at load time, so they need the same overrides).
        ['@lsp.type.enum'] = fg(t.type),
        ['@lsp.type.enumMember'] = fg(t.constant),
        ['@lsp.type.interface'] = fg(t.type),
        ['@lsp.type.typeParameter'] = fg(t.type),
        ['@lsp.type.builtinType'] = fg(t.type),
        ['@lsp.type.namespace'] = fg(t.namespace),
        ['@lsp.type.parameter'] = fg(t.variable),
        ['@lsp.type.property'] = fg(t.property),
        ['@lsp.type.variable'] = fg(t.variable),
        ['@lsp.type.macro'] = fg(t.func),
        ['@lsp.typemod.variable.defaultLibrary'] = fg(t.number),
        ['@lsp.typemod.variable.static'] = fg(t.constant),

        -- Diagnostics: Zed's error/warning/info/hint status colors.
        DiagnosticError = fg(t.error),
        DiagnosticWarn = fg(t.warning),
        DiagnosticInfo = fg(t.info),
        DiagnosticHint = fg(t.hint),
        DiagnosticVirtualTextError = { fg = t.error, bg = 'NONE' },
        DiagnosticVirtualTextWarn = { fg = t.warning, bg = 'NONE' },
        DiagnosticVirtualTextInfo = { fg = t.info, bg = 'NONE' },
        DiagnosticVirtualTextHint = { fg = t.hint, bg = 'NONE' },
        DiagnosticUnderlineError = { sp = t.error, fmt = 'undercurl' },
        DiagnosticUnderlineWarn = { sp = t.warning, fmt = 'undercurl' },
        DiagnosticUnderlineInfo = { sp = t.info, fmt = 'undercurl' },
        DiagnosticUnderlineHint = { sp = t.hint, fmt = 'undercurl' },

        -- Diffs and git
        DiffAdded = fg(t.diff_plus),
        DiffDeleted = fg(t.diff_minus),
        DiffChanged = fg(t.modified),
        ['@diff.plus'] = fg(t.diff_plus),
        ['@diff.minus'] = fg(t.diff_minus),
        ['@diff.delta'] = fg(t.modified),
        GitSignsAdd = fg(t.created),
        GitSignsChange = fg(t.modified),
        GitSignsDelete = fg(t.deleted),

        -- Custom groups (expressline modes, leap, statusline, oil), same set
        -- customize_zenbones.lua defines for the Zenbones setup.
        OilDir = fg(t.text),
        ElVisualLine = { bg = t.selection, fg = t.text },
        ElVisual = { bg = t.selection, fg = t.text },
        ElNormal = fg(t.type),
        ElInsert = { bg = t.mode_insert, fg = t.text },
        ElCommand = { bg = t.mode_command, fg = t.text },
        ElReplace = { bg = t.mode_replace, fg = t.text },
        LeapBackdrop = { bg = 'NONE' },
        LeapLabel = { bg = t.leap, fg = t.text },
    }
end

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

return {
    'navarasu/onedark.nvim',
    lazy = false,
    priority = 1000,
    enabled = true,
    config = function()
        local onedark = require 'onedark'

        local function apply(mode)
            local t = tokens[mode]
            vim.o.background = mode
            onedark.setup {
                style = styles[mode],
                transparent = true,
                -- Terminal colors come from Zed's terminal.ansi.* below, not
                -- from the syntax palette.
                term_colors = false,
                code_style = {
                    comments = 'none',
                    keywords = 'none',
                    functions = 'none',
                    strings = 'none',
                    variables = 'none',
                },
                diagnostics = {
                    darker = false,
                    undercurl = true,
                    background = false,
                },
                colors = palette(t),
                highlights = highlights(t),
            }
            onedark.load()
            for slot, color in ipairs(t.ansi) do
                vim.g['terminal_color_' .. (slot - 1)] = color
            end
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
}
