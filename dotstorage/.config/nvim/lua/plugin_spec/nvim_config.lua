if vim.g.neovide then
    return {}
end

return {
    dir = vim.fn.environ().HOME .. '/.config/nvim',
    lazy = true,
}
