// Check metadata before extracting text: a fluent prefix can still be only
// the first few tags when a reasoning model exhausts its output budget.
export function requireCompleteImagePrompt(response) {
    const reason = response?.choices?.[0]?.finish_reason ?? response?.candidates?.[0]?.finishReason
        ?? response?.stop_reason ?? response?.finish_reason ?? '';
    if (/^(length|max_tokens|max_output_tokens|model_length)$/i.test(String(reason))) {
        const error = new Error('Модель обрезала описание картинки по лимиту токенов. Увеличь лимит ответа для генерации; незавершённый промпт не отправлен на рисование.');
        error.name = 'ImagePromptIncomplete';
        throw error;
    }
}
