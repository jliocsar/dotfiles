if 1 then
    return {}
end

return {
    'nvim-lualine/lualine.nvim',
    config = function()
        local lualine = require 'lualine'
        local colors = {
            bg1 = '#0d0d0a',
            bg2 = '#0d0d0a',
            fg = '#B39C90',
            visual = '#37393B',
            insert = '#2D404E',
            normal = '#403833',
            replace = '#361C1F',
            dim = '#736863',
        }

        lualine.setup {
            options = {
                always_show_tabline = false,
                theme = {
                    visual = {
                        a = { fg = colors.fg, bg = colors.visual, gui = 'bold' },
                        b = { fg = colors.fg, bg = colors.bg2 },
                    },
                    replace = {
                        a = { fg = colors.fg, bg = colors.replace, gui = 'bold' },
                        b = { fg = colors.fg, bg = colors.bg2 },
                    },
                    inactive = {
                        c = { fg = colors.dim, bg = colors.bg2 },
                        a = { fg = colors.dim, bg = colors.bg2, gui = 'bold' },
                        b = { fg = colors.dim, bg = colors.bg2 },
                    },
                    normal = {
                        c = { fg = colors.fg, bg = colors.bg2 },
                        a = { fg = colors.fg, bg = colors.normal, gui = 'bold' },
                        b = { fg = colors.fg, bg = colors.bg2 },
                    },
                    insert = {
                        a = { fg = colors.fg, bg = colors.insert, gui = 'bold' },
                        b = { fg = colors.fg, bg = colors.bg2 },
                    },
                    command = {
                        a = { fg = colors.fg, bg = colors.insert, gui = 'bold' },
                        b = { fg = colors.fg, bg = colors.bg2 },
                    },
                },
            },
            sections = {
                lualine_a = {
                    {
                        'mode',
                        ---@param str string
                        ---@return string
                        fmt = function(str)
                            local head = str:sub(1, 1)
                            local tail = str:sub(2)
                            return head .. tail:lower()
                        end,
                    },
                },
                lualine_b = {},
                lualine_c = {
                    {
                        'filename',
                        path = 3,
                        shorting_target = 20,
                    },
                },
                lualine_x = { 'diff', 'diagnostics' },
                lualine_y = { 'encoding', 'fileformat', 'filetype' },
                lualine_z = { 'progress', 'location' },
            },
            inactive_sections = {
                lualine_a = {},
                lualine_b = {},
                lualine_c = {
                    {
                        'filename',
                        path = 3,
                    },
                },
                lualine_x = { 'location' },
                lualine_y = {},
                lualine_z = {},
            },
        }

        lualine.hide()
    end,
}
