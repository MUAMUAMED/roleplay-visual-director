import { addOneMessage, saveChatConditional } from '../../../../script.js';
import { saveBase64AsFile } from '../../../../scripts/utils.js';

const MODULE_NAME = 'roleplay_visual_director';
const SESSION_KEY = `${MODULE_NAME}_api_keys`;
const PERSISTENT_KEY = `${MODULE_NAME}_saved_api_keys`;
const defaults = Object.freeze({ provider: 'openrouter', openrouterModel: 'google/gemini-2.5-flash-image', googleModel: 'gemini-3.1-flash-image', novitaModel: 'sd_xl_base_1.0.safetensors', aspectRatio: '1:1', quality: 'auto', messages: 8 });
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
    novita: [
        ['sd_xl_base_1.0.safetensors', 'SDXL Base 1.0'],
        ['novita/z-image-turbo-lora', 'Z Image Turbo LoRA'],
        ['novita/z-image-turbo', 'Z Image Turbo'],
        ['novita/flux-2-pro', 'FLUX 2 Pro'],
        ['novita/flux-2-flex', 'FLUX 2 Flex'],
        ['novita/flux-2-dev', 'FLUX 2 Dev'],
        ['novita/seedream-4.0', 'Seedream 4.0'],
        ['novita/qwen-image-t2i', 'Qwen-Image Text to Image'],
        ['novita/qwen-image-edit', 'Qwen-Image Edit'],
        ['novita/flux-1-kontext-dev', 'FLUX.1 Kontext Dev'],
        ['novita/flux-1-kontext-pro', 'FLUX.1 Kontext Pro'],
        ['novita/flux-1-kontext-max', 'FLUX.1 Kontext Max'],
    ],
});
let openRouterCatalog = [];
let novitaCatalog = [];

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

function modelSettingKey(provider) { return provider === 'google' ? 'googleModel' : provider === 'novita' ? 'novitaModel' : 'openrouterModel'; }

