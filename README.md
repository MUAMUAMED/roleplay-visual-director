# Roleplay Visual Director

Extensão de imagens e inteligência artificial para SillyTavern que transforma o contexto recente do roleplay em uma cena cinematográfica, um POV do jogador ou uma ficha visual do personagem com as roupas atuais.

Agora com suporte direto ao **Nosso Proxy (CLI Proxy API)**, permitindo usar todo o pool de **7 contas do Google** (sem limite de taxa) e o modelo mais potente da OpenAI (**GPT Image 2.5**), além de permitir **conectar o chat de conversa do SillyTavern ao proxy** com apenas um clique!

---

## 🚀 Novos Recursos

- **Provedor Nosso Proxy (Google & GPT):**
  - **Google Gemini Multimodal (Pool de 7 Contas):** Gera imagens a partir das referências do avatar e do chat com balanceamento de carga automático (`gemini-3.1-flash-image`), ou direcionando para qualquer uma das 7 contas (`google1` até `google7`).
  - **GPT Mais Potente (`gpt-image-2.5`):** Gera imagens diretamente via modelos de ponta da OpenAI (`gpt-image-2.5`, `codex/gpt-image-2.5`, `gpt-image-2`).
  - **Detecção automática de endpoint:** Alterna entre URL pública (`https://antigravity21.zeabur.app/v1`) e rede interna Zeabur (`http://cliproxyapi-musess.zeabur.internal:8317/v1`).
  - **Chave pré-configurada:** Chave `sk-antigravity21-secure-key` pronta para uso.

- **Conectar Provedor de Chat no SillyTavern:**
  - Painel integrado para configurar o SillyTavern para conversar usando o proxy.
  - 1 clique em **"Ativar Chat no SillyTavern"** para preencher endpoint, autenticação e conectar.
  - Modelos recomendados para RP disponíveis diretamente no seletor:
    - `gemini-3.8-flash-high` (Pool das 7 contas Google — respostas instantâneas)
    - `claude-sonnet-4-6` (O melhor para escrita e profundidade de roleplay)
    - `claude-opus-4-6-thinking` (Raciocínio complexo)
    - `gpt-5.5` / `gpt-6-astra` (Modelos topo de linha GPT)
    - Contas Google dedicadas (`google1` a `google7`)

---

## Recursos Principais

- **Criar cena**: enquadramento cinematográfico em terceira pessoa.
- **Criar POV do jogador**: o momento visto pelos olhos do jogador; a interação é dirigida diretamente à lente, sem criar outro corpo para representar quem está vendo.
- **Visual e roupas**: mostra o personagem ativo de corpo inteiro, priorizando roupas, acessórios e estado atual descritos no chat.
- Usa o avatar do personagem ativo como imagem de referência, quando disponível.
- Pode incluir o avatar do jogador como referência: ele aparece em cenas quando apropriado; em POV, só orienta mãos, braços ou outras partes visíveis.
- Botões **Cena**, **POV** e **Visual** diretamente acima da barra de mensagem do chat.
- Cada imagem gerada no chat possui **👍** para aprová-la como continuidade e **👎** para apagá-la e refazê-la.

---

## Instalação no SillyTavern

1. No SillyTavern, abra **Extensions** (ícone de blocos/extensões) → **Install Extension**.
2. Cole a URL do repositório:
   ```text
   https://github.com/MUAMUAMED/roleplay-visual-director
   ```
3. Confirme a instalação.
4. Abra o painel **Roleplay Visual Director** na aba de Extensões.

---

## Configuração Rápida

### 1. Para Geração de Imagens
- Em **Provedor**, escolha **Nosso Proxy (Google & GPT)**.
- Escolha o modelo:
  - Para fidelidade a fotos/referências usando as contas Google: `Google Gemini — Pool Automático (7 Contas)` ou uma conta específica.
  - Para o gerador mais potente da OpenAI: `GPT Image 2.5 — OpenAI Mais Potente`.
- Clique em **Cena**, **POV** ou **Visual** no chat!

### 2. Para Usar no Chat de Conversa do SillyTavern
1. No painel da extensão, role até **"Usar Nosso Proxy como Provedor de Chat"**.
2. Escolha o modelo de conversa desejado (ex: `gemini-3.8-flash-high` ou `claude-sonnet-4-6`).
3. Clique em **Ativar Chat no SillyTavern**.
4. Pronto! O SillyTavern será conectado automaticamente ao proxy.

#### Configuração Manual do Chat (se preferir):
1. Clique no ícone de tomada (🔌 **API Connections**) no topo do SillyTavern.
2. Em **API**, selecione **Chat Completion**.
3. Em **Chat Completion Source**, selecione **Custom (OpenAI-compatible)**.
4. Em **Custom Endpoint (Base URL)**: `https://antigravity21.zeabur.app/v1`
5. Em **Custom API Key**: `sk-antigravity21-secure-key`
6. Clique em **Connect** e escolha o modelo desejado.

---

## Licença

MIT. Veja [LICENSE](LICENSE).
