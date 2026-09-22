import { addOneMessage, saveChatConditional } from '../../../../script.js';
import { saveBase64AsFile } from '../../../../scripts/utils.js';

const MODULE_NAME = 'roleplay_visual_director';
const SESSION_KEY = `${MODULE_NAME}_api_keys`;
const PERSISTENT_KEY = `${MODULE_NAME}_saved_api_keys`;

const DEFAULT_PROXY_URL_EXTERNAL = 'https://antigravity21.zeabur.app/v1';
const DEFAULT_PROXY_URL_INTERNAL = 'http://cliproxyapi-musess.zeabur.internal:8317/v1';
const DEFAULT_PROXY_KEY = 'sk-antigravity21-secure-key';

const defaults = Object.freeze({
    provider: 'proxy',
    proxyUrl: DEFAULT_PROXY_URL_EXTERNAL,
    proxyModel: 'gemini-3.1-flash-image',
    proxyChatModel: 'gemini-3.8-flash-high',
    openrouterModel: 'google/gemini-2.5-flash-image',
    googleModel: 'gemini-3.1-flash-image',
    novitaModel: 'sd_xl_base_1.0.safetensors',
    aspectRatio: '1:1',
    quality: 'auto',
    messages: 8,
    includePlayerReference: true,
});

const modelChoices = Object.freeze({
    proxy: [
        ['gpt-image-2.5', 'GPT Image 2.5 — OpenAI Mais Potente (com Referência Direta)'],
        ['gemini-3.1-flash-image', 'Google Gemini — Pool Automático (7 Contas, Visão Nativa)'],
        ['google1/gemini-3.1-flash-image', 'Google Conta 1 — Gemini 3.1 Flash Image'],
        ['google2/gemini-3.1-flash-image', 'Google Conta 2 — Gemini 3.1 Flash Image'],
        ['google3/gemini-3.1-flash-image', 'Google Conta 3 — Gemini 3.1 Flash Image'],
        ['google4/gemini-3.1-flash-image', 'Google Conta 4 — Gemini 3.1 Flash Image'],
        ['google5/gemini-3.1-flash-image', 'Google Conta 5 — Gemini 3.1 Flash Image'],
        ['google6/gemini-3.1-flash-image', 'Google Conta 6 — Gemini 3.1 Flash Image'],
        ['google7/gemini-3.1-flash-image', 'Google Conta 7 — Gemini 3.1 Flash Image'],
        ['codex/gpt-image-2.5', 'Codex GPT Image 2.5'],
        ['gpt-image-2', 'GPT Image 2.0'],
        ['gpt-image-2.5-flare', 'GPT Image 2.5 Flare'],
        ['gpt-image-2.5-sunburst', 'GPT Image 2.5 Sunburst'],
    ],
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

let proxyCatalog = [];
let openRouterCatalog = [];
let novitaCatalog = [];

function settings() {
    const context = SillyTavern.getContext();
    context.extensionSettings[MODULE_NAME] = { ...defaults, ...(context.extensionSettings[MODULE_NAME] || {}) };
    return context.extensionSettings[MODULE_NAME];
}

function getStoredKeys(storageKey) {
    try {
        return JSON.parse(localStorage.getItem(storageKey) || sessionStorage.getItem(storageKey) || '{}');
    } catch {
        return {};
    }
}

function sessionKeys() { return getStoredKeys(SESSION_KEY); }
function persistentKeys() { return getStoredKeys(PERSISTENT_KEY); }

function apiKeyFor(provider) {
    const key = sessionKeys()[provider] || persistentKeys()[provider] || '';
    if (!key && provider === 'proxy') return DEFAULT_PROXY_KEY;
    return key;
}

function saveApiKey(provider, key, remember) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ ...sessionKeys(), [provider]: key }));
    const saved = persistentKeys();
    if (remember) saved[provider] = key;
    else delete saved[provider];
    localStorage.setItem(PERSISTENT_KEY, JSON.stringify(saved));
}

function forgetPersistentKey(provider) {
    const saved = persistentKeys();
    delete saved[provider];
    localStorage.setItem(PERSISTENT_KEY, JSON.stringify(saved));
}

function notice(message, error = false) {
    $('#rvl_status').text(message).toggleClass('rvl-error', error);
}

function modelSettingKey(provider) {
    switch (provider) {
        case 'proxy': return 'proxyModel';
        case 'google': return 'googleModel';
        case 'novita': return 'novitaModel';
        default: return 'openrouterModel';
    }
}

