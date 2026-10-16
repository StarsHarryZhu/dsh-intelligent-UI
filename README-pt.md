# dsh-intelligent-ui

Cartões interativos nas conversas do DeepSeek Harness. O modelo escreve um pequeno programa de interface; a conversa o desenha como um cartão nativo — controles deslizantes, campos, seletores, métricas, tabelas, gráficos, barras de progresso e botões de resposta — e cada controle recalcula no seu navegador sem outra chamada ao modelo.

[English](README.md) · [中文](README-zh.md) · [Español](README-es.md) · [हिन्दी](README-hi.md)

## O que faz

- Registra uma ferramenta, `ui_render`. O modelo envia um programa em `source`; o plugin o valida contra um catálogo fixo de componentes e guarda o programa compilado com o resultado da ferramenta.
- Desenha o cartão na linha da ferramenta enquanto a resposta é escrita (com prévia enquanto o programa chega) e abaixo da resposta quando o turno termina.
- Recalcula tudo localmente ao mover um controle. Nada é enviado até você clicar num botão, que envia o texto dele como sua próxima mensagem.
- Usa o tema, as fontes e o idioma do anfitrião, nos modos claro e escuro.
- Nunca executa código escrito pelo modelo: o programa é apenas dado.

## Instalação

Instale o pacote num perfil pelo Plugin Manager (Configurações → Plugins → instalar de uma pasta local) ou por um agente com `plugin_manager` `install_bundle`. Reinicie o harness após instalar ou recompilar e recarregue a página.

## Desinstalação

Desative ou remova o bundle em Configurações → Plugins. As sessões continuam abrindo; as chamadas anteriores aparecem como linhas de ferramenta comuns. O plugin não adiciona tipos de evento de sessão.

## Desenvolvimento

```sh
node scripts/link-dev.mjs
node build.js
node node_modules/vitest/vitest.mjs run
```

## Licença

[Apache License 2.0](LICENSE) © 2026 dsh-intelligent-ui contributors.
