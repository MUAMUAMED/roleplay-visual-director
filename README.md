# Roleplay Visual Director

Extensão de imagens para SillyTavern que transforma o contexto recente do roleplay em uma cena, um POV do jogador ou uma ficha visual do personagem com as roupas atuais.

## Recursos

- **Criar cena**: enquadramento cinematográfico em terceira pessoa.
- **Criar POV do jogador**: o momento visto pelos olhos do jogador.
- **Visual e roupas**: mostra o personagem ativo de corpo inteiro, priorizando roupas, acessórios e estado atual descritos no chat.
- Usa o avatar do personagem ativo como imagem de referência, quando disponível.
- Conectores diretos para OpenRouter e Google Gemini.
- Catálogo dinâmico do OpenRouter: carrega todos os modelos de imagem disponíveis pela API (atualmente 43), incluindo os adicionados depois da instalação.
- Publica automaticamente cada imagem gerada no chat como uma mensagem visual do sistema.
- Exibe botões **Cena**, **POV** e **Visual** diretamente acima da caixa de mensagem do chat.
- Cada imagem no chat tem **👍** para aprová-la como referência de continuidade e **👎** para refazê-la. A próxima imagem envia o avatar e a última imagem aprovada como referências.

## Instalação

No SillyTavern, abra **Extensions → Install Extension**, cole a URL deste repositório e confirme. Depois, abra o painel **Roleplay Visual Director** em Extensions.

## Configuração

1. Escolha o provedor e o modelo pelo seletor do painel. Para OpenRouter, clique em **Atualizar todos os modelos** após informar a chave para carregar o catálogo completo.
2. Cole a chave da API no campo correspondente.
3. Escolha a proporção e a quantidade de mensagens usadas como contexto.
4. Clique em um dos três botões de geração.

Por padrão, as chaves ficam apenas durante a sessão. A opção **Lembrar esta chave neste navegador** salva a chave no armazenamento local do navegador para não precisar colá-la novamente. Ela nunca é gravada no repositório, mas não deve ser usada em uma instalação compartilhada, pois extensões da mesma instalação podem acessá-la.

### Modelos sugeridos

- OpenRouter: um modelo com saída de imagem e entrada de imagem, como `google/gemini-2.5-flash-image`.
- Google: `gemini-3.1-flash-image`.

O OpenRouter informa, pela própria API, quais modelos aceitam imagens de referência. Caso o modelo escolhido não aceite referência, ele poderá gerar somente com o texto do contexto.

## Privacidade e segurança

Esta é uma extensão de navegador. Não cole chaves que você não aceite usar localmente nesta instalação. Não há servidor próprio, telemetria, upload adicional ou armazenamento de chaves.

## Licença

MIT. Veja [LICENSE](LICENSE).