function choicesFor(provider) {
    if (provider === 'proxy' && proxyCatalog.length) {
        return proxyCatalog.map(m => [m.id, m.name || m.id]);
    }
    if (provider === 'openrouter' && openRouterCatalog.length) {
        return openRouterCatalog.map(model => {
            const acceptsReferences = Boolean(model.supported_parameters?.input_references);
            const displayName = model.name || model.id;
            return [model.id, `${displayName}${acceptsReferences ? ' — aceita referências' : ''}`];
        });
    }
    if (provider === 'novita') return modelChoices.novita;
    return modelChoices[provider] || [];
}

async function refreshProxyCatalog() {
    const s = settings();
    const url = (s.proxyUrl || DEFAULT_PROXY_URL_EXTERNAL).replace(/\/+$/, '');
    const key = $('#rvl_api_key').val().trim() || apiKeyFor('proxy');
    try {
        notice('Buscando todos os modelos do Proxy…');
        const response = await fetch(`${url}/models`, {
            headers: { Authorization: `Bearer ${key}` },
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error?.message || json.message || 'Não foi possível carregar o catálogo do Proxy.');
        const allModels = json.data || [];
        const imageModels = allModels.filter(m => {
            const id = (m.id || '').toLowerCase();
            return id.includes('image') || id.includes('flux') || id.includes('sd') || id.includes('paint');
        });
        const targetList = imageModels.length ? imageModels : allModels;
        proxyCatalog = targetList.map(m => {
            let label = m.id;
            if (m.id === 'gpt-image-2.5') {
                label = 'GPT Image 2.5 — OpenAI Mais Potente (com Referência Direta)';
            } else if (m.id === 'gemini-3.1-flash-image') {
                label = 'Google Gemini — Pool Automático (7 Contas, Visão Nativa)';
            } else if (m.id.startsWith('google') && m.id.includes('image')) {
                const acct = m.id.split('/')[0];
                label = `${acct.toUpperCase()} — ${m.id}`;
            }
            return { id: m.id, name: label };
        }).sort((a, b) => a.id.localeCompare(b.id));

        syncUi();
        notice(`${proxyCatalog.length} modelos de imagem identificados no Proxy.`);
    } catch (error) {
        console.error(`[${MODULE_NAME}] Could not load Proxy models:`, error);
        notice(error.message || 'Falha ao buscar modelos do Proxy.', true);
    }
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
    if (record?.imageUrl && memory.lastApprovedImage?.url === record.imageUrl) {
        delete memory.lastApprovedImage;
        await context.saveMetadata();
    }
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

function dataUrlToBlob(dataUrl) {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}

async function imageElementToDataUrl(imgElement) {
    if (!imgElement) return null;
    return new Promise((resolve) => {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = imgElement.naturalWidth || imgElement.width || 400;
            canvas.height = imgElement.naturalHeight || imgElement.height || 400;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(imgElement, 0, 0);
            resolve(canvas.toDataURL('image/png'));
        } catch {
            resolve(null);
        }
    });
}

/**
 * Loads image reference prioritising the FULL-RESOLUTION original file on server over cropped thumbnails.
 */
async function loadImageReference(urlOrElement, name, role) {
    if (!urlOrElement) return null;
    if (typeof urlOrElement === 'string' && urlOrElement.startsWith('data:image/')) {
        const parsed = dataUrlToImage(urlOrElement);
        if (parsed) return { ...parsed, name, role };
    }
    if (typeof urlOrElement === 'object' && urlOrElement.naturalWidth) {
        const dataUrl = await imageElementToDataUrl(urlOrElement);
        if (dataUrl) {
            const parsed = dataUrlToImage(dataUrl);
            if (parsed) return { ...parsed, name, role };
        }
    }

    const url = String(urlOrElement);
    const candidateUrls = [];

    // Extract true file name if given a thumbnail url (e.g. ?file=character.png or /thumbnail?...)
    let baseFileName = url.replace(/^[/\\]+/, '');
    if (baseFileName.includes('=')) {
        baseFileName = baseFileName.substring(baseFileName.lastIndexOf('=') + 1);
    }

    // 1. Prioridade máxima: Arquivo original em resolução nativa
    candidateUrls.push(`/characters/${encodeURIComponent(baseFileName)}`);
    candidateUrls.push(`/characters/${baseFileName}`);
    candidateUrls.push(`/User%20Avatars/${encodeURIComponent(baseFileName)}`);
    candidateUrls.push(`/User%20Avatars/${baseFileName}`);
    candidateUrls.push(`/api/characters/avatar?avatar=${encodeURIComponent(baseFileName)}`);

    if (/^https?:\/\//i.test(url) || url.startsWith('data:')) {
        candidateUrls.push(url);
    } else {
        candidateUrls.push(url.startsWith('/') ? url : `/${url}`);
    }

    for (const candidate of candidateUrls) {
        try {
            const response = await fetch(candidate);
            if (response.ok) {
                const blob = await response.blob();
                if (blob && blob.size > 100) {
                    const image = await new Promise(resolve => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(dataUrlToImage(reader.result));
                        reader.onerror = () => resolve(null);
                        reader.readAsDataURL(blob);
                    });
                    if (image) {
                        return { ...image, name, role };
                    }
                }
            }
        } catch {
            // try next candidate URL
        }
    }

    // Fallback: search rendered DOM img elements in SillyTavern
    try {
        const domImgs = $(`#chat .mes[is_user="false"] .avatar img, #rm_info_avatar img, #avatar-and-name-block img, .character_select img, img[alt="${name}"]`);
        for (const el of domImgs.toArray()) {
            if (el.complete && el.naturalWidth > 0) {
                const dataUrl = await imageElementToDataUrl(el);
                if (dataUrl) {
                    const parsed = dataUrlToImage(dataUrl);
                    if (parsed) return { ...parsed, name, role };
                }
            }
        }
    } catch {
        // DOM fallback failed
    }

    return null;
}

