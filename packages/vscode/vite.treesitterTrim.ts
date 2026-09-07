const TREE_SITTER_KEEP = new Set([
  'tree-sitter-css.wasm',
  'tree-sitter-javascript.wasm',
  'tree-sitter-regex.wasm',
  'tree-sitter-tsx.wasm',
  'tree-sitter-typescript.wasm',
])

/**
 * Codingame registers every tree-sitter grammar via tree-sitter-all.wasm.js.
 * Drop unused WASM so the hosted workbench does not ship C++/C#/Ruby/etc parsers.
 */
export function trimTreeSitterWasmPlugin() {
  return {
    name: 'trim-treesitter-wasm',
    transform(code, id) {
      const normalizedId = String(id).replace(/\\/g, '/')
      if (!normalizedId.endsWith('tree-sitter-all.wasm.js')) {
        return null
      }
      const filtered = code
        .split('\n')
        .filter((line) => {
          if (!line.includes('tree-sitter-') || !line.includes('.wasm')) {
            return true
          }
          return [...TREE_SITTER_KEEP].some((name) => line.includes(name))
        })
        .join('\n')
      return { code: filtered, map: null }
    },
  }
}
