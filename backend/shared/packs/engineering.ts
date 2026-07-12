// Engineering pack (mechanical / electrical / civil / chemical / aerospace / biomedical / etc.). The FE/PE
// are professional exams taken after graduation, not college-entrance exams, so `entranceExam` is omitted.

import type { MajorPack } from './types.js';

export const engineeringPack: MajorPack = {
  key: 'engineering',
  label: 'Engineering',
  aliases: ['engineering', 'mechanical', 'electrical', 'civil', 'aerospace', 'biomedical', 'chemical engineering', 'mechatronics'],
  focusBrief:
    'This student is pursuing engineering. Emphasize a strong math/physics track (calculus, physics), ' +
    'hands-on building/design projects, robotics or competition teams, and internships/co-ops. Check whether ' +
    'admission is direct-to-major or a competitive first-year-engineering placement, and prefer ABET-accredited programs.',
  certifications: [
    { name: 'Certified SOLIDWORKS Associate (CSWA)', issuingOrganization: 'Dassault Systèmes', why: 'Demonstrates real CAD/design skill — concrete evidence of engineering aptitude.', priority: 2 },
    { name: 'OSHA-10 (General Industry)', issuingOrganization: 'OSHA', why: 'Useful for lab/maker and internship settings; an easy, credible add.', priority: 3 },
  ],
  interviewQuestions: [
    'Why engineering — and which discipline interests you most?',
    'Describe something you designed or built. What went wrong, and how did you fix it?',
    'How do you approach a problem you do not yet know how to solve?',
    'Tell me about a team project and your role in it.',
  ],
  visitQuestions: [
    'Is admission direct to the major, or first-year engineering with a competitive placement later?',
    'Is the program ABET-accredited?',
    'How are co-ops and internships structured, and what is placement like?',
    'What makerspaces, labs, and research are accessible to undergraduates?',
    'What are class sizes for the core engineering courses?',
  ],
  programDetailsHint:
    'Capture engineering-program specifics: ABET accreditation, whether admission is direct-to-major or ' +
    'first-year-engineering with competitive placement, co-op/internship structure and placement, and notable ' +
    'labs / makerspaces.',
};
