import { Info } from 'lucide-react';
import { ReactNode, useContext } from 'react';

import { I18nContext } from '../../contexts';

type InfoCalloutProps = {
  title?: string;
  children: ReactNode;
};

export const InfoCallout = (props: InfoCalloutProps) => {
  const { translate } = useContext(I18nContext);

  return (
    <div className="info-callout" role="note">
      <div className="info-callout__icon">
        <Info size={20} aria-hidden="true" />
      </div>

      <div className="info-callout__body">
        <p className="info-callout__title">{props.title ?? translate('info.callout.default.title')}</p>
        <div>{props.children}</div>
      </div>
    </div>
  );
};
