import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

const FeatureList = [
  {
    title: 'Easy to Use',
    Svg: require('@site/static/img/undraw_mindfulness_8gqa.svg').default,
    description: (
      <>
        Seamless development, simplified: Unleash your potential with our effortlessly user-friendly portal.
      </>
    ),
  },
  {
    title: 'Fully Customizable',
    Svg: require('@site/static/img/undraw_building_websites_i78t.svg').default,
    description: (
      <>
        Tailor your success: Dive into limitless possibilities with our highly customizable development portal.
      </>
    ),
  },
  {
    title: 'OSS by MAIF',
    Svg: require('@site/static/img/undraw_different_love_a-3-rg.svg').default,
    description: (
      <>
        Empower your development journey: Explore, customize, and contribute with our open-source portal.
      </>
    ),
  },
];

function Feature({Svg, title, description}) {
  return (
    <div className={clsx('col col--4')}>
      <div className="text--center">
        <Svg className={styles.featureSvg} role="img" />
      </div>
      <div className="text--center padding-horiz--md">
        <Heading as="h3">{title}</Heading>
        <p>{description}</p>
      </div>
    </div>
  );
}

export default function HomepageFeatures() {
  return (
    <section className={styles.features}>
      <div className="container">
        <div className="row">
          {FeatureList.map((props, idx) => (
            <Feature key={idx} {...props} />
          ))}
        </div>
      </div>
    </section>
  );
}
