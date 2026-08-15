import { addOneMessage, saveChatConditional } from '../../../../script.js';
import { saveBase64AsFile } from '../../../../scripts/utils.js';

const MODULE_NAME = 'roleplay_visual_director';
const SESSION_KEY = `${MODULE_NAME}_api_keys`;
const PERSISTENT_KEY = `${MODULE_NAME}_saved_api_keys`;
const defaults = Object.freeze({ provider: 'openrouter', openrouterModel: 'google/gemini-2.5-flash-image', googleModel: 'gemini-3.1-flash-image', aspectRatio: '1:1', quality: 'auto', messages: 8 });
const modelChoices = Object.freeze({
    openrouter: [
        ['google/gemini-3.1-flash-lite-image', 'Gemini 3.1 Flash Lite Image — econômico'],
        ['google/gemini-2.5-flash-image', 'Gemini 2.5 Flash Image — qualidade'],
        ['black-forest-labs/flux.2-klein-4b', 'FLUX.2 Klein 4B — cenas baratas'],
        ['black-forest-labs/flux.2-pro', 'FLUX.2 Pro — referência e consistência'],
        ['bytedance-seed/seedream-4.5', 'Seedream 4.5 — retratos e edição'],
    ],
    google: [
        ['gemini-3.1-flash-image', 'Gemini 3.1 Flash Image'],
    ],
});
let openRouterCatalog = [];

function settings() {
    const context = SillyTavern.getContext();
    context.extensionSettings[MODULE_NAME] = { ...defaults, ...(context.extensionSettings[MODULE_NAME] || {}) };
    return context.extensionSettings[MODULE_NAME];
}

function getStoredKeys(storageKey) { try { return JSON.parse(localStorage.getItem(storageKey) || sessionStorage.getItem(storageKey) || '{}'); } catch { return {}; } }
function sessionKeys() { return getStoredKeys(SESSION_KEY); }
function persistentKeys() { return getStoredKeys(PERSISTENT_KEY); }
function apiKeyFor(provider) { return sessionKeys()[provider] || persistentKeys()[provider] || ''; }
function saveApiKey(provider, key, remember) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...sessionKeys(), [provider]: key }));
    const saved = persistentKeys();
    if (remember) saved[provider] = key;
    else delete saved[provider];
    localStorage.setItem(PERSISTENT_KEY, JSON.stringify(saved));
}
function forgetPersistentKey(provider) { const saved = persistentKeys(); delete saved[provider]; localStorage.setItem(PERSISTENT_KEY, JSON.stringify(saved)); }
function notice(message, error = false) { $('#rvl_status').text(message).toggleClass('rvl-error', error); }

function choicesFor(provider) {
    if (provider !== 'openrouter' || !openRouterCatalog.length) return modelChoices[provider] || [];
    return openRouterCatalog.map(model => {
        const acceptsReferences = Boolean(model.supported_parameters?.input_references);
        const displayName = model.name || model.id;
        return [model.id, `${displayName}${acceptsReferences ? ' — aceita referências' : ''}`];
    });
}

async function refreshOpenRouterCatalog() {
    const key = $('#rvl_api_key').val().trim() || apiKeyFor('openrouter');
    if (!key) return notice('Cole ou lembre sua chave OpenRouter antes de atualizar o catálogo.', true);
    try {
        notice('Buscando todos os modelos de imagem do OpenRouter…');
        const response = await fetch('https://openrouter.ai/api/v1/images/models', { headers: { Authorization: `Bearer ${key}` } });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error?.message || 'Não foi possível carregar o catálogo OpenRouter.');
        openRouterCatalog = (json.data || []).filter(model => model?.id).sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id));
        if (!openRouterCatalog.length) throw new Error('O OpenRouter não retornou modelos de imagem disponíveis.');
        syncUi();
        notice(`${openRouterCatalog.length} modelos de imagem carregados do OpenRouter.`);
    } catch (error) {
        console.error(`[${MODULE_NAME}] Could not load OpenRouter image models.`, error);
        notice(error.message || 'Não foi possível carregar o catálogo OpenRouter.', true);
    }
}

function getVisualMemory() {
    const context = SillyTavern.getContext();
    context.chatMetadata[MODULE_NAME] = context.chatMetadata[MODULE_NAME] || {};
    return context.chatMetadata[MODULE_NAME];
}

async function approveImage(messageId) {
    const context = SillyTavern.getContext();
    const message = context.chat?.[messageId];
    const record = message?.extra?.[MODULE_NAME];
    if (!record?.imageUrl) return;
    const memory = getVisualMemory();
    memory.lastApprovedImage = { url: record.imageUrl, mode: record.mode, approvedAt: Date.now() };
    await context.saveMetadata();
    $(`#rvl_feedback_${messageId} .rvl-like`).addClass('rvl-approved').attr('title', 'Imagem aprovada para continuidade');
    notice('Imagem aprovada: será usada como referência nas próximas gerações.');
}

