export interface TagDefinition {
  tag: string;
  keywords: string[];
}

export const TAGS: TagDefinition[] = [
  { tag: '암', keywords: ['암'] },
  { tag: '심뇌혈관', keywords: ['심뇌혈관', '심혈관', '뇌혈관', '심근경색', '뇌졸중'] },
  { tag: '중증질환', keywords: ['중증질환'] },
  { tag: '비만', keywords: ['비만'] },
  { tag: '당뇨', keywords: ['당뇨'] },
  { tag: '대사질환', keywords: ['대사질환', '대사증후군'] },
  { tag: 'GLP-1', keywords: ['GLP-1', 'GLP1', '위고비', '삭센다', '마운자로', '오젬픽'] },
  { tag: '치매', keywords: ['치매'] },
  { tag: '시니어', keywords: ['시니어', '고령자'] },
  { tag: '간병', keywords: ['간병'] },
  { tag: '요양', keywords: ['요양'] },
  { tag: '재가케어', keywords: ['재가케어', '재가서비스', '재가돌봄'] },
  { tag: 'Hospital at Home', keywords: ['Hospital at Home', '재택입원', '재택의료'] },
  { tag: 'PRO', keywords: ['환자보고결과'] },
  { tag: '재정케어', keywords: ['재정케어'] },
  { tag: '건강관리', keywords: ['건강관리'] },
  { tag: '예방', keywords: ['질병예방', '예방접종', '예방의학'] },
  { tag: '검진', keywords: ['건강검진', '암검진'] },
  { tag: '의료데이터', keywords: ['의료데이터', '의료 데이터'] },
  { tag: '건강데이터', keywords: ['건강데이터', '건강 데이터'] },
  { tag: '의료AI', keywords: ['의료AI', '의료 AI', '헬스케어 AI'] },
  { tag: '언더라이팅', keywords: ['언더라이팅'] },
  { tag: '상품개발', keywords: ['보험상품', '상품개발'] },
  { tag: '보험부가서비스', keywords: ['부가서비스', '헬스케어서비스', '헬스케어 서비스'] },
  { tag: '병원제휴', keywords: ['병원 제휴', '병원제휴', '의료기관 제휴'] },
  { tag: '제약사협업', keywords: ['제약사 협업', '제약사 파트너십'] },
  { tag: 'M&A', keywords: ['M&A', '인수합병', '인수 합병'] },
  { tag: '투자', keywords: ['투자 유치', 'VC 투자', '지분투자'] },
  { tag: '디지털헬스', keywords: ['디지털헬스', '디지털 헬스'] },
];
