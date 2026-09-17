local lsp = vim.lsp
local api = vim.api

-- Config. for STALKER Anomaly development
local lua_ls_settings = vim.g.neovide
        and {
            files = {
                associations = {
                    ['*.script'] = 'lua',
                },
            },
            Lua = {
                diagnostics = {
                    disable = { 'lowercase-global' },
                },
                runtime = {
                    version = 'Lua 5.1',
                    plugin = [[C:\Users\sickhowl\Documents\Scripts\anomalydefs\plugin.lua]],
                },
                workspace = {
                    ignoreSubmodules = false,
                    library = {
                        [[C:\Users\sickhowl\Documents\Scripts\anomalydefs\library]],
                        [[C:\Abnormally_Cold\tools\_unpacked\scripts]],
                    },
                },
            },
        }
    or {}

local servers = {}

servers.luals = {
    cmd = { 'lua-language-server' },
    filetypes = { 'lua', 'script' },
    root_markers = { '.luarc.json', '.luarc.jsonc', '.git' },
    settings = lua_ls_settings,
}

--[[
servers.eslint = {
    cmd = { 'eslint' },
    filetypes = { 'javascript', 'javascriptreact', 'typescript', 'typescriptreact' },
    root_markers = {
        '.eslintrc',
        '.eslintrc.js',
        '.eslintrc.json',
        'package.json',
        'yarn.lock',
        'bun.lock',
        'pnpm-lock.yaml',
        'package-lock.json',
    },
    settings = {},
}
--]]

servers.prettierd = {
    cmd = { 'prettierd' },
    filetypes = { 'javascript', 'javascriptreact', 'typescript', 'typescriptreact' },
    root_markers = {
        '.eslintrc',
        '.eslintrc.js',
        '.eslintrc.json',
        'package.json',
        'yarn.lock',
        'bun.lock',
        'pnpm-lock.yaml',
        'package-lock.json',
    },
    settings = {},
}

servers.json = {
    cmd = { 'vscode-json-language-server', '--stdio' },
    filetypes = { 'json', 'jsonc' },
}

servers.bashls = {
    cmd = { 'bash-language-server', 'start' },
    filetypes = { 'bash', 'sh', 'zsh' },
}

servers.ts = {
    cmd = { 'typescript-language-server', '--stdio' },
    filetypes = { 'typescript', 'typescriptreact', 'javascript', 'javascriptreact' },
    root_markers = { 'tsconfig.json', 'jsconfig.json', 'package.json', 'node_modules', '.git' },
    settings = {},
}

servers.perl = {
    cmd = { 'perlnavigator', '--stdio' },
    filetypes = { 'perl' },
    root_markers = { '.git', 'Makefile.PL', 'Build.PL', 'cpanfile', 'META.json', 'META.yml' },
    settings = {},
}

servers.pylsp = {
    cmd = { 'pylsp' },
    filetypes = { 'python' },
    root_markers = { '.venv', 'venv' },
    settings = {},
}

servers.html = {
    cmd = { 'vscode-html-language-server', '--stdio' },
    filetypes = { 'html' },
    root_markers = { '.git' },
    settings = {},
}

servers.typst = {
    cmd = { 'typst-lsp' },
    filetypes = { 'typst' },
    root_markers = { 'typst.toml', '.git' },
    settings = {},
}

servers.go = {
    cmd = { 'gopls' },
    filetypes = { 'go' },
    root_markers = { 'go.mod', '.git' },
    settings = {},
}

servers.ruff = {
    cmd = { 'ruff', 'server' },
    filetypes = { 'python' },
    root_markers = { '.venv', 'venv' },
    settings = {},
}

servers.just = {
    cmd = { 'just-lsp' },
    filetypes = { 'just' },
    root_markers = { 'justfile' },
    settings = {},
}

servers.tailwind = {
    cmd = { 'tailwindcss-language-server' },
    filetypes = { 'typescript', 'typescriptreact', 'javascript', 'javascriptreact', 'html', 'css' },
    root_markers = { 'tailwind.config.js', 'tailwind.config.ts' },
    settings = {},
}

--[[Native completion disabled for now, using cmp
api.nvim_create_autocmd('LspAttach', {
    callback = function(event)
        local client = vim.lsp.get_client_by_id(event.data.client_id)
        assert(client, 'Missing LSP client')

        if client:supports_method 'textDocument/completion' then
            client.server_capabilities.completionProvider.triggerCharacters = { '.' }
            vim.lsp.completion.enable(true, client.id, event.buf, {
                autotrigger = true,
                convert = function(item)
                    return { abbr = item.label:gsub('%b()', '') }
                end,
            })
        end
    end,
})
--]]

local capabilities = nil
if pcall(require, 'cmp_nvim_lsp') then
    capabilities = require('cmp_nvim_lsp').default_capabilities()
end

for server, config in pairs(servers) do
    lsp.config(server, config)
    lsp.enable(server, true)
end

lsp.config('*', {
    capabilities = capabilities,
})
