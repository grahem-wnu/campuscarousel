// Education / teaching pack. Praxis exams matter for licensure, but they're multi-section ~150-scale
// tests that don't map onto the exam tracker's single 0-100 score, so `entranceExam` is omitted and the
// Praxis is called out in the focus brief + visit questions instead.

import type { MajorPack } from './types.js';

export const educationPack: MajorPack = {
  key: 'education',
  label: 'Education / Teaching',
  aliases: ['education', 'teaching', 'teacher', 'elementary education', 'secondary education', 'special education'],
  focusBrief:
    'This student is pursuing education / teaching. Emphasize classroom and tutoring experience, working with ' +
    'kids (camps, coaching, mentoring), and the state teacher-licensure pathway (often gated by Praxis exams ' +
    'and a student-teaching placement). Strong communication and field/observation hours matter more than test prep here.',
  certifications: [
    { name: 'Basic Life Support (BLS) / First Aid', issuingOrganization: 'American Heart Association / American Red Cross', why: 'Commonly required for working with children in schools, camps, and tutoring settings.', priority: 3 },
  ],
  interviewQuestions: [
    'Why do you want to teach?',
    'Describe a time you helped someone understand something difficult.',
    'How would you handle a disruptive or disengaged classroom?',
    'What subject or age group do you most want to teach, and why?',
  ],
  visitQuestions: [
    'What field placements and student-teaching partnerships does the program offer?',
    'What is the teacher-licensure exam (Praxis) pass rate, and which states does it cover?',
    'When do education students begin classroom / observation hours?',
    'What support exists for getting licensed before graduation?',
  ],
  programDetailsHint:
    'Capture education-program specifics: the state teaching-licensure pathway and exam requirements (e.g. ' +
    'Praxis), student-teaching / field-placement structure, and licensure pass rates.',
};
