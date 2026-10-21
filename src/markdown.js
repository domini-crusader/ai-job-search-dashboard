// Leitura e escrita das seções de perfil em blocos editáveis, preservando o que o
// editor não entende (tabelas, comentários, linhas indentadas) exatamente como está.
//   field: "- **Chave:** valor"   item: "- texto"   raw: qualquer outra coisa
// Linhas indentadas logo abaixo de um field/item são o "tail" dele e voltam intactas.

export function parseBlocks(md) {
  const blocks = []
  const lines = String(md ?? '').split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const field = line.match(/^- \*\*(.+?):\*\*\s?(.*)$/)
    const item = !field && line.match(/^[-*] (.*)$/)
    if (field || item) {
      const tail = []
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) tail.push(lines[++i])
      blocks.push(field ? { type: 'field', key: field[1], value: field[2], tail } : { type: 'item', text: item[1], tail })
    } else if (blocks.length && blocks[blocks.length - 1].type === 'raw') {
      blocks[blocks.length - 1].text += `\n${line}`
    } else {
      blocks.push({ type: 'raw', text: line })
    }
  }
  return blocks
}

export function serializeBlocks(blocks) {
  return blocks.map((b) => {
    const head = b.type === 'field' ? `- **${b.key}:** ${b.value}`.trimEnd() : b.type === 'item' ? `- ${b.text}` : b.text
    return [head, ...(b.tail ?? [])].join('\n')
  }).join('\n')
}

// Visualização: texto puro com **negrito**; comentários HTML somem.
export function viewBlocks(md) {
  return parseBlocks(String(md ?? '').replace(/[ \t]*<!--[\s\S]*?-->[ \t]*\n?/g, ''))
    .map((b) => (b.type === 'raw' ? { ...b, text: b.text.trim() } : b))
    .filter((b) => b.type !== 'raw' || b.text)
}

// Partes de uma linha com **negrito**, para renderizar sem v-html.
export function inline(text) {
  return String(text ?? '').split(/(\*\*[^*]+\*\*)/).filter(Boolean)
    .map((p) => (p.startsWith('**') && p.endsWith('**') ? { b: true, t: p.slice(2, -2) } : { b: false, t: p.replace(/`/g, '') }))
}
