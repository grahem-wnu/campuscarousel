// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { BucketBadge } from './BucketBadge';

describe('BucketBadge', () => {
  it('renders the effective bucket label (suggestion when there is no override)', () => {
    render(<BucketBadge college={{ suggestedBucket: 'target' }} />);
    expect(screen.getByText('Target')).toBeInTheDocument();
  });

  it('a family override wins over the AI suggestion', () => {
    render(<BucketBadge college={{ bucket: 'reach', suggestedBucket: 'safety' }} />);
    expect(screen.getByText('Reach')).toBeInTheDocument();
    expect(screen.queryByText('Safety')).not.toBeInTheDocument();
  });

  it('shows the "set by you" override marker only when a bucket override is set', () => {
    const { rerender } = render(<BucketBadge college={{ bucket: 'reach' }} />);
    expect(screen.getByLabelText(/set by you/i)).toBeInTheDocument();

    rerender(<BucketBadge college={{ suggestedBucket: 'reach' }} />);
    expect(screen.queryByLabelText(/set by you/i)).not.toBeInTheDocument();
  });

  it('renders nothing when there is no effective bucket', () => {
    const { container } = render(<BucketBadge college={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders an "Unclassified" affordance when asked to show empty state', () => {
    render(<BucketBadge college={{}} showUnclassified />);
    expect(screen.getByText('Unclassified')).toBeInTheDocument();
  });
});
