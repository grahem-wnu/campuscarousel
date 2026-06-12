// Architecture pack — designing buildings (studio + portfolio driven), distinct from Construction
// Management's run-the-jobsite focus. Admission is portfolio-driven rather than exam-driven, so
// `entranceExam` is omitted; a design portfolio, drawing/modeling skill, and studio commitment lead.

import type { MajorPack } from './types.js';

export const architecturePack: MajorPack = {
  key: 'architecture',
  label: 'Architecture',
  aliases: ['architecture', 'architectural', 'architectural design'],
  focusBrief:
    'This student is pursuing Architecture. Emphasize building a DESIGN PORTFOLIO (sketches, models, ' +
    'photography, any made objects), drawing and 3D-modeling skill (SketchUp, Rhino, AutoCAD/Revit), and ' +
    'comfort with critique and long studio hours. Note the two routes: a NAAB-accredited 5-year B.Arch ' +
    '(licensure-track from day one) vs a 4-year pre-professional degree + a Master of Architecture. ' +
    'Licensure (NCARB / AXP / the ARE) comes after graduation. For college, the portfolio and studio fit ' +
    'matter most.',
  certifications: [
    { name: 'Autodesk Certified User (AutoCAD or Revit)', issuingOrganization: 'Autodesk', why: 'Demonstrates the drafting/BIM software architecture programs and firms use daily.', priority: 1 },
    { name: 'LEED Green Associate', issuingOrganization: 'U.S. Green Building Council', why: 'Sustainable-design credential increasingly expected in the profession.', priority: 2 },
  ],
  interviewQuestions: [
    'Why architecture, and whose buildings or spaces inspire you?',
    'Walk me through a design or project you made and the choices behind it.',
    'How do you respond to critique of your work?',
    'What drawing, modeling, or fabrication tools and skills are you building?',
  ],
  visitQuestions: [
    'Is the program NAAB-accredited, and is it a 5-year B.Arch or a 4+2 (pre-professional + M.Arch)?',
    'What does the admission portfolio need to show?',
    'What is studio culture like — hours, reviews, faculty access?',
    'What fabrication labs (wood/metal/3D-print), study-abroad, and licensure placement exist?',
  ],
  programDetailsHint:
    'Capture architecture specifics: NAAB accreditation, B.Arch (5-yr) vs pre-professional + M.Arch, ' +
    'admission portfolio requirements, studio culture, fabrication labs & study-abroad, and licensure ' +
    'placement.',
};
