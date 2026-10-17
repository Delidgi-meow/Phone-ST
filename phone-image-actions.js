import { getSettings } from './state.js';
import { savedImagePrompt } from './image-prompt-cache.js';
import { openPhoneSheet, closePhoneSheet } from './phone-modal.js';
import { bankIcon } from './bank-icons.js';
import { lang } from './i18n.js';
const L = (ru, en) => lang() === 'en' ? en : ru;

export function chooseImageRepeat(post, cancelKey, host, view) {
    const preparedPrompt = savedImagePrompt(post, cancelKey);
    if (!getSettings().imageGenBlockKey || !preparedPrompt || !host) return Promise.resolve({});
    return new Promise((resolve, reject) => {
        let settled = false;
        const shade = openPhoneSheet(host, L('Перегенерация', 'Regenerate'),
            '<div class="gp-image-repeat-actions">' +
            '<button type="button" data-image-repeat="image">' + bankIcon('RotateCw') + '<span><b>' + L('Только картинка', 'Image only') + '</b><small>' + L('Повторить с текущим промптом', 'Repeat using the current prompt') + '</small></span></button>' +
            '<button type="button" data-image-repeat="block">' + bankIcon('Sparkles') + '<span><b>' + L('Блок + картинка', 'Block + image') + '</b><small>' + L('Новый промпт из внешнего блока и новое фото', 'New block prompt and a new image') + '</small></span></button></div>', view);
        shade.cleanup = () => {
            if (settled) return;
            settled = true;
            const error = new Error(L('Генерация отменена', 'Generation cancelled'));
            error.name = 'ImageGenCancelled';
            reject(error);
        };
        shade.querySelectorAll('[data-image-repeat]').forEach(button => button.onclick = () => {
            if (settled) return;
            settled = true;
            const regeneratePrompt = button.dataset.imageRepeat === 'block';
            closePhoneSheet(shade);
            resolve({ regeneratePrompt, ...(!regeneratePrompt ? { preparedPrompt } : {}) });
        });
    });
}
