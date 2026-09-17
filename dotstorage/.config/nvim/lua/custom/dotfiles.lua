local env = vim.fn.environ()

local HOME = env.HOME
local USERPROFILE = env.USERPROFILE
local CONFIG_ROOT

if HOME then
    CONFIG_ROOT = HOME .. '/.config'
else
    assert(USERPROFILE, 'Could not determine config root directory')
    CONFIG_ROOT = USERPROFILE .. [[\AppData\Local]]
    CONFIG_ROOT = CONFIG_ROOT:gsub('\\', '/') -- Normalize path for Neovim
end

local M = {}

M.NVIM_CONFIG_ROOT = CONFIG_ROOT .. [[/nvim]]

-- TODO(jliocsar): Check if there's a better way to do this with nvim
---@param path string
local function resolve_symlink(path)
    local command = 'realpath ' .. path
    local fh = io.popen(command, 'r')

    if not fh then
        return nil
    end

    local resolved_path = fh:read '*a'

    fh:close()

    return resolved_path:gsub('[\n\r]', '')
end

function M.get_starting_dir()
    local argv = vim.fn.argv()
    local starting_dir = argv[1]

    if not starting_dir then
        starting_dir = vim.fn.getcwd()
    end

    return resolve_symlink(starting_dir)
end

M.starting_dir = M.get_starting_dir()

return M
