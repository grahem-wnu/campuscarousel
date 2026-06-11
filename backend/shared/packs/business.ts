// Business pack (admin / finance / accounting / marketing / management). No college-entrance exam
// (the GMAT/GRE are graduate exams), so `entranceExam` is omitted.

import type { MajorPack } from './types.js';

export const businessPack: MajorPack = {
  key: 'business',
  label: 'Business',
  aliases: ['business', 'finance', 'accounting', 'marketing', 'management', 'entrepreneurship'],
  focusBrief:
    'This student is pursuing business. Emphasize leadership roles, entrepreneurship and business clubs ' +
    '(DECA, FBLA), internships, quantitative skills (Excel, statistics), and case-competition experience. ' +
    'Many top business schools admit directly OR require a competitive internal application after a year — ' +
    'flag which, and weigh recruiting/placement strength.',
  certifications: [
    { name: 'Microsoft Office Specialist: Excel', issuingOrganization: 'Microsoft', why: 'Excel fluency is table stakes for finance/analytics roles and easy to credential in high school.', priority: 2 },
    { name: 'Bloomberg Market Concepts (BMC)', issuingOrganization: 'Bloomberg', why: 'A recognized finance primer that signals genuine interest in markets.', priority: 3 },
  ],
  interviewQuestions: [
    'Why business — and which area (finance, marketing, entrepreneurship) draws you?',
    'Tell me about a time you led a team or organized something.',
    'Describe a business or entrepreneurial idea you have explored.',
    'How do you handle competing priorities and deadlines?',
  ],
  visitQuestions: [
    'Is admission directly into the business school, or a competitive internal application later?',
    'How strong is the internship / recruiting pipeline, and which employers hire here?',
    'What clubs, case competitions, or experiential programs are available?',
    'What study-abroad, co-op, or consulting-project options exist?',
  ],
  programDetailsHint:
    'Capture business-program specifics: direct-admit vs competitive internal admission to the business ' +
    'school, top recruiting employers and placement rate, notable concentrations, and experiential programs ' +
    '(co-op, case competitions, study abroad).',
};
