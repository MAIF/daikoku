import { useContext } from 'react';

import { Form } from '@maif/react-forms';
import { teamApiInfoForm } from '.';
import { I18nContext } from '../../../contexts';
import { IApi, ITeamSimple, ITenant } from '../../../types';

import { getApolloContext, gql } from '@apollo/client';
import { IPage } from '../../adminbackoffice/cms';

const cmsPagesQuery = () => ({
  query: gql`
    query CmsPages {
      pages {
        id
        name
        path
        contentType
        lastPublishedDate
        metadata
      }
    }
  `,
});

export const TeamApiInfos = ({
  api,
  save,
  creation,
  expertMode,
  team,
  tenant
}: {
  api: IApi,
  save: (t: IApi) => Promise<void>,
  creation: boolean,
  expertMode: boolean,
  team: ITeamSimple,
  tenant: ITenant
}) => {
  const { translate } = useContext(I18nContext);

  const { client } = useContext(getApolloContext());

  const getCmsPages = (): Promise<Array<IPage>> =>
    client!.query(cmsPagesQuery())
      .then(res => res.data.pages as Array<IPage>)

  const informationForm = teamApiInfoForm(translate, team, tenant, getCmsPages);

  if (api.visibility === 'AdminOnly') {
    return (
      <Form
        schema={informationForm.adminSchema}
        flow={informationForm.adminFlow}
        onSubmit={save}
        value={api}
      />
    )
  }


  return (
    <Form
      schema={informationForm.schema}
      flow={informationForm.flow(expertMode)}
      onSubmit={save}
      value={api}
    />
  )
};