function playerAvatarSource() {
    const selectors = [
        '#user_avatar_block .avatar.selected img',
        '#user_avatar_block .selected img',
        '#user_avatar_block .avatar img',
        '#chat .mes[is_user="true"] .avatar img',
        '#chat .mes .avatar img[src*="User Avatars"]',
        '#chat .mes .avatar img[src*="User%20Avatars"]',
    ];
    for (const selector of selectors) {
        const source = $(selector).first().attr('src');
        if (source) return source;
    }
    return '';
}

async function characterReferences() {
    const context = SillyTavern.getContext();
    const allCharacters = context.characters || [];
    
    // Resolve active character robustly (by numeric or string ID, or by scanning chat)
    let active = null;
    if (context.characterId !== undefined && context.characterId !== null) {
        active = allCharacters[Number(context.characterId)] || allCharacters[context.characterId];
    }
    if (!active) {
        // Find by name from chat
        const lastNonUsr = (context.chat || []).slice().reverse().find(m => !m.is_user && m.name);
        if (lastNonUsr) {
            active = allCharacters.find(c => c.name === lastNonUsr.name);
        }
    }
    if (!active && allCharacters.length === 1) {
        active = allCharacters[0];
    }

    const activeGroup = context.groupId != null
        ? (context.groups || []).find(group => group.id === context.groupId)
        : null;

    const groupAvatars = new Set(activeGroup?.members || []);
    const charactersToLoad = activeGroup
        ? allCharacters.filter(character => character.avatar && groupAvatars.has(character.avatar)).slice(0, 4)
        : (active ? [active] : []);

    const references = await Promise.all(charactersToLoad.map(async character => {
        // Pede DIRETAMENTE o caminho do arquivo original em alta resolução (/characters/nome.png)
        let fullResUrl = '';
        if (character.avatar) {
            fullResUrl = `/characters/${encodeURIComponent(character.avatar)}`;
        }
        if (!fullResUrl && typeof context.getThumbnailUrl === 'function' && character.avatar) {
            try { fullResUrl = context.getThumbnailUrl('avatar', character.avatar); } catch {}
        }
        if (!fullResUrl) {
            const chatAvatarImg = $('#chat .mes[is_user="false"] .avatar img').first().attr('src');
            if (chatAvatarImg) fullResUrl = chatAvatarImg;
        }

        const ref = await loadImageReference(fullResUrl, character.name || currentCharacterName(), 'character');
        if (ref) {
            if (character.description) ref.charDescription = character.description;
        }
        return ref;
    }));

    const validReferences = references.filter(Boolean);

    // Fallback if no reference found through characters array: directly capture the character avatar from the chat DOM!
    if (!validReferences.some(r => r.role === 'character')) {
        try {
            const chatCharImg = $('#chat .mes[is_user="false"] .avatar img').last()[0] || $('#chat .mes[is_user="false"] .avatar img').first()[0];
            if (chatCharImg) {
                const domRef = await loadImageReference(chatCharImg, currentCharacterName(), 'character');
                if (domRef) validReferences.unshift(domRef);
            }
        } catch {}
    }

    if (settings().includePlayerReference) {
        // Tenta resolver a foto de perfil original do jogador em alta resolução
        let playerFullUrl = '';
        const userAvatarId = context.powerUserSettings?.user_avatar || context.user_avatar;
        if (userAvatarId) {
            playerFullUrl = `/User%20Avatars/${encodeURIComponent(userAvatarId)}`;
        }
        if (!playerFullUrl) {
            playerFullUrl = playerAvatarSource();
        }
        const playerRef = await loadImageReference(playerFullUrl, context.name1 || 'the player', 'player');
        if (playerRef) validReferences.push(playerRef);
    }
    const approved = getVisualMemory().lastApprovedImage;
    if (approved?.url) {
        try {
            const response = await fetch(approved.url);
            if (response.ok) {
                const blob = await response.blob();
                const image = await new Promise(resolve => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(dataUrlToImage(reader.result));
                    reader.readAsDataURL(blob);
                });
                if (image) validReferences.push({ ...image, name: 'approved continuity image', continuity: true, role: 'continuity' });
            }
        } catch {
            console.warn(`[${MODULE_NAME}] Could not load approved continuity image.`);
        }
    }
    return validReferences.slice(0, 5);
}

