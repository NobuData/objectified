import Link from 'next/link';
import {
  LayoutDashboard,
  PenTool,
  Globe,
  Database,
  GitBranch,
  ArrowLeftRight,
  LineChart,
  HelpCircle,
  Users,
} from 'lucide-react';
import { SiGithub } from 'react-icons/si';
import { Flex, Text } from '@radix-ui/themes';

const APP_VERSION = '0.1.0';

const disabledCards = [
  {
    label: 'Browser',
    description: 'Browse and explore published schemas.',
    icon: Globe,
  },
  {
    label: 'Database',
    description: 'Connect and manage data sources.',
    icon: Database,
  },
  {
    label: 'Migration',
    description: 'Data migration tools.',
    icon: GitBranch,
  },
  {
    label: 'ETL',
    description: 'Extract, transform, and load data.',
    icon: ArrowLeftRight,
  },
  {
    label: 'Data Explorer',
    description: 'Query and visualize your data.',
    icon: LineChart,
  },
];

type HomePageContentProps = {
  firstName: string;
};

export default function HomePageContent({ firstName }: HomePageContentProps) {
  return (
    <div className="home-page">
      <div className="home-content">
        <h1 className="home-title">Objectified Platform</h1>
        <p className="home-welcome">Welcome back, {firstName}</p>
        <h2 className="home-subtitle">Select your application</h2>

        <Flex className="home-cards" wrap="wrap" gap="4" justify="center">
          <div className="home-card">
            <Link href="/dashboard" className="home-card-link">
              <Flex direction="column" gap="3" align="center">
                <LayoutDashboard className="home-card-icon" aria-hidden />
                <Text weight="bold" size="3">Dashboard</Text>
                <Text size="2" color="gray" align="center" className="home-card-description">
                  Design canvas and project tools.
                </Text>
              </Flex>
            </Link>
          </div>
          <div className="home-card">
            <Link href="/data-designer" className="home-card-link">
              <Flex direction="column" gap="3" align="center">
                <PenTool className="home-card-icon" aria-hidden />
                <Text weight="bold" size="3">Data Designer</Text>
                <Text size="2" color="gray" align="center" className="home-card-description">
                  Design schemas and API specifications.
                </Text>
              </Flex>
            </Link>
          </div>
          {disabledCards.map((card) => {
            const Icon = card.icon;
            return (
              <div key={card.label} className="home-card home-card-disabled" aria-disabled="true" title="Coming soon">
                <div className="home-card-link">
                  <span className="home-card-badge">Coming soon</span>
                  <Flex direction="column" gap="3" align="center">
                    <Icon className="home-card-icon" aria-hidden />
                    <Text weight="bold" size="3">{card.label}</Text>
                    <Text size="2" color="gray" align="center" className="home-card-description">
                      {card.description}
                    </Text>
                  </Flex>
                </div>
              </div>
            );
          })}
        </Flex>

        <div className="home-footer-links">
          <a
            href="#"
            className="home-footer-link"
            aria-label="Help"
          >
            <HelpCircle className="home-footer-link-icon" aria-hidden />
            Help
          </a>
          <a
            href="#"
            className="home-footer-link"
            aria-label="Community"
          >
            <Users className="home-footer-link-icon" aria-hidden />
            Community
          </a>
          <a
            href="https://github.com/NobuData/objectified"
            target="_blank"
            rel="noopener noreferrer"
            className="home-footer-link"
            aria-label="GitHub"
          >
            <SiGithub className="home-footer-link-icon" aria-hidden />
            GitHub
          </a>
        </div>

        <p className="home-version">
          v{APP_VERSION} &nbsp; (c) 2026 NobuData, LLC
        </p>
      </div>
    </div>
  );
}
