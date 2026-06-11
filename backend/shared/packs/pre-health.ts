// Pre-health / pre-med (and biology-for-health) pack. The MCAT is a med-school exam taken years later,
// not a college-entrance exam, so `entranceExam` is omitted; clinical experience + prerequisites lead.

import type { MajorPack } from './types.js';

export const preHealthPack: MajorPack = {
  key: 'pre-health',
  label: 'Pre-med / Pre-health',
  aliases: ['pre-med', 'premed', 'pre-health', 'prehealth', 'biology', 'biochemistry', 'biological sciences', 'physiology'],
  focusBrief:
    'This student is on a pre-health / pre-med path. Emphasize the prerequisite sciences (biology, ' +
    'chemistry, organic chemistry, physics), a strong GPA, hands-on clinical and patient-care experience, ' +
    'physician shadowing, undergraduate research, and foundational certs like BLS and CNA. The MCAT comes ' +
    'later (for med school), so for college, focus on rigor, clinical hours, and research.',
  certifications: [
    { name: 'Basic Life Support (BLS)', issuingOrganization: 'American Heart Association', why: 'Baseline for clinical/volunteer settings and a prerequisite for many shadowing programs.', priority: 1 },
    { name: 'Certified Nursing Assistant (CNA)', issuingOrganization: 'State Board of Nursing', why: 'Paid, hands-on patient-care hours — strong evidence of clinical commitment.', priority: 2 },
    { name: 'EMT-Basic', issuingOrganization: 'State EMS / NREMT', why: 'High-responsibility clinical experience that stands out on a pre-health application.', priority: 3 },
  ],
  interviewQuestions: [
    'Why medicine / healthcare?',
    'Describe a meaningful patient or clinical experience and what it taught you.',
    'How do you handle stress, setbacks, or failure?',
    'What does empathy mean to you in a healthcare setting?',
  ],
  visitQuestions: [
    'What pre-health advising and committee-letter support do undergraduates get?',
    'What is the medical-school acceptance rate for your pre-med students?',
    'What undergraduate research opportunities are available, and how early?',
    'What clinical / volunteer affiliations (hospitals, clinics) does the school have?',
  ],
  programDetailsHint:
    'Capture pre-health specifics: pre-med advising and committee-letter support, medical-school placement / ' +
    'acceptance rate, undergraduate research access, and clinical/volunteer hospital affiliations.',
};
