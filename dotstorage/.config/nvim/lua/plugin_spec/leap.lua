return {
    'https://codeberg.org/andyg/leap.nvim',
    config = function()
        require('leap').opts.on_beacons = function(targets, _, _)
            for _, t in ipairs(targets) do
                -- Overwrite the `offset` value in all beacons.
                -- target.beacon looks like: { <offset>, <extmark_opts> }
                if t.label and t.beacon then
                    t.beacon[1] = 0
                end
            end
        end

        vim.keymap.set({ 'n', 'x', 'o' }, 's', '<Plug>(leap)')
        vim.keymap.set('n', 'S', '<Plug>(leap-from-window)')
    end,
}