async function dislikeImage(messageId, mode) {
    const context = SillyTavern.getContext();
    const record = context.chat?.[messageId]?.extra?.[MODULE_NAME];
    const memory = getVisualMemory();
    // A rejection of the currently approved image must also remove it from
    // continuity, otherwise the "redo" would keep feeding the rejected look.
    if (record?.imageUrl && memory.lastApprovedImage?.url === record.imageUrl) {
        delete memory.lastApprovedImage;
        await context.saveMetadata();
    }
    run(mode);
}

function dataUrlToImage(dataUrl) {
    const match = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || '');
    return match ? { mimeType: match[1], data: match[2], dataUrl } : null;
}

async function characterReferences() {
    const context = SillyTavern.getContext();
    const allCharacters = context.characters || [];
    const active = allCharacters[context.characterId];
    const activeGroup = context.groupId != null
        ? (context.groups || []).find(group => group.id === context.groupId)
        : null;
    // Never resolve a character by display name: names can repeat across cards and
    // chats. For a solo chat use precisely the active card; for a group use only
    // that group's declared avatar members.
    const groupAvatars = new Set(activeGroup?.members || []);
    const characters = activeGroup
        ? allCharacters.filter(character => character.avatar && groupAvatars.has(character.avatar)).slice(0, 4)
        : (active?.avatar ? [active] : []);
    const references = await Promise.all(characters.map(async character => {
        try {
            const response = await fetch(`/characters/${encodeURIComponent(character.avatar)}`);
            if (!response.ok) return null;
            const blob = await response.blob();
            const image = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(dataUrlToImage(reader.result)); reader.readAsDataURL(blob); });
            return image ? { ...image, name: character.name } : null;
        } catch { return null; }
    }));
    const validReferences = references.filter(Boolean);
    const approved = getVisualMemory().lastApprovedImage;
    if (approved?.url) {
        try {
            const response = await fetch(approved.url);
            if (response.ok) {
                const blob = await response.blob();
                const image = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(dataUrlToImage(reader.result)); reader.readAsDataURL(blob); });
                if (image) validReferences.push({ ...image, name: 'approved continuity image', continuity: true });
            }
        } catch { console.warn(`[${MODULE_NAME}] Could not load approved continuity image.`); }
    }
    return validReferences.slice(0, 5);
}

function currentCharacterName() {
    const context = SillyTavern.getContext();
    return context.characters?.[context.characterId]?.name || 'the active character';
}

function buildPrompt(mode, references) {
    const context = SillyTavern.getContext();
    const s = settings();
    const history = (context.chat || []).slice(-Number(s.messages)).map(m => `${m.is_user ? 'Player' : currentCharacterName()}: ${String(m.mes || '').replace(/<[^>]*>/g, '').trim()}`).filter(Boolean).join('\n');
    const modeInstruction = {
        scene: 'Create a cinematic third-person scene from the current roleplay moment.',
        pov: 'Create a true first-person roleplay image: the camera is physically the adult male player\'s eyes, at his natural eye level, never a detached spectator camera. Render the spatial scale, angle, depth, and distance exactly as the player would see them. The player may appear only as natural foreground hands or lower arms. Place the active character at the precise distance stated or implied by the roleplay; during close moments, frame that character close to the camera so they fill the view naturally.',
        look: `Create a clear full-body character reference of ${currentCharacterName()} exactly as they currently appear. Make clothing, accessories, hairstyle, expression, posture, and visible condition easy to read. Use the player\'s point of view as if standing in front of them.`,
    }[mode];
    const approvedContinuity = references.some(reference => reference.continuity);
    const referenceRoles = references.length
        ? references.map((reference, index) => reference.continuity
            ? `Image ${index + 1}: the approved previous scene. Use it as the continuity reference for the same clothing, accessories, setting, and visual style.`
            : `Image ${index + 1}: ${reference.name}'s profile image. Use it as the authoritative visual identity reference for that character.`).join('\n')
        : 'There are no visual references for this request.';
    return `${modeInstruction}

VISUAL REFERENCE ROLES:
${referenceRoles}

IDENTITY LOCK:
Render the same recognizable character(s) shown in their profile references. Keep face geometry, skin tone, eye shape and color, hairstyle and color, distinctive features, body proportions, and overall art style stable. Preserve a coherent adult character design across the image.

CAST COMPOSITION:
For romance or close relationship scenes, depict exactly one adult man: the male player. The remaining people are only the character partner(s) described in the roleplay. Never add a second man, male observer, male partner, or male bystander. Keep this cast and the described relationship dynamics consistent in both POV and third-person scenes.

CONTINUITY LOCK:
${approvedContinuity ? 'Use the final approved reference to continue its established character identity, clothing, accessories, setting, pose logic, and visual style whenever the recent roleplay does not explicitly change them.' : 'Derive clothing, accessories, condition, and setting from the recent roleplay context, carrying forward the established appearance when no change is described.'}

Use a clean, wordless visual composition with cinematic framing.

Current roleplay context:
${history || 'No chat messages are available.'}`;
}

