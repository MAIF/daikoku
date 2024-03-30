import clsx from 'clsx';
import styles from './styles.module.css';
import Link from '@docusaurus/Link';

const Section = ({ title, description, link }) => {
  return (
    <Link to={link} className={`${clsx('col col--5')} ${styles.section}`}>
      <h3 as="h3">{title}</h3>
      <p>{description}</p>
    </Link>
  );
}

export default function DocumentationThemeHub({ list }) {
  return (
    <section className={styles.sections}>
      {list.map((props, idx) => (
        <Section key={idx} {...props} />
      ))}
    </section>
  );
}

export const DocumentationGetStartedHub = () => <DocumentationThemeHub list={[
  {
    title: 'About Daikoku',
    description: 'Presentation of Daikoku',
    link: '/docs/getstarted/about'
  },
  {
    title: 'Get Daikoku',
    description: 'How to get your instance',
    link: '/docs/getstarted/getdaikoku'
  },
  {
    title: 'First run',
    description: 'Run Daikoku in 5 minutes',
    link: '/docs/getstarted/firstrun'
  },
  {
    title: 'Setup',
    description: 'Setup your instance',
    link: '/docs/getstarted/setup'
  },
]} />

export const DocumentationUsagesHub = () => <DocumentationThemeHub list={[
  {
    title: 'Daikoku Admin.',
    description: 'How to manage your instance as administrator',
    link: '/docs/usages/adminusage'
  },  
  {
    title: 'Tenant Admin.',
    description: 'How to manage your tenant as administrator',
    link: '/docs/usages/tenantusage'
  },{
    title: 'API Producer',
    description: 'Use Daikoku as producer',
    link: '/docs/usages/producerusage'
  },{
    title: 'API Consumer',
    description: 'Use Daikoku as simple consumer',
    link: '/docs/usages/consumerusage'
  },
  
]} />

export const DocumentationGuidesHub = () => <DocumentationThemeHub list={[
  {
    title: 'Architecture',
    description: 'Know more about how daikoku works',
    link: '/docs/guides/archi'
  },
  {
    title: 'Integration',
    description: 'How to use integration API',
    link: '/docs/guides/integrations'
  },{
    title: 'Apis',
    description: 'How to use admin APIs',
    link: '/docs/guides/apis'
  },{
    title: 'Deploy',
    description: 'How to deploy your own Daikoku',
    link: '/docs/guides/deploy'
  },
  
]} />