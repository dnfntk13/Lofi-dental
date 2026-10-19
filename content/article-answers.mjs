// Answer-first editorial additions. Clinical reviewer fields must only be added after actual review.
import { articles as treatmentArticles } from './articles.mjs';
import { visitArticles } from './visit-articles.mjs';
const additions = [
  {
    en: {
      directAnswer: 'A smile makeover is an individual plan for the appearance of your smile, rather than a single procedure. The plan may consider tooth colour, shape, alignment and existing restorations alongside oral health and comfort. Your examination and priorities determine which options are appropriate; there is no standard number of veneers or visits.',
      table: { title: 'Match the question to the decision', headers: ['Your concern', 'What to clarify'], rows: [['Tooth colour', 'Whether the concern involves natural teeth, restorations or both.'], ['Shape or proportions', 'Which teeth you want to change, and which features you want to keep.'], ['Chewing or damaged teeth', 'The examination findings and any functional treatment priorities.'], ['A short stay in Seoul', 'Which stages can be planned on this trip and which require follow-up.']] },
      faqs: [['Do I need veneers on every front tooth?', 'Not automatically. The proposed number and type of restorations should follow an examination and discussion of your priorities.'], ['What should I bring to the consultation?', 'Bring available dental records, your medication list, a description of your concerns and your travel dates if relevant.'], ['Can I discuss the plan in English at lofi?', 'Yes. English consultation is available. Request an appointment and explain the questions you would like to discuss.']]
    },
    ko: {
      directAnswer: '스마일 메이크오버는 한 가지 시술명이 아니라 미소의 외관을 위한 개별 치료 계획입니다. 치아 색·형태·배열과 기존 보철물을 구강 건강 및 편안함과 함께 고려합니다. 검사와 본인의 목표에 따라 방법을 정하므로 라미네이트 개수나 방문 횟수가 정해져 있는 것은 아닙니다.',
      table: { title: '고민별로 확인할 내용', headers: ['고민', '상담에서 확인할 점'], rows: [['치아 색', '자연치, 기존 보철물 중 어떤 부위가 고민인지'], ['치아 모양과 비율', '바꾸고 싶은 치아와 유지하고 싶은 특징'], ['씹기 불편하거나 손상된 치아', '검사 결과와 기능상 치료 우선순위'], ['짧은 서울 체류', '이번 방문에 가능한 단계와 이후 경과 확인']] },
      faqs: [['보이는 앞니를 모두 라미네이트로 해야 하나요?', '반드시 그렇지는 않습니다. 보철물의 개수와 종류는 검사와 원하는 변화를 상담한 뒤 제안해야 합니다.'], ['상담 전에 무엇을 준비하나요?', '가능한 이전 치과 자료, 복용 약 목록과 고민을 정리하세요. 여행 중 방문한다면 체류 일정도 알려주세요.'], ['로우파이 치과에서 영어로 상담할 수 있나요?', '영어 상담이 가능합니다. 예약 요청 시 상담하고 싶은 내용을 함께 알려주세요.']]
    }
  },
  {
    en: {
      directAnswer: 'Teeth whitening changes the colour of natural teeth; veneers cover the front surfaces and can change selected aspects of shape and appearance. Veneers may require irreversible enamel removal and ongoing restorative care. The useful choice depends on what concerns you and the examination findings, not simply how white you want your teeth to look.',
      table: { title: 'Whitening and veneers at a glance', headers: ['Decision', 'Teeth whitening', 'Veneers'], rows: [['Main purpose', 'Change natural tooth shade', 'Cover the front surface to modify appearance'], ['Tooth shape', 'Does not reshape a tooth', 'Can change selected aspects of visible shape'], ['Existing crowns or fillings', 'Do not bleach like natural teeth', 'Need assessment as part of the plan'], ['Commitment', 'Discuss sensitivity and maintenance', 'Discuss preparation, repair and replacement']] },
      faqs: [['Can whitening close a gap?', 'Whitening changes colour, not tooth position or the size of a gap. Discuss shape or spacing concerns separately.'], ['Are veneers reversible?', 'Enamel removed during preparation does not grow back. Ask what preparation would be needed for each tooth.'], ['Which option is right for me?', 'A dentist needs to assess your teeth and goals. Neither option is automatically appropriate for every colour or shape concern.']]
    },
    ko: {
      directAnswer: '치아미백은 자연치의 색을 바꾸고, 라미네이트는 치아 앞면을 덮어 형태와 외관의 일부를 조정합니다. 라미네이트에는 되돌릴 수 없는 법랑질 삭제와 이후 보철물 관리가 필요할 수 있습니다. 원하는 밝기뿐 아니라 실제 고민과 검사 결과를 함께 보고 방법을 선택해야 합니다.',
      table: { title: '미백과 라미네이트 비교', headers: ['비교 항목', '치아미백', '라미네이트'], rows: [['주요 목적', '자연치 색 변화', '치아 앞면을 덮어 외관 조정'], ['치아 형태', '치아 모양을 바꾸지 않음', '보이는 형태 일부를 조정할 수 있음'], ['기존 크라운·충전물', '자연치처럼 미백되지 않음', '전체 계획에서 별도 평가 필요'], ['고려할 점', '시린 증상과 유지 관리', '치아 준비, 수리와 교체']] },
      faqs: [['미백으로 치아 사이 틈을 닫을 수 있나요?', '미백은 색을 바꾸며 치아의 위치나 틈의 크기를 바꾸지 않습니다. 공간과 형태에 대한 고민은 따로 상담하세요.'], ['라미네이트는 되돌릴 수 있나요?', '준비 과정에서 제거한 법랑질은 다시 자라지 않습니다. 치아별로 필요한 준비를 확인해야 합니다.'], ['저에게 어떤 방법이 적합한가요?', '검사와 목표 확인이 필요합니다. 모든 색·형태 고민에 어느 한 방법이 적합한 것은 아닙니다.']]
    }
  },
  {
    en: {
      directAnswer: 'Dental implant treatment cannot be assumed to finish during one trip to Seoul. Assessment, implant placement, healing and the final restoration may require separate visits. Some cases involve months of healing. Ask for a staged plan before committing your travel dates to treatment, including who will provide follow-up after you return home.',
      table: { title: 'Understand each visit', headers: ['Stage', 'Purpose', 'What to confirm'], rows: [['Assessment', 'Examine the area and discuss options', 'Records, further tests and suitability'], ['Placement', 'Place the implant if appropriate', 'Preparation and individual aftercare instructions'], ['Healing and review', 'Assess progress before the next step', 'Review dates and temporary arrangements'], ['Final restoration', 'Fit the replacement tooth or teeth', 'Fit checks and continuing maintenance']] },
      faqs: [['Is the implant the same as the crown?', 'No. The implant supports the replacement tooth; the crown or other restoration is a separate component.'], ['Can a travel date guarantee same-day treatment?', 'No. Suitability and timing depend on clinical assessment, not the length of a trip.'], ['What if my implant was placed elsewhere?', 'Bring available treatment records and implant identification. The dentist will assess what information and examination are needed.']]
    },
    ko: {
      directAnswer: '한 번의 서울 방문으로 임플란트 치료가 끝난다고 가정할 수는 없습니다. 검사, 식립, 치유와 최종 보철이 여러 방문으로 나뉠 수 있고 치유에 수개월이 필요한 경우도 있습니다. 여행을 확정하기 전에 단계별 계획과 귀국 후 경과 확인을 누가 담당할지 상담하세요.',
      table: { title: '방문 단계별 목적', headers: ['단계', '목적', '확인할 내용'], rows: [['검사', '해당 부위 평가와 선택지 상담', '기존 자료, 추가 검사와 적합성'], ['식립', '적합한 경우 임플란트 식립', '준비 사항과 개인별 주의사항'], ['치유·경과 확인', '다음 단계 전 상태 평가', '확인 일정과 임시 보철 계획'], ['최종 보철', '인공 치아 장착', '적합성 확인과 유지 관리']] },
      faqs: [['임플란트와 크라운은 같은 것인가요?', '아닙니다. 임플란트는 인공 치아를 지지하며, 크라운 등 보철물은 별도 구성 요소입니다.'], ['체류 기간이 짧으면 당일 치료가 가능한가요?', '여행 기간이 당일 치료의 적합성을 결정하지 않습니다. 실제 상태를 평가해야 합니다.'], ['다른 병원에서 식립한 임플란트도 상담할 수 있나요?', '관련 치료 기록과 제품 정보를 준비하세요. 어떤 정보와 검사가 필요한지 의료진이 확인합니다.']]
    }
  },
  {
    en: {
      directAnswer: 'Full mouth restoration coordinates treatment across several teeth to address assessed dental needs. It does not automatically mean replacing every tooth or using implants throughout. A useful plan explains which teeth can be kept, the purpose of each proposed procedure, treatment priorities and long-term maintenance.',
      table: { title: 'What a clear plan should explain', headers: ['Part of the plan', 'Information to request'], rows: [['Findings', 'The condition of each relevant tooth and existing restoration'], ['Alternatives', 'Options for retaining, restoring or replacing teeth where appropriate'], ['Sequence', 'Which concerns take priority and what is checked between stages'], ['Maintenance', 'Cleaning guidance, review appointments and records for future care']] },
      faqs: [['Does every tooth need a crown?', 'No fixed treatment applies to every tooth. Ask for the reason and alternatives for each proposed restoration.'], ['Can treatment be planned in stages?', 'Discuss whether a staged approach is appropriate and what must be completed or reassessed before the next step.'], ['What should an overseas patient clarify?', 'Ask about visits, temporary arrangements, return trips and how ongoing care will be coordinated after leaving Korea.']]
    },
    ko: {
      directAnswer: '전악 수복은 검사로 확인된 필요에 따라 여러 치아의 치료를 함께 계획하는 것입니다. 모든 치아를 교체하거나 전부 임플란트로 치료한다는 뜻은 아닙니다. 유지할 수 있는 치아, 제안된 치료의 목적, 우선순위와 장기 관리를 설명받는 것이 중요합니다.',
      table: { title: '치료 계획에서 확인할 항목', headers: ['항목', '확인할 정보'], rows: [['검사 결과', '해당 치아와 기존 보철물의 상태'], ['대안', '상태에 맞는 치아 유지·수복·대체 방법'], ['진행 순서', '우선 해결할 문제와 단계 사이 확인 사항'], ['유지 관리', '청소 방법, 경과 확인과 이후 진료용 기록']] },
      faqs: [['모든 치아에 크라운이 필요한가요?', '치아마다 필요한 치료는 다릅니다. 각 보철물을 제안하는 이유와 대안을 확인하세요.'], ['치료를 여러 단계로 나눌 수 있나요?', '단계별 접근이 적절한지, 다음 단계 전 어떤 치료나 재평가가 필요한지 상담하세요.'], ['해외 거주자는 무엇을 확인해야 하나요?', '방문 횟수, 임시 보철, 재방문과 귀국 후 관리 계획을 확인하세요.']]
    }
  },
  {
    en: {
      directAnswer: 'Whitening does not change the colour of crowns, veneers or tooth-coloured fillings as it does natural teeth. If those restorations are visible, discuss the overall shade match before treatment. Existing sensitivity and plans for new restorations also matter; a whiter natural tooth does not automatically create a matching smile.',
      table: { title: 'Check before whitening', headers: ['Situation', 'Why to discuss it'], rows: [['A visible crown or veneer', 'The surrounding natural teeth may change shade while the restoration does not'], ['Tooth-coloured fillings', 'Their appearance needs to be considered in the overall match'], ['Sensitive teeth', 'The dentist needs to assess the starting symptoms and suitable approach'], ['Planned restorative work', 'Shade decisions and the treatment sequence should be coordinated']] },
      faqs: [['Should I replace a crown just because I want whitening?', 'Not automatically. Ask the dentist to distinguish its condition from its appearance and discuss the available options.'], ['Can whitening cause sensitivity?', 'Sensitivity and gum irritation can occur. Discuss existing symptoms and what to do if discomfort develops.'], ['Can a fixed shade improvement be guaranteed?', 'No. The response is individual and the starting condition needs assessment.']]
    },
    ko: {
      directAnswer: '크라운, 라미네이트와 치아색 충전물은 자연치와 같은 방식으로 미백되지 않습니다. 웃을 때 보이는 위치에 있다면 치료 전 전체 색 조화를 상담하세요. 기존 시린 증상과 새 보철 계획도 고려해야 하며 자연치가 밝아진다고 색이 자동으로 맞춰지는 것은 아닙니다.',
      table: { title: '미백 전에 확인할 상황', headers: ['상황', '상담이 필요한 이유'], rows: [['보이는 크라운·라미네이트', '주변 자연치만 밝아지면 색 차이가 생길 수 있음'], ['치아색 충전물', '전체적인 색 조화를 따로 고려해야 함'], ['시린 치아', '기존 증상과 적합한 접근에 대한 평가가 필요함'], ['예정된 보철치료', '색상 결정과 치료 순서를 함께 조율해야 함']] },
      faqs: [['미백을 원하면 크라운도 교체해야 하나요?', '반드시 그렇지는 않습니다. 크라운의 상태와 외관을 구분해 평가하고 선택지를 상담하세요.'], ['미백하면 시릴 수 있나요?', '시린 증상과 잇몸 자극이 생길 수 있습니다. 기존 증상과 불편함 발생 시 대처를 미리 상담하세요.'], ['일정한 밝기 변화를 보장할 수 있나요?', '반응은 개인별로 다르며 시작 상태를 평가해야 하므로 보장할 수 없습니다.']]
    }
  }
];
export const articles = [...treatmentArticles.map((a, i) => ({ ...a, en: { ...a.en, ...additions[i].en }, ko: { ...a.ko, ...additions[i].ko } })), ...visitArticles];
