// Keep staff workloads independent from the public chat model.
export function getAdminAiModel(env = process.env) {
  return String(env.ADMIN_AI_MODEL || '').trim() || 'gpt-5.4-mini';
}

export function adminAiRequestOptions(model) {
  return {
    model,
    store: false,
    max_completion_tokens: 8000,
    ...(/^gpt-5(?:[.-]|$)/.test(model) ? { reasoning_effort: 'low' } : {}),
  };
}

export function parseAdminAiJson(data) {
  const choice = data?.choices?.[0];
  if (choice?.finish_reason !== 'stop' || choice?.message?.refusal) {
    throw Object.assign(new Error('AI 응답이 완료되지 않았습니다. 요청 범위를 줄여 다시 시도해주세요.'), { statusCode: 502 });
  }
  try {
    const value = JSON.parse(choice.message.content);
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw Object.assign(new Error('AI 응답 형식이 올바르지 않습니다. 다시 시도해주세요.'), { statusCode: 502 });
  }
}
