local base = require 'zenbones'
local lush = require 'lush'

local hsl = lush.hsl

-- Mode-specific accents for the custom highlights (expressline modes, leap,
-- statusline). Dark uses deep tints with a warm light fg; light flips to pale
-- tints with a dark fg so the same UI reads on a light background.
local palettes = {
    dark = {
        fg = '#B39C90',
        statusline_fg = '#736863',
        visual = '#37393B',
        insert = '#2D404E',
        command = '#5C3D56',
        replace = '#361C1F',
        leap = '#362111',
    },
    light = {
        fg = '#3A3F43',
        statusline_fg = '#7A6E66',
        visual = '#DED6D1',
        insert = '#D3E0E9',
        command = '#E7D9E4',
        replace = '#EFD8DC',
        leap = '#F2E1D2',
    },
}

local palette = palettes[vim.o.background] or palettes.dark
local common_fg = hsl(palette.fg)

-- Create some specs
local specs = lush.parse(function()
    return {
        Statusline { bg = 'NONE', fg = hsl(palette.statusline_fg) },

        OilDir { fg = common_fg },

        ElVisualLine { bg = hsl(palette.visual), fg = common_fg },
        ElVisual { bg = hsl(palette.visual), fg = common_fg },
        ElNormal { fg = base.Type.fg },
        ElInsert { bg = hsl(palette.insert), fg = common_fg },
        ElCommand { bg = hsl(palette.command), fg = common_fg },
        ElReplace { bg = hsl(palette.replace), fg = common_fg },

        LeapBackdrop { bg = 'NONE' },
        LeapLabel { bg = hsl(palette.leap), fg = common_fg },
    }
end)

-- Apply specs using lush tool-chain
lush.apply(lush.compile(specs))