function choicesFor(provider) {
    if (provider === 'openrouter' && openRouterCatalog.length) return openRouterCatalog.map(model => {
        const acceptsReferences = Boolean(model.supported_parameters?.input_references);
        const displayName = model.name || model.id;
        return [model.id, `${displayName}${acceptsReferences ? ' — aceita referências' : ''}`];
    });
    if (provider === 'novita') return modelChoices.novita;
    return modelChoices[provider] || [];
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

async function refreshNovitaCatalog() {
    const key = $('#rvl_api_key').val().trim() || apiKeyFor('novita');
    if (!key) return notice('Cole ou lembre sua chave Novita antes de atualizar o catálogo.', true);
    try {
        notice('Buscando todos os checkpoints de imagem disponíveis na Novita…');
        const models = [];
        const seen = new Set();
        let cursor = 'c_0';
        while (cursor && !seen.has(cursor)) {
            seen.add(cursor);
            const query = new URLSearchParams({ 'filter.types': 'checkpoint', 'pagination.limit': '100', 'pagination.cursor': cursor });
            const response = await fetch(`https://api.novita.ai/v3/model?${query}`, { headers: { Authorization: `Bearer ${key}` } });
            const json = await response.json();
            if (!response.ok) throw new Error(json.message || json.error?.message || 'Não foi possível carregar o catálogo Novita.');
            models.push(...(json.models || []).filter(model => model?.status === 1 && (model.sd_name_in_api || model.sd_name)).map(model => ({
                id: model.sd_name_in_api || model.sd_name,
                name: model.name || model.sd_name_in_api || model.sd_name,
                baseModel: model.base_model,
            })));
            cursor = json.pagination?.next_cursor;
            // Novita can expose thousands of checkpoints. Populate the select as
            // soon as the first page arrives instead of making the UI look frozen.
            novitaCatalog = [...new Map(models.map(model => [model.id, model])).values()].sort((a, b) => a.name.localeCompare(b.name));
            syncUi();
            notice(cursor ? `${novitaCatalog.length} modelos Novita carregados; buscando mais…` : `${novitaCatalog.length} modelos de imagem carregados da Novita.`);
            await wait(0);
        }
        if (!novitaCatalog.length) throw new Error('A Novita não retornou checkpoints de imagem disponíveis.');
    } catch (error) {
        console.error(`[${MODULE_NAME}] Could not load Novita image models.`, error);
        notice(error.message || 'Não foi possível carregar o catálogo Novita.', true);
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
    // SillyTavern 1.14+ provides this context API, which removes the message
    // from both the visible chat and its saved history before regenerating.
    if (typeof context.deleteMessage === 'function') {
        await context.deleteMessage(messageId);
    } else {
        context.chat.splice(messageId, 1);
        $(`#chat .mes[mesid="${messageId}"]`).remove();
        $('#chat .mes[mesid]').each((index, element) => $(element).attr('mesid', index));
        await saveChatConditional();
    }
    return run(mode);
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

function aspectSize(aspectRatio) {
    return ({ '16:9': [1344, 768], '9:16': [768, 1344], '4:3': [1024, 768], '3:4': [768, 1024], '1:1': [1024, 1024] })[aspectRatio] || [1024, 1024];
}

function wait(milliseconds) { return new Promise(resolve => setTimeout(resolve, milliseconds)); }

function novitaSafePrompt(prompt) {
    const characters = Array.from(prompt || '');
    if (characters.length <= 1024) return prompt;
    const contextMarker = '\n\nCurrent roleplay context:\n';
    const markerIndex = prompt.indexOf(contextMarker);
    if (markerIndex < 0) return characters.slice(0, 1024).join('');
    const instructions = Array.from(prompt.slice(0, markerIndex));
    const context = Array.from(prompt.slice(markerIndex + contextMarker.length));
    const contextBudget = 300;
    const instructionBudget = 1024 - Array.from(contextMarker).length - contextBudget;
    return `${instructions.slice(0, instructionBudget).join('')}${contextMarker}${context.slice(-contextBudget).join('')}`;
}

async function novitaImageFromUrl(url) {
    const imageResponse = await fetch(url);
    if (!imageResponse.ok) throw new Error('A Novita gerou a imagem, mas ela não pôde ser baixada.');
    const blob = await imageResponse.blob();
    return new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
}

async function waitForNovitaTask(key, taskId) {
    for (let attempt = 0; attempt < 60; attempt++) {
        await wait(1000);
        const resultResponse = await fetch(`https://api.novita.ai/v3/async/task-result?task_id=${encodeURIComponent(taskId)}`, { headers: { Authorization: `Bearer ${key}` } });
        const result = await resultResponse.json();
        const status = result.task?.status;
        if (status === 'TASK_STATUS_SUCCEED' && result.images?.[0]?.image_url) return { dataUrl: await novitaImageFromUrl(result.images[0].image_url) };
        if (status === 'TASK_STATUS_FAILED' || status === 'TASK_STATUS_ERROR') throw new Error(result.task?.reason || 'A Novita não conseguiu gerar a imagem.');
    }
    throw new Error('A Novita demorou mais de 60 segundos para responder.');
}

async function generateNovitaNative(key, model, prompt, references, width, height, aspectRatio) {
    const images = references.slice(0, 4).map(reference => reference.dataUrl);
    // A API nativa da Novita aceita dimensões no formato "largura*altura",
    // diferente de APIs que usam "larguraxaltura".
    const size = `${width}*${height}`;
    const native = {
        'novita/z-image-turbo-lora': { endpoint: 'z-image-turbo-lora', body: { prompt, size, seed: -1 } },
        'novita/z-image-turbo': { endpoint: 'z-image-turbo', body: { prompt, size, seed: -1 } },
        'novita/flux-2-pro': { endpoint: 'flux-2-pro', body: { prompt, size, seed: -1, ...(images.length ? { images } : {}) } },
        'novita/flux-2-flex': { endpoint: 'flux-2-flex', body: { prompt, size, seed: -1, ...(images.length ? { images } : {}) } },
        'novita/flux-2-dev': { endpoint: 'flux-2-dev', body: { prompt, size, seed: -1, ...(images.length ? { images } : {}) } },
        'novita/qwen-image-t2i': { endpoint: 'qwen-image-txt2img', body: { prompt, size } },
        'novita/qwen-image-edit': { endpoint: 'qwen-image-edit', body: { prompt, size, images } },
        'novita/flux-1-kontext-dev': { endpoint: 'flux-1-kontext-dev', body: { prompt, size, images, seed: -1, num_images: 1, num_inference_steps: 28, guidance_scale: 3.5, output_format: 'jpeg' } },
        'novita/flux-1-kontext-pro': { endpoint: 'flux-1-kontext-pro', body: { prompt, images, seed: -1, guidance_scale: 3.5, aspect_ratio: aspectRatio } },
        'novita/flux-1-kontext-max': { endpoint: 'flux-1-kontext-max', body: { prompt, images, seed: -1, guidance_scale: 3.5, aspect_ratio: aspectRatio } },
    }[model];
    if (model === 'novita/seedream-4.0') {
        const response = await fetch('https://api.novita.ai/v3/seedream-4.0', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, size, images, watermark: false, sequential_image_generation: 'disabled' }) });
        const result = await response.json();
        const imageUrl = typeof result.images?.[0] === 'string' ? result.images[0] : result.images?.[0]?.image_url;
        if (!response.ok || !imageUrl) throw new Error(result.message || result.error?.message || 'Seedream 4.0 da Novita recusou a solicitação.');
        return { dataUrl: await novitaImageFromUrl(imageUrl) };
    }
    if (!native) return null;
    const response = await fetch(`https://api.novita.ai/v3/async/${native.endpoint}`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(native.body) });
    const result = await response.json();
    if (!response.ok || !result.task_id) throw new Error(result.message || result.error?.message || 'Novita recusou a solicitação.');
    return waitForNovitaTask(key, result.task_id);
}

