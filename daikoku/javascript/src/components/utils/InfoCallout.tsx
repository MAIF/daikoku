import classNames from 'classnames';
import { Info, TriangleAlert } from 'lucide-react';
import { ReactNode, useContext } from 'react';

import { I18nContext } from '../../contexts';

type InfoCalloutProps = {
  title?: string;
  variant?: 'info' | 'warning';
  children: ReactNode;
};

export const InfoCallout = (props: InfoCalloutProps) => {
  const { translate } = useContext(I18nContext);

  const warning = props.variant === 'warning';
  const Icon = warning ? TriangleAlert : Info;

  return (
    <div className={classNames('info-callout', { '--warning': warning })} role="note">
      <div className="info-callout__icon">
        <Icon size={20} aria-hidden="true" />
      </div>

      <div className="info-callout__body">
        <p className="info-callout__title">
          {props.title ?? translate(warning ? 'Warning' : 'info.callout.default.title')}
        </p>
        <div>{props.children}</div>
      </div>
    </div>
  );
};
