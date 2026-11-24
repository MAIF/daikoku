import { Form, FormRef } from '@maif/react-forms';
import { useContext, useRef } from 'react';

import { I18nContext } from '../../../../contexts';
import { GlobalContext } from '../../../../contexts/globalContext';
import * as Services from '../../../../services';
import { IApi, ICmsPageGQL, ITeamSimple } from '../../../../types';
import { teamApiInfoForm } from '../../../backoffice/apis/TeamApiInfo';
import { ExpertModeChips } from '../../../inputs';
import { SideSheet, SideSheetActions } from '../../../utils';

type ApiSideSheetProps = {
  title: string;
  team: ITeamSimple;
  api: IApi;
  hasSubscriptions?: boolean;
  onSubmit: (api: IApi) => Promise<boolean>;
  onClose: () => void;
};

export const ApiSideSheet = (props: ApiSideSheetProps) => {
  const { translate } = useContext(I18nContext);
  const { tenant, expertMode, customGraphQLClient } = useContext(GlobalContext);

  const formRef = useRef<FormRef | undefined>(undefined);

  const getCmsPages = (): Promise<Array<ICmsPageGQL>> =>
    customGraphQLClient
      .request<{ pages: Array<ICmsPageGQL> }>(Services.graphql.cmsPages)
      .then((res) => res.pages);

  const informationForm = teamApiInfoForm(
    translate,
    props.team,
    tenant,
    getCmsPages,
    !!props.api.apis,
    props.api.state ?? 'created',
    props.hasSubscriptions ?? false
  );

  const adminOnly = props.api.visibility === 'AdminOnly';

  return (
    <SideSheet
      title={props.title}
      onClose={props.onClose}
      isDirty={() => !!formRef.current?.methods.formState.isDirty}
      footer={(requestClose) => (
        <SideSheetActions onCancel={requestClose} onSave={() => formRef.current?.handleSubmit()} />
      )}
    >
      {!adminOnly && <ExpertModeChips />}

      <Form
        ref={formRef}
        schema={adminOnly ? informationForm.adminSchema : informationForm.schema}
        flow={adminOnly ? informationForm.adminFlow : informationForm.flow(expertMode)}
        value={props.api}
        onSubmit={(api: IApi) => props.onSubmit(api).then((saved) => saved && props.onClose())}
        footer={() => <></>}
      />
    </SideSheet>
  );
};
