local opt = vim.opt

-- autocomplete
opt.completeopt = { 'menu', 'menuone', 'noselect', 'preview' }
opt.shortmess:append 'c'

opt.smartcase = true
opt.ignorecase = true

opt.number = true
opt.relativenumber = true
opt.signcolumn = 'yes'

opt.swapfile = false

-- TODO: Check better way to do this
vim.cmd [[
	augroup NoAutoComment
		autocmd!
		autocmd FileType * setlocal formatoptions-=o
	augroup END
]]
opt.formatoptions:remove 'o'

vim.cmd [[
	augroup SpecialBufferExclusion
		autocmd!
		" Exclude quickfix buffers
		autocmd FileType qf setlocal nobuflisted
		" Exclude help buffers
		autocmd FileType help setlocal nobuflisted
	    " Exclude the compile mode buffer
		autocmd FileType compilation setlocal nobuflisted
	augroup END
]]

opt.shada = { "'10", '<0', 's10', 'h' }

opt.wrap = false
opt.linebreak = true

opt.tabstop = 2
opt.shiftwidth = 2

opt.more = false

opt.title = true
opt.titlestring = '%t%( %M%)%( (%{expand("%:~:h")})%)%a (nvim)'
opt.statusline = ''

opt.undofile = true

-- views can only be fully collapsed with the global statusline
if vim.fn.environ().TMUX then
    opt.laststatus = 0
else
    opt.laststatus = 3
end

opt.conceallevel = 0

opt.autochdir = true

opt.termguicolors = true

-- auto reload files when changed outside of nvim
opt.autoread = true

-- Always copy to system clipboard
-- idk why but i like this
opt.clipboard = 'unnamedplus'

local env = vim.fn.environ()

local clipboard = nil

if env.TMUX then
    clipboard = 'tmux'
elseif env.DISPLAY then
    clipboard = 'xsel'
else
    clipboard = 'wl-copy'
end

vim.g.clipboard = clipboard

opt.winborder = 'single'

opt.expandtab = true
