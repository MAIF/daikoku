import { FormRef } from '@maif/react-forms';
import { useContext, useRef } from 'react';

import { I18nContext } from '../../../../contexts';
import { IWithSwagger } from '../../../../types';
import { TeamApiSwagger } from '../../../backoffice/apis/TeamApiSwagger';
import { SideSheet, SideSheetActions } from '../../../utils';

type SpecificationSideSheetProps<T extends IWithSwagger> = {
  entity: T;
  save: (entity: T) => Promise<unknown>;
  onClose: () => void;
};

export const SpecificationSideSheet = <T extends IWithSwagger>(props: SpecificationSideSheetProps<T>) => {
  const { translate } = useContext(I18nContext);

  const formRef = useRef<FormRef | undefined>(undefined);

  return (
    <SideSheet
      title={translate('api.home.spec.right.panel.title')}
      size="wide"
      onClose={props.onClose}
      isDirty={() => !!formRef.current?.methods.formState.isDirty}
      footer={(requestClose) => (
        <SideSheetActions onCancel={requestClose} onSave={() => formRef.current?.handleSubmit()} />
      )}
    >
      <TeamApiSwagger
        value={props.entity}
        reference={formRef}
        save={(entity) => props.save(entity).then(props.onClose)}
      />
    </SideSheet>
  );
};
