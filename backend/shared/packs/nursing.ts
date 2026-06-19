// Nursing (BSN) pack — the first major pack. Everything nursing-specific that the core deliberately
// dropped lives here, re-applied only when a student's intended major resolves to nursing.

import type { MajorPack } from './types.js';

export const nursingPack: MajorPack = {
  key: 'nursing',
  label: 'Nursing (BSN)',
  aliases: ['nursing', 'nurse', 'bsn', 'rn', 'adn', 'absn', 'pre-nursing'],
  focusBrief:
    'This student is pursuing nursing (BSN). Prioritize direct-admit BSN programs over pre-nursing / ' +
    'secondary-application pathways, hands-on patient-care and clinical/volunteer experience, TEAS ' +
    'entrance-exam preparation (a competitive score is roughly 78+), and foundational certifications ' +
    'such as CNA and BLS. When comparing schools, weigh NCLEX-RN first-time pass rates and the strength ' +
    'of clinical placement partners.',
  certifications: [
    {
      name: 'Basic Life Support (BLS)',
      issuingOrganization: 'American Heart Association',
      why: 'Required for nearly every clinical placement and nursing program.',
      priority: 1,
    },
    {
      name: 'Certified Nursing Assistant (CNA)',
      issuingOrganization: 'State Board of Nursing',
      why: 'Hands-on patient-care experience that strengthens a BSN application and pays while you learn.',
      priority: 1,
    },
    {
      name: 'Advanced Cardiovascular Life Support (ACLS)',
      issuingOrganization: 'American Heart Association',
      why: 'Signals an ICU / critical-care focus; valued for advanced clinical placements.',
      priority: 3,
    },
  ],
  entranceExam: {
    examName: 'TEAS',
    competitiveScore: 78,
    note: 'ATI TEAS — the standard nursing-program entrance exam.',
  },
  experienceLabel: 'Clinical hours',
  interviewQuestions: [
    'Why do you want to become a nurse?',
    'Why our nursing program specifically?',
    'Nursing is high-pressure — how do you handle stress and stay organized?',
    'Tell me about a time you cared for or advocated for someone.',
    'Where do you see yourself in five years as a nurse?',
  ],
  visitQuestions: [
    'Which hospitals and clinical sites do nursing students rotate through?',
    'What is the most recent NCLEX-RN first-time pass rate?',
    'Is admission a direct-admit (guaranteed) BSN, or a secondary / competitive nursing application?',
    'What simulation-lab and clinical resources are available to students?',
    'What academic and wellness support exists specifically for nursing students?',
  ],
  programDetailsHint:
    'Capture nursing-program specifics as labeled facts: the NCLEX-RN first-time pass rate, key clinical ' +
    'placement partners (hospitals / sites), and whether admission is a direct-admit BSN or a competitive ' +
    'secondary / transfer application.',
};
