const pricingTerms = /가격|비용|요금|금액|할인|분납|할부|결제|(?:\b(?:prices?|pricing|costs?|fees?|discounts?|installments?|payments?|financing|charges?|vat)\b)|how\s+much(?!\s+(?:time|long))|얼마|料金|費用|价格|费用/i;
const moneyAmounts = /[₩$€£¥]\s*\d|\b(?:KRW|USD|HKD|SGD|EUR|GBP|AUD|CAD)\b|\d[\d,.]*\s*(?:만\s*원|원|won|dollars?|euros?|pounds?)/i;

export function isPublicPricingQuestion(text) {
  return pricingTerms.test(String(text || '')) || moneyAmounts.test(String(text || ''));
}

export function publicConsultContactReply(text) {
  return /[가-힣]/.test(String(text || ''))
    ? '자세한 안내는 병원 직원에게 직접 문의해주세요. 어떤 진료를 원하시나요?'
    : 'Please contact our clinic team directly for details. Which treatment would you like to discuss?';
}

export function removePublicPricingInformation(reply, latestMessage) {
  const result = { ...reply };
  if (isPublicPricingQuestion(result.answer)) result.answer = publicConsultContactReply(latestMessage);
  result.suggestedQuestions = (result.suggestedQuestions || []).filter(question => !isPublicPricingQuestion(question));
  return result;
}

export function publicConsultThreadWithoutPrices(thread) {
  return (thread || []).map(message => {
    if (!['admin-reply', 'auto-reply'].includes(message.type)) return message;
    const clean = removePublicPricingInformation({ answer: message.content, suggestedQuestions: message.aiAssist?.suggestedQuestions || [] }, message.content);
    return { ...message, content: clean.answer, ...(message.aiAssist ? { aiAssist: { ...message.aiAssist, suggestedQuestions: clean.suggestedQuestions } } : {}) };
  });
}
