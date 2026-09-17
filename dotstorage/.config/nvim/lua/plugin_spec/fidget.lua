return {
    'j-hui/fidget.nvim',
    config = function()
        local fidget = require 'fidget'

        fidget.setup {
            notification = {
                window = {
                    winblend = 0,
                },
            },
        }
    end,
}