async function generateOpenRouter(key, prompt, references) {
    const s = settings();
    // Only portable parameters go here. Image models have different optional knobs;
    // sending an unsupported `quality` or `output_format` causes OpenRouter to reject the request.
    const body = { model: s.openrouterModel, prompt, aspect_ratio: s.aspectRatio, n: 1 };
    if (references.length) body.input_references = references.map(reference => ({ type: 'image_url', image_url: { url: reference.dataUrl } }));
    const response = await fetch('https://openrouter.ai/api/v1/images', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error?.message || json.message || 'OpenRouter recusou a solicitação.');
    const image = json.data?.[0];
    if (!image?.b64_json) throw new Error('A resposta do OpenRouter não trouxe uma imagem.');
    return { dataUrl: `data:${image.media_type || 'image/png'};base64,${image.b64_json}`, cost: json.usage?.cost };
}

async function generateGoogle(key, prompt, references) {
    const s = settings();
    const input = [{ type: 'text', text: prompt }];
    input.push(...references.map(reference => ({ type: 'image', mime_type: reference.mimeType, data: reference.data })));
    const body = { model: s.googleModel, input, response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: s.aspectRatio, image_size: '1K' } };
    const response = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const json = await response.json();
    if (!response.ok) throw new Error(json.error?.message || 'Google recusou a solicitação.');
    const image = json.output_image || json.steps?.flatMap(step => step.content || []).find(part => part.type === 'image');
    if (!image?.data) throw new Error('A resposta do Google não trouxe uma imagem.');
    return { dataUrl: `data:${image.mime_type || 'image/png'};base64,${image.data}` };
}

function showImage(result) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    $('#rvl_result').empty().append($('<img>', { src: result.dataUrl, alt: 'Imagem gerada do roleplay' })).append($('<a>', { href: result.dataUrl, download: `roleplay-visual-${stamp}.png`, text: 'Baixar imagem' }));
}

function renderChatActions() {
    const context = SillyTavern.getContext();
    const hasRoleplayChat = context.groupId != null || Boolean(context.characters?.[context.characterId]?.avatar);
    if (!hasRoleplayChat || !$('#send_form').length) {
        $('#rvl_chat_actions').remove();
        return;
    }
    if ($('#rvl_chat_actions').length) return;
    const toolbar = $('<div>', { id: 'rvl_chat_actions', class: 'rvl-chat-actions', title: 'Gerar imagem do roleplay' });
    toolbar.append($('<button>', { class: 'menu_button', type: 'button', 'data-rvl-mode': 'scene', html: '<i class="fa-solid fa-image"></i> Cena' }));
    toolbar.append($('<button>', { class: 'menu_button', type: 'button', 'data-rvl-mode': 'pov', html: '<i class="fa-solid fa-eye"></i> POV' }));
    toolbar.append($('<button>', { class: 'menu_button', type: 'button', 'data-rvl-mode': 'look', html: '<i class="fa-solid fa-shirt"></i> Visual' }));
    $('#send_form').before(toolbar);
    toolbar.on('click', '[data-rvl-mode]', event => run($(event.currentTarget).data('rvl-mode')));
}

/** Saves the generated data URL as a SillyTavern media file and adds it to the active chat. */
async function publishToChat(result, mode) {
    const image = dataUrlToImage(result.dataUrl);
    if (!image) throw new Error('A imagem gerada tem um formato inválido.');
    const extension = image.mimeType.split('/')[1] || 'png';
    const fileName = `roleplay_visual_${Date.now()}`;
    const url = await saveBase64AsFile(image.data, 'Roleplay Visual Director', fileName, extension);
    const modeName = { scene: 'Cena', pov: 'POV do jogador', look: 'Visual e roupas' }[mode] || 'Imagem';
    const message = {
        name: 'Roleplay Visual Director',
        is_user: false,
        is_system: true,
        send_date: Date.now(),
        mes: `[Roleplay Visual Director: ${modeName}]`,
        extra: { media: [{ url, type: 'image', title: modeName, source: 'api' }], inline_image: true, [MODULE_NAME]: { imageUrl: url, mode } },
    };
    const context = SillyTavern.getContext();
    context.chat.push(message);
    addOneMessage(message);
    await saveChatConditional();
    return { messageId: context.chat.length - 1, mode };
}

