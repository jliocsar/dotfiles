local ns_id = vim.api.nvim_create_namespace 'BlockContext'

vim.api.nvim_create_autocmd('CursorMoved', {
    callback = function()
        local node = vim.treesitter.get_node()
        if not node then
            return
        end

        local text = nil
        local wanted_type_lut = {
            if_statement = true,
            table_constructor = true,
            arguments = true,
            statement_block = true,
            object = true,
            template_string = true,
            interface_body = true,
            class_body = true,
            object_type = true,
            function_definition = true,
            method_definition = true,
            else_clause = true,
        }
        local parented_type_lut = {
            statement_block = true,
            else_clause = true,
            if_statement = true,
            interface_body = true,
        }
        local parent_wanted_type_lut = {
            function_declaration = true,
            method_definition = true,
            interface_declaration = true,
            class_declaration = true,
        }
        local node_type = node:type()
        local cursor_row = unpack(vim.api.nvim_win_get_cursor(0))

        if wanted_type_lut[node_type] then
            local start_row = node:start()
            local end_row = node:end_()

            if parented_type_lut[node_type] then
                local parent = node:parent()
                local parent_type = parent and parent:type() or nil

                if parent_type and parent_wanted_type_lut[parent_type] then
                    start_row = parent:start()
                    end_row = parent:end_()
                end
            end

            local is_same_row = start_row == end_row
            local is_large_block = end_row - start_row > 10
            local is_end_row = cursor_row == end_row + 1

            if is_large_block and is_end_row and not is_same_row then
                text = vim.api.nvim_buf_get_lines(0, start_row, start_row + 1, false)[1]
                text = ' ' .. text:gsub('^%s+', '')
            end
        end

        vim.api.nvim_buf_clear_namespace(0, ns_id, 0, -1)

        if not text then
            return
        end

        vim.api.nvim_buf_set_extmark(0, ns_id, vim.fn.line '.' - 1, -1, {
            virt_text = { { text, 'Comment' } },
            virt_text_pos = 'inline',
        })
    end,
})
