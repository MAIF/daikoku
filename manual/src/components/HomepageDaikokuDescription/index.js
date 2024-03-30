import clsx from 'clsx';
import Heading from '@theme/Heading';
import styles from './styles.module.css';

export default function HomepageDaikokuDescription() {
  return (
    <section className={styles.features} data-theme="light">
      <div className="container">
        <div className={styles.description__main}>
          <b>Daikoku</b>  is the developer portal which was missing for <a href='https://maif.github.io/otoroshi/manual/index.html' target='blank'>Otoroshi</a>.
          It is written in <a href="https://www.scala-lang.org/" target="_blank">Scala</a> and developed by the <a href="https://maif.github.io" target="_blank">MAIF OSS</a> team.
        </div>
        <div className={styles.description__trivia}>
          In Japan, <a href="https://en.wikipedia.org/wiki/File:Daikoku.jpg" target="blank">Daikokuten 大黒天</a>, the god of great darkness or blackness, or the god of five cereals, is one of the Seven Lucky Gods (Fukujin). Daikokuten evolved from the Buddhist form of the Indian deity Shiva intertwined with the Shinto god Ōkuninushi. The name is the Japanese equivalent of Mahākāla, the Hindu name for Shiva.
        </div>
      </div>
    </section>
  );
}