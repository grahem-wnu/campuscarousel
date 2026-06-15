// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

describe('frontend test harness', () => {
  it('renders into a DOM', () => {
    render(<button>hello</button>);
    expect(screen.getByRole('button', { name: 'hello' })).toBeInTheDocument();
  });
});
