return {
    'vimpostor/vim-tpipeline',
    init = function()
        -- don't let tpipeline clobber the whole status-left;
        -- it only updates the @tpipeline_status user var, we place it ourselves
        vim.g.tpipeline_autoembed = 0
    end,
    config = function() end,
}