function currentCharacterName() {
    const context = SillyTavern.getContext();
    return context.characters?.[context.characterId]?.name 
        || (context.chat || []).slice().reverse().find(m => !m.is_user && m.name)?.name 
        || 'the active character';
}

function buildPrompt(mode, references) {
    const context = SillyTavern.getContext();
    const s = settings();
    const charName = currentCharacterName();

    let charVisualTraits = '';
    const charRef = references.find(r => r.role === 'character');
    if (charRef?.charDescription) {
        const cleanDesc = String(charRef.charDescription)
            .replace(/<[^>]*>/g, '')
            .replace(/\[.*?\]/g, '')
            .slice(0, 500)
            .trim();
        if (cleanDesc) {
            charVisualTraits = `\nCHARACTER VISUAL IDENTITY DETAILS:\nName: ${charName}\nAppearance & traits: ${cleanDesc}\n`;
        }
    }

    const history = (context.chat || []).slice(-Number(s.messages)).map(m => `${m.is_user ? 'Player' : charName}: ${String(m.mes || '').replace(/<[^>]*>/g, '').trim()}`).filter(Boolean).join('\n');
    const modeInstruction = {
        scene: `Create a cinematic third-person scene featuring ${charName} from the current roleplay moment.`,
        pov: `Create a true first-person POV roleplay image featuring ${charName}: the camera IS physically the adult male player's eyes, looking directly at ${charName} at eye level. ${charName} is the focal point of the shot, interacting directly toward the camera/player. The player is behind the camera and MUST NOT be drawn as a separate standing person.`,
        look: `Create a clear full-body character reference of ${charName} exactly as they currently appear. Make clothing, accessories, hairstyle, expression, posture, and visible condition easy to read. Use the player's point of view as if standing in front of them.`,
    }[mode];

    const approvedContinuity = references.some(reference => reference.continuity);
    const referenceRoles = references.length
        ? references.map((reference, index) => reference.continuity
            ? `Image ${index + 1}: the approved previous scene. Use it as the continuity reference for the same clothing, accessories, setting, and visual style.`
            : reference.role === 'player'
                ? `Image ${index + 1}: ${reference.name}'s player avatar. Use it as the authoritative identity only when the player is visibly present in a third-person scene or as natural foreground body parts in POV.`
                : `Image ${index + 1}: PRIMARY CHARACTER REFERENCE for ${reference.name}. You MUST faithfully reproduce this character's exact face, facial features, hair style, hair color, eye color, and overall appearance from this image. Do NOT invent a random character.`).join('\n')
        : 'There are no visual references for this request.';

    return `CRITICAL INSTRUCTION:
You are generating an image based directly on the attached visual reference images.
${referenceRoles}
${charVisualTraits}
${modeInstruction}

MANDATORY CHARACTER LOCK:
- The character ${charName} in the generated image MUST match the visual identity, face structure, eye color, and hair style from the attached character reference image.
- Do NOT replace ${charName} with a generic or random person. Maintain complete fidelity to the reference image.

CAST COMPOSITION:
Depict exactly ${charName} and the interaction with the player. In POV mode, only show ${charName} in front of the lens.

Use a clean, wordless visual composition with cinematic framing.

Current roleplay context:
${history || 'No chat messages are available.'}`;
}