async function novitaReferenceSheet(references) {
    const selected = references.slice(0, 4);
    if (selected.length <= 1) return selected[0] || null;
    const images = await Promise.all(selected.map(reference => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = reference.dataUrl;
    })));
    const columns = selected.length <= 2 ? selected.length : 2;
    const rows = Math.ceil(selected.length / columns);
    const cell = 512;
    const canvas = document.createElement('canvas');
    canvas.width = columns * cell;
    canvas.height = rows * cell;
    const drawing = canvas.getContext('2d');
    drawing.fillStyle = '#111';
    drawing.fillRect(0, 0, canvas.width, canvas.height);
    images.forEach((image, index) => {
        const scale = Math.max(cell / image.naturalWidth, cell / image.naturalHeight);
        const width = image.naturalWidth * scale;
        const height = image.naturalHeight * scale;
        const x = (index % columns) * cell + (cell - width) / 2;
        const y = Math.floor(index / columns) * cell + (cell - height) / 2;
        drawing.drawImage(image, x, y, width, height);
    });
    return dataUrlToImage(canvas.toDataURL('image/jpeg', 0.92));
}

async function generateNovita(key, prompt, references) {
    const s = settings();
    const [width, height] = aspectSize(s.aspectRatio);
    const safePrompt = novitaSafePrompt(prompt);
    const nativeResult = await generateNovitaNative(key, s.novitaModel, safePrompt, references, width, height, s.aspectRatio);
    if (nativeResult) return nativeResult;
    const request = { model_name: s.novitaModel, prompt: safePrompt, width, height, image_num: 1, steps: 28, seed: -1, clip_skip: 1, guidance_scale: 6.5, sampler_name: 'Euler' };
    // Standard Novita img2img accepts one base image. A contact sheet preserves
    // both the active avatar(s) and the image approved with 👍 in that slot.
    const baseReference = await novitaReferenceSheet(references);
    const endpoint = baseReference ? 'img2img' : 'txt2img';
    if (baseReference) request.image_base64 = baseReference.data;
    const response = await fetch(`https://api.novita.ai/v3/async/${endpoint}`, {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ extra: { response_image_type: 'jpeg' }, request }),
    });
    const submitted = await response.json();
    if (!response.ok || !submitted.task_id) throw new Error(submitted.message || submitted.error?.message || 'Novita recusou a solicitação.');
    return waitForNovitaTask(key, submitted.task_id);
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
        const result = provider === 'google' ? await generateGoogle(key, prompt, references) : provider === 'novita' ? await generateNovita(key, prompt, references) : await generateOpenRouter(key, prompt, references);
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
    const modelKey = modelSettingKey(provider);
    const selected = s[modelKey];
    const choices = choicesFor(provider);
    const modelSelect = $('#rvl_model').empty();
    for (const [value, label] of choices) modelSelect.append($('<option>', { value, text: label }));
    if (!choices.some(([value]) => value === selected)) modelSelect.append($('<option>', { value: selected, text: `${selected} — personalizado` }));
    modelSelect.val(selected);
    $('#rvl_catalog_tools').toggle(provider === 'openrouter');
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
        if (this.id === 'rvl_model') s[modelSettingKey(provider)] = this.value.trim();
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
