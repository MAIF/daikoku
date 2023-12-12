import clsx from 'clsx';
import Link from '@docusaurus/Link';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import HomepageFeatures from '@site/src/components/HomepageFeatures';
import HomepageDaikokuDescription from '@site/src/components/HomepageDaikokuDescription';

import Heading from '@theme/Heading';
import styles from './index.module.css';


function HeroBanner() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <div className={styles.hero} data-theme="dark">
      <div className={styles.heroInner}>
        <div className={styles.heroInnerHead}>
          <Heading as="h1" className={styles.heroProjectTagline}>
            <span
              className={styles.heroTitleTextHtml}
            >
              Unlock your development potential with our <b>fully customizable</b> dev portal <br />
              the perfect blend of <b>developer</b> and <b>business</b> worlds.
            </span>
          </Heading>
          <img
            alt='daikoku as hand drawn character'
            className={styles.heroLogo}
            src={`${siteConfig.baseUrl}/img/daikoku.png`}
            width="400"
            height="400"
          />
        </div>
        <div className={styles.indexCtas}>
          <Link className="button button--primary" to="/docs/getstarted">
            Get Started
          </Link>
          <Link className="button button--info" to="/docs/usages">
            Documentation
          </Link>
          <span className={styles.indexCtasGitHubButtonWrapper}>
            <iframe
              className={styles.indexCtasGitHubButton}
              src="https://ghbtns.com/github-btn.html?user=maif&amp;repo=daikoku&amp;type=star&amp;count=true&amp;size=large"
              width={160}
              height={30}
              title="GitHub Stars"
            />
          </span>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const { siteConfig } = useDocusaurusContext();
  return (
    <Layout
      title={`${siteConfig.title}`}
      description="Daikoku documentation">
      <main>
        <HeroBanner />
      </main>
      {/* <HomepageHeader /> */}
      <main>
        <HomepageDaikokuDescription />
        <HomepageFeatures />
      </main>
    </Layout>
  );
}