async function generateProxy(key, prompt, references) {
    const s = settings();
    const url = (s.proxyUrl || DEFAULT_PROXY_URL_EXTERNAL).replace(/\/+$/, '');
    const model = s.proxyModel || 'gpt-image-2.5';
    const isGemini = model.includes('gemini') || model.startsWith('google');

    if (isGemini) {
        // Enforce strong visual references first so Gemini pays highest attention to the reference images
        const contentParts = [];
        for (const ref of references) {
            if (ref.dataUrl) {
                contentParts.push({
                    type: 'image_url',
                    image_url: { url: ref.dataUrl },
                });
            }
        }
        contentParts.push({ type: 'text', text: prompt });

        const response = await fetch(`${url}/chat/completions`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${key}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model,
                messages: [{ role: 'user', content: contentParts }],
            }),
        });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error?.message || json.message || 'O Proxy recusou a solicitação com modelo Gemini.');

        let imageUrl = json.choices?.[0]?.message?.images?.[0]?.image_url?.url
            || json.choices?.[0]?.message?.images?.[0]?.url;

        if (!imageUrl && typeof json.choices?.[0]?.message?.content === 'string') {
            const content = json.choices[0].message.content;
            const match = content.match(/data:image\/[a-zA-Z0-9+.-]+;base64,[A-Za-z0-9+/=]+/);
            if (match) imageUrl = match[0];
        }

        if (!imageUrl) throw new Error('A resposta do Gemini no Proxy não trouxe os dados da imagem gerada.');
        if (/^https?:\/\//i.test(imageUrl)) {
            return { dataUrl: await novitaImageFromUrl(imageUrl) };
        }
        return { dataUrl: imageUrl };
    } else {
        // Modelos GPT (gpt-image-2.5): Suporta envio direto da imagem como multipart/form-data via /images/edits!
        const [width, height] = aspectSize(s.aspectRatio);
        const rawSize = `${width}x${height}`;
        const allowedSizes = new Set(['1024x1024', '1792x1024', '1024x1792', '1024x768', '768x1024']);
        const size = allowedSizes.has(rawSize) ? rawSize : '1024x1024';

        const validImageRefs = references.filter(r => r.dataUrl);

        if (validImageRefs.length > 0) {
            // Envia DIRETAMENTE a imagem do avatar como arquivo binário no multipart/form-data (/images/edits)
            const formData = new FormData();
            formData.append('model', model);
            formData.append('prompt', prompt);
            formData.append('size', size);

            for (let i = 0; i < validImageRefs.length; i++) {
                const ref = validImageRefs[i];
                const blob = dataUrlToBlob(ref.dataUrl);
                const fieldName = 'image';
                const fileName = `${ref.role || 'ref'}_${i}.png`;
                formData.append(fieldName, blob, fileName);
            }

            const response = await fetch(`${url}/images/edits`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${key}`,
                },
                body: formData,
            });

            const json = await response.json();
            if (response.ok && json.data?.[0]) {
                const item = json.data[0];
                if (item.b64_json) return { dataUrl: `data:image/png;base64,${item.b64_json}` };
                if (item.url) return { dataUrl: await novitaImageFromUrl(item.url) };
            } else {
                console.warn(`[${MODULE_NAME}] /images/edits com form-data falhou:`, json);
                throw new Error(json.error?.message || json.message || 'O modelo GPT recusou a imagem enviada.');
            }
        } else {
            // Sem imagem de referência disponível: gera direto via text-to-image
            const response = await fetch(`${url}/images/generations`, {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${key}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model,
                    prompt,
                    size,
                }),
            });
            const json = await response.json();
            if (!response.ok) throw new Error(json.error?.message || json.message || 'O Proxy recusou a solicitação de imagem GPT.');

            const item = json.data?.[0];
            if (!item) throw new Error('O Proxy não retornou dados de imagem do modelo GPT.');
            if (item.b64_json) return { dataUrl: `data:image/png;base64,${item.b64_json}` };
            if (item.url) return { dataUrl: await novitaImageFromUrl(item.url) };
            throw new Error('Nenhuma imagem legível na resposta do GPT.');
        }
    }
}

async function generateOpenRouter(key, prompt, references) {
    const s = settings();
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
    return ({ '16:9': [1792, 1024], '9:16': [1024, 1792], '4:3': [1024, 768], '3:4': [768, 1024], '1:1': [1024, 1024] })[aspectRatio] || [1024, 1024];
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
    if (!imageResponse.ok) throw new Error('Não foi possível baixar a imagem gerada.');
    const blob = await imageResponse.blob();
    return new Promise(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
    });
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
    const fluxSize = `${width}*${height}`;
    const seedreamSize = `${width}x${height}`;
    const publicImages = images.filter(image => /^https?:\/\//i.test(image));
    const native = {
        'novita/z-image-turbo-lora': { endpoint: 'z-image-turbo-lora', body: { prompt, size: fluxSize, seed: -1 } },
        'novita/z-image-turbo': { endpoint: 'z-image-turbo', body: { prompt, size: fluxSize, seed: -1 } },
        'novita/flux-2-pro': { endpoint: 'flux-2-pro', body: { prompt, size: fluxSize, seed: -1, ...(publicImages.length ? { images: publicImages.slice(0, 3) } : {}) } },
        'novita/flux-2-flex': { endpoint: 'flux-2-flex', body: { prompt, size: fluxSize, seed: -1, ...(publicImages.length ? { images: publicImages.slice(0, 3) } : {}) } },
        'novita/flux-2-dev': { endpoint: 'flux-2-dev', body: { prompt, size: fluxSize, seed: -1, ...(publicImages.length ? { images: publicImages.slice(0, 3) } : {}) } },
        'novita/qwen-image-t2i': { endpoint: 'qwen-image-txt2img', body: { prompt, size: fluxSize } },
        'novita/qwen-image-edit': { endpoint: 'qwen-image-edit', body: { prompt, size: fluxSize, images } },
        'novita/flux-1-kontext-dev': { endpoint: 'flux-1-kontext-dev', body: { prompt, size: fluxSize, images, seed: -1, num_images: 1, num_inference_steps: 28, guidance_scale: 3.5, output_format: 'jpeg' } },
        'novita/flux-1-kontext-pro': { endpoint: 'flux-1-kontext-pro', body: { prompt, images, seed: -1, guidance_scale: 3.5, aspect_ratio: aspectRatio } },
        'novita/flux-1-kontext-max': { endpoint: 'flux-1-kontext-max', body: { prompt, images, seed: -1, guidance_scale: 3.5, aspect_ratio: aspectRatio } },
    }[model];
    if (model === 'novita/seedream-4.0') {
        const response = await fetch('https://api.novita.ai/v3/seedream-4.0', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, size: seedreamSize, images, watermark: false, sequential_image_generation: 'disabled' }) });
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
    const hasRoleplayChat = context.groupId != null || context.characterId != null || Boolean(context.characters?.[context.characterId]?.avatar);
    if (!hasRoleplayChat) {
        $('#rvl_chat_actions').remove();
        return;
    }

    // Se já existe e está no lugar certo, não recria
    if ($('#rvl_chat_actions').length) return;

    const toolbar = $('<div>', { id: 'rvl_chat_actions', class: 'rvl-chat-actions', title: 'Gerar imagem do roleplay' });
    toolbar.append($('<button>', { class: 'menu_button', type: 'button', 'data-rvl-mode': 'scene', title: 'Criar Cena', html: '<i class="fa-solid fa-image"></i><span> Cena</span>' }));
    toolbar.append($('<button>', { class: 'menu_button', type: 'button', 'data-rvl-mode': 'pov', title: 'Criar POV do Jogador', html: '<i class="fa-solid fa-eye"></i><span> POV</span>' }));
    toolbar.append($('<button>', { class: 'menu_button', type: 'button', 'data-rvl-mode': 'look', title: 'Visual e Roupas', html: '<i class="fa-solid fa-shirt"></i><span> Visual</span>' }));

    // 1. Tenta anexar ao lado ou dentro da barra de Quick Reply (#qr--bar ou .qr--buttons)
    const qrBar = $('#qr--bar .qr--buttons').first().length ? $('#qr--bar .qr--buttons').first() : $('#qr--bar').first();
    if (qrBar.length) {
        qrBar.append(toolbar);
    } else if ($('#send_form').length) {
        // 2. Fallback: logo no topo de #send_form integrado à barra de entrada
        $('#send_form').prepend(toolbar);
    } else {
        const fallbackTarget = $('#form_sheld, #send_but').first();
        if (fallbackTarget.length) fallbackTarget.before(toolbar);
    }

    toolbar.on('click', '[data-rvl-mode]', function (event) {
        event.preventDefault();
        event.stopPropagation();
        run($(this).data('rvl-mode'));
    });
}

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

async function connectChatToProxy() {
    const s = settings();
    const url = (s.proxyUrl || DEFAULT_PROXY_URL_EXTERNAL).replace(/\/+$/, '');
    const key = $('#rvl_api_key').val().trim() || apiKeyFor('proxy');
    const model = $('#rvl_chat_model').val() || s.proxyChatModel || 'gemini-3.8-flash-high';
    s.proxyChatModel = model;

    const statusEl = $('#rvl_chat_status');
    statusEl.removeClass('rvl-error rvl-success').text('Testando e configurando o SillyTavern…');

    try {
        const testRes = await fetch(`${url}/models`, {
            headers: { Authorization: `Bearer ${key}` },
        });
        if (!testRes.ok) {
            throw new Error('Não foi possível conectar ao Proxy. Verifique a URL ou a chave.');
        }

        const context = SillyTavern.getContext();

        // 1. Alternar API para openai e fonte para custom via slash commands / eventos nativos
        if (typeof context.executeSlashCommandsWithOptions === 'function') {
            try {
                await context.executeSlashCommandsWithOptions('/api openai quiet=true');
            } catch {}
        }

        // 2. Definir API principal
        $('#main_api option[value="openai"]').prop('selected', true);
        $('#main_api').val('openai').trigger('change');

        // 3. Definir fonte de Chat Completion para Custom (OpenAI-compatible)
        $('#chat_completion_source option[value="custom"]').prop('selected', true);
        $('#chat_completion_source').val('custom').trigger('change');

        // 4. Preencher Endpoint URL
        $('#custom_api_url_text, #custom_url, #openai_reverse_proxy').each(function () {
            $(this).val(url).trigger('input').trigger('change');
        });

        // 5. Preencher API Key e salvar segredo no SillyTavern
        $('#api_key_custom, #api_key_openai').each(function () {
            $(this).val(key).trigger('input').trigger('change');
        });

        if (typeof context.executeSlashCommandsWithOptions === 'function') {
            try {
                await context.executeSlashCommandsWithOptions(`/secret-write key=api_key_custom label="Nosso Proxy" quiet=true ${key}`);
            } catch {}
        }

        // 6. Configurar objeto interno chatCompletionSettings (oai_settings)
        if (context.chatCompletionSettings) {
            context.chatCompletionSettings.chat_completion_source = 'custom';
            context.chatCompletionSettings.custom_url = url;
            context.chatCompletionSettings.custom_model = model;
        }

        // 7. Configurar campo e seletor de modelo
        $('#custom_model_id').val(model).trigger('input').trigger('change');

        for (const selectId of ['#model_custom_select', '#model_openai_select']) {
            const selectEl = $(selectId);
            if (selectEl.length) {
                if (!selectEl.find(`option[value="${model}"]`).length) {
                    selectEl.append($('<option>', { value: model, text: model }));
                }
                selectEl.val(model).trigger('change');
            }
        }

        // 8. Tentar acionar o botão Conectar do SillyTavern
        const connectBtn = $('#api_button_openai, #api_button_custom, #api_button').first();
        if (connectBtn.length) {
            connectBtn.trigger('click');
        }

        // 9. Persistir configurações
        context.saveSettingsDebounced?.();

        statusEl.addClass('rvl-success').html(`✔ <b>Conectado com sucesso!</b> O SillyTavern foi configurado para o modelo <code>${model}</code> via nosso Proxy.`);
    } catch (err) {
        console.error(`[${MODULE_NAME}] Falha ao conectar chat ao proxy:`, err);
        statusEl.addClass('rvl-error').text(`Erro: ${err.message || 'Falha ao conectar.'}`);
    }
}

async function run(mode) {
    const s = settings();
    const provider = $('#rvl_provider').length ? ($('#rvl_provider').val() || s.provider || 'proxy') : (s.provider || 'proxy');
    const inputKey = $('#rvl_api_key').length ? $('#rvl_api_key').val().trim() : '';
    const key = inputKey || apiKeyFor(provider);

    if (!key) return notice('Cole a chave da API para este provedor.', true);
    if ($('#rvl_remember_key').length) {
        saveApiKey(provider, key, $('#rvl_remember_key').prop('checked'));
    }

    try {
        notice('Preparando contexto e referências do personagem…');
        const references = await characterReferences();
        const charRefFound = references.some(r => r.role === 'character');
        console.info(`[${MODULE_NAME}] References carregadas:`, references.length, '| Personagem encontrado:', charRefFound);
        
        // Atualiza painel de depuração para mostrar ao usuário as fotos exatas enviadas
        if ($('#rvl_debug_thumbs').length) {
            const thumbsContainer = $('#rvl_debug_thumbs').empty();
            if (references.length) {
                $('#rvl_debug_preview').show();
                references.forEach((ref, idx) => {
                    if (ref.dataUrl) {
                        const card = $('<div>', { class: 'rvl-thumb-card' });
                        card.append($('<img>', { src: ref.dataUrl, alt: ref.name }));
                        card.append($('<div>', { text: `${ref.name} (${ref.role})` }));
                        thumbsContainer.append(card);
                    }
                });
            } else {
                $('#rvl_debug_preview').hide();
            }
        }

        notice('Gerando imagem… isto pode levar alguns segundos.');
        const prompt = buildPrompt(mode, references);

        let result;
        if (provider === 'proxy') {
            result = await generateProxy(key, prompt, references);
        } else if (provider === 'google') {
            result = await generateGoogle(key, prompt, references);
        } else if (provider === 'novita') {
            result = await generateNovita(key, prompt, references);
        } else {
            result = await generateOpenRouter(key, prompt, references);
        }

        showImage(result);
        notice('Enviando imagem para o chat…');
        const published = await publishToChat(result, mode);
        attachFeedbackControls(published.messageId, published.mode);
        const refStatus = charRefFound ? 'com referência original em alta resolução' : '(sem referência)';
        notice(result.cost != null ? `Imagem criada ${refStatus}. Custo: US$ ${Number(result.cost).toFixed(4)}.` : `Imagem criada ${refStatus}.`);
    } catch (error) {
        console.error(`[${MODULE_NAME}]`, error);
        notice(error.message || 'Falha ao gerar a imagem.', true);
    }
}

function syncUi() {
    const s = settings();
    const provider = $('#rvl_provider').val() || s.provider || 'proxy';
    const modelKey = modelSettingKey(provider);
    const selected = s[modelKey];
    const choices = choicesFor(provider);
    const modelSelect = $('#rvl_model').empty();

    for (const [value, label] of choices) {
        modelSelect.append($('<option>', { value, text: label }));
    }
    if (selected && !choices.some(([value]) => value === selected)) {
        modelSelect.append($('<option>', { value: selected, text: `${selected} — personalizado` }));
    }
    modelSelect.val(selected);

    $('#rvl_proxy_url_wrapper').toggle(provider === 'proxy');
    $('#rvl_proxy_url').val(s.proxyUrl || DEFAULT_PROXY_URL_EXTERNAL);
    $('#rvl_catalog_tools').toggle(provider === 'openrouter' || provider === 'proxy');
    $('#rvl_refresh_models').html(provider === 'proxy'
        ? '<i class="fa-solid fa-rotate"></i> Atualizar modelos do Proxy'
        : '<i class="fa-solid fa-rotate"></i> Atualizar todos os modelos');

    $('#rvl_aspect').val(s.aspectRatio);
    $('#rvl_quality').val(s.quality);
    $('#rvl_messages').val(s.messages);
    $('#rvl_player_reference').prop('checked', Boolean(s.includePlayerReference));
    $('#rvl_remember_key').prop('checked', Boolean(persistentKeys()[provider]));
    $('#rvl_chat_model').val(s.proxyChatModel || 'gemini-3.8-flash-high');
}

async function init() {
    const context = SillyTavern.getContext();
    settings();
    const html = await context.renderExtensionTemplateAsync('third-party/roleplay-visual-director', 'settings');
    $('#extensions_settings2').append(html);
    syncUi();

    $('#rvl_provider').on('change', function () {
        const s = settings();
        s.provider = this.value;
        syncUi();
        context.saveSettingsDebounced();
    });

    $('#rvl_toggle_proxy_url').on('click', function () {
        const s = settings();
        const current = $('#rvl_proxy_url').val().trim();
        const nextUrl = current === DEFAULT_PROXY_URL_INTERNAL ? DEFAULT_PROXY_URL_EXTERNAL : DEFAULT_PROXY_URL_INTERNAL;
        $('#rvl_proxy_url').val(nextUrl);
        s.proxyUrl = nextUrl;
        context.saveSettingsDebounced();
        notice(`URL do Proxy alterada para: ${nextUrl}`);
    });

    $('#rvl_proxy_url').on('input change', function () {
        const s = settings();
        s.proxyUrl = this.value.trim() || DEFAULT_PROXY_URL_EXTERNAL;
        context.saveSettingsDebounced();
    });

    $('#rvl_refresh_models').on('click', function () {
        const provider = $('#rvl_provider').val();
        if (provider === 'proxy') refreshProxyCatalog();
        else if (provider === 'openrouter') refreshOpenRouterCatalog();
    });

    $('#rvl_connect_chat_btn').on('click', connectChatToProxy);

    $('#rvl_remember_key').on('change', function () {
        if (!this.checked) forgetPersistentKey($('#rvl_provider').val());
    });

    $('#rvl_model, #rvl_aspect, #rvl_quality, #rvl_messages, #rvl_player_reference, #rvl_chat_model').on('change', function () {
        const s = settings();
        const provider = $('#rvl_provider').val();
        if (this.id === 'rvl_model') s[modelSettingKey(provider)] = this.value.trim();
        else if (this.id === 'rvl_aspect') s.aspectRatio = this.value;
        else if (this.id === 'rvl_quality') s.quality = this.value;
        else if (this.id === 'rvl_player_reference') s.includePlayerReference = this.checked;
        else if (this.id === 'rvl_chat_model') s.proxyChatModel = this.value;
        else if (this.id === 'rvl_messages') s.messages = Math.max(1, Math.min(30, Number(this.value) || defaults.messages));
        context.saveSettingsDebounced();
    });

    $('#rvl_scene').on('click', () => run('scene'));
    $('#rvl_pov').on('click', () => run('pov'));
    $('#rvl_look').on('click', () => run('look'));

    if ($('#rvl_provider').val() === 'proxy' || defaults.provider === 'proxy') {
        refreshProxyCatalog().catch(() => {});
    } else if (apiKeyFor('openrouter')) {
        refreshOpenRouterCatalog().catch(() => {});
    }

    renderChatActions();
    restoreFeedbackControls();

    context.eventSource.on(context.event_types.CHAT_CHANGED, () => setTimeout(() => {
        renderChatActions();
        restoreFeedbackControls();
    }, 250));
}

SillyTavern.getContext().eventSource.on(SillyTavern.getContext().event_types.APP_READY, init);
