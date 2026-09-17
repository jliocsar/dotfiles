return {
    'mfussenegger/nvim-dap',
    dependencies = {
        'microsoft/vscode-js-debug',
        'mxsdev/nvim-dap-vscode-js',
    },
    config = function()
        local dap = require 'dap'

        local mason_root = require('mason.settings').current.install_root_dir
        local js_debug_path = mason_root .. '/packages/js-debug-adapter'

        require('dap-vscode-js').setup {
            debugger_path = js_debug_path,
            debugger_cmd = { 'js-debug-adapter' },
            adapters = {
                'pwa-node',
                'pwa-chrome',
                'pwa-msedge',
                'node-terminal',
                'pwa-extensionHost',
            },
        }

        dap.adapters['pwa-node'] = {
            type = 'server',
            host = 'localhost',
            port = '${port}',
            executable = {
                command = 'js-debug-adapter',
                args = { '${port}' },
            },
        }

        for _, language in ipairs { 'typescript', 'javascript' } do
            dap.configurations[language] = {
                {
                    type = 'pwa-node',
                    request = 'launch',
                    name = 'Launch file',
                    program = '${file}',
                    cwd = '${workspaceFolder}',
                },
            }
        end

        vim.keymap.set('n', '<leader>dt', dap.toggle_breakpoint, { desc = 'Toggle Breakpoint' })
        vim.keymap.set('n', '<leader>dc', dap.continue, { desc = 'Continue' })
    end,
}