function attachFeedbackControls(messageId, mode) {
    const messageElement = $(`#chat .mes[mesid="${messageId}"]`).length ? $(`#chat .mes[mesid="${messageId}"]`) : $('#chat .mes').last();
    if (!messageElement.length || messageElement.find(`#rvl_feedback_${messageId}`).length) return;
    const feedback = $('<div>', { id: `rvl_feedback_${messageId}`, class: 'rvl-feedback' });
    feedback.append($('<button>', { class: 'menu_button rvl-like', type: 'button', title: 'Gostei: usar como referência de continuidade', html: '<i class="fa-solid fa-thumbs-up"></i>' }));
    feedback.append($('<button>', { class: 'menu_button rvl-dislike', type: 'button', title: 'Refazer esta imagem', html: '<i class="fa-solid fa-thumbs-down"></i>' }));
    feedback.on('click', '.rvl-like', () => approveImage(messageId));
    feedback.on('click', '.rvl-dislike', () => dislikeImage(messageId, mode));
    messageElement.append(feedback);
}

function restoreFeedbackControls() {
    const context = SillyTavern.getContext();
    (context.chat || []).forEach((message, messageId) => {
        const record = message.extra?.[MODULE_NAME];
        if (record?.imageUrl) attachFeedbackControls(messageId, record.mode);
    });
}

async function run(mode) {
    const provider = $('#rvl_provider').val();
    const key = $('#rvl_api_key').val().trim() || apiKeyFor(provider);
    if (!key) return notice('Cole a chave da API para este provedor.', true);
    saveApiKey(provider, key, $('#rvl_remember_key').prop('checked'));
    $('#rvl_api_key').val('');
    try {
        notice('Preparando contexto e referência do personagem…');
        const references = await characterReferences();
        notice('Gerando imagem… isto pode levar alguns segundos.');
        const prompt = buildPrompt(mode, references);
        const result = provider === 'google' ? await generateGoogle(key, prompt, references) : await generateOpenRouter(key, prompt, references);
        showImage(result);
        notice('Enviando imagem para o chat…');
        const published = await publishToChat(result, mode);
        attachFeedbackControls(published.messageId, published.mode);
        notice(result.cost != null ? `Imagem criada. Custo informado: US$ ${Number(result.cost).toFixed(4)}.` : 'Imagem criada.');
    } catch (error) { console.error(`[${MODULE_NAME}]`, error); notice(error.message || 'Falha ao gerar a imagem.', true); }
}

function syncUi() {
    const s = settings();
    const provider = $('#rvl_provider').val();
    const modelKey = provider === 'google' ? 'googleModel' : 'openrouterModel';
    const selected = s[modelKey];
    const choices = choicesFor(provider);
    const modelSelect = $('#rvl_model').empty();
    for (const [value, label] of choices) modelSelect.append($('<option>', { value, text: label }));
    if (!choices.some(([value]) => value === selected)) modelSelect.append($('<option>', { value: selected, text: `${selected} — personalizado` }));
    modelSelect.val(selected);
    $('#rvl_refresh_models').prop('disabled', provider !== 'openrouter');
    $('#rvl_aspect').val(s.aspectRatio); $('#rvl_quality').val(s.quality); $('#rvl_messages').val(s.messages); $('#rvl_remember_key').prop('checked', Boolean(persistentKeys()[provider]));
}

async function init() {
    const context = SillyTavern.getContext(); settings();
    const html = await context.renderExtensionTemplateAsync('third-party/roleplay-visual-director', 'settings');
    $('#extensions_settings2').append(html);
    syncUi();
    $('#rvl_provider').on('change', syncUi);
    $('#rvl_refresh_models').on('click', refreshOpenRouterCatalog);
    $('#rvl_remember_key').on('change', function () { if (!this.checked) forgetPersistentKey($('#rvl_provider').val()); });
    $('#rvl_model, #rvl_aspect, #rvl_quality, #rvl_messages').on('change', function () {
        const s = settings(); const provider = $('#rvl_provider').val();
        if (this.id === 'rvl_model') s[provider === 'google' ? 'googleModel' : 'openrouterModel'] = this.value.trim();
        else if (this.id === 'rvl_aspect') s.aspectRatio = this.value;
        else if (this.id === 'rvl_quality') s.quality = this.value;
        else s.messages = Math.max(1, Math.min(30, Number(this.value) || defaults.messages));
        context.saveSettingsDebounced();
    });
    $('#rvl_scene').on('click', () => run('scene')); $('#rvl_pov').on('click', () => run('pov')); $('#rvl_look').on('click', () => run('look'));
    if (apiKeyFor('openrouter')) refreshOpenRouterCatalog();
    renderChatActions();
    restoreFeedbackControls();
    context.eventSource.on(context.event_types.CHAT_CHANGED, () => setTimeout(() => {
        renderChatActions();
        restoreFeedbackControls();
    }, 250));
}

SillyTavern.getContext().eventSource.on(SillyTavern.getContext().event_types.APP_READY, init);
