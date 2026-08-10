import { APP_DESCRIPTION } from '@/config/app';

export interface LandingOwnerConfig {
  name: string;
  names: string[];
  title: string;
  description: string;
}

export interface ExampleLink {
  slug: string;
  title: string;
  description: string;
  destinationUrl: string;
  previewUrl?: string;
}

export const LANDING_CONFIG: LandingOwnerConfig = {
  name: 'Sai Nikhil',
  names: ['creators', 'your team', 'your brand', 'everyone'],
  title: 'Short links for ',
  description: APP_DESCRIPTION,
};

/**
 * Public example links shown on the landing page. These never come from
 * Firestore at runtime — they are a static config that also feeds the
 * `npm run seed-demo` script, which creates the matching `links/{slug}`
 * documents so the redirects actually resolve on first deploy.
 */
export const EXAMPLE_LINKS: ExampleLink[] = [
  {
    slug: 'qr-canvas',
    title: 'QR Canvas',
    description: 'Open-source dynamic QR code generator with scan analytics.',
    destinationUrl: 'https://iamsainikhil.com/qr-canvas',
  },
  {
    slug: 'trimtube',
    title: 'TrimTube',
    description: 'Take YouTube playlists, pick the best sections, and build focused versions.',
    destinationUrl: 'https://iamsainikhil.com/trimtube',
  },
  {
    slug: 'weather-react',
    title: 'Weather React',
    description: 'A clean, real-time weather app built with React.',
    destinationUrl: 'https://iamsainikhil.com/weather-react',
  },
  {
    slug: 'blog',
    title: 'Blog',
    description: 'Writing, thoughts, and long-form posts.',
    destinationUrl: 'https://blog.iamsainikhil.com',
  },
  {
    slug: 'github',
    title: 'GitHub',
    description: 'Open-source projects, experiments, and release notes.',
    destinationUrl: 'https://github.com/iamsainikhil',
  },
  {
    slug: 'linkedin',
    title: 'LinkedIn',
    description: 'My professional profile and network updates.',
    destinationUrl: 'https://www.linkedin.com/in/iamsainikhil',
  },
];