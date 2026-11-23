import { constraints, Form, format, FormRef, type } from '@maif/react-forms';
import sortBy from 'lodash/sortBy';
import { useContext, useRef } from 'react';
import { toast } from 'sonner';

import { I18nContext } from '../../../../contexts';
import * as Services from '../../../../services';
import { IApi, isError, ITeamSimple } from '../../../../types';
import { SideSheet, SideSheetActions } from '../../../utils';

type TransferApiSideSheetProps = {
  api: IApi;
  ownerTeam: ITeamSimple;
  onClose: () => void;
};

export const TransferApiSideSheet = ({ api, ownerTeam, onClose }: TransferApiSideSheetProps) => {
  const { translate } = useContext(I18nContext);
  const formRef = useRef<FormRef | undefined>(undefined);

  const schema = {
    team: {
      type: type.string,
      label: translate('new.owner'),
      format: format.select,
      optionsFrom: () =>
        Services.teams(ownerTeam).then((teams) =>
          isError(teams) ? [] : sortBy(teams.filter((team) => team._id !== api.team), 'name')
        ),
      transformer: (team: ITeamSimple) => ({ label: team.name, value: team._id }),
      constraints: [constraints.required(translate('constraints.required.team'))],
    },
    confirm: {
      type: type.string,
      label: translate({ key: 'type.api.name.confirmation', replacements: [api.name] }),
      constraints: [
        constraints.oneOf([api.name], translate({ key: 'constraints.type.api.name', replacements: [api.name] })),
      ],
    },
  };

  const transfer = ({ team }: { team: string }) =>
    Services.transferApiOwnership(team, api.team, api._id).then((response) => {
      if (response.notify) {
        toast.info(translate('team.transfer.notified'));
        onClose();
      } else {
        toast.error(response.error ?? translate('issues.on_error'));
      }
    });

  return (
    <SideSheet
      title={translate('api.home.right.panel.transfer.title')}
      onClose={onClose}
      isDirty={() => !!formRef.current?.methods.formState.isDirty}
      footer={(requestClose) => (
        <SideSheetActions
          onCancel={requestClose}
          onSave={() => formRef.current?.handleSubmit()}
          saveLabel={translate('api.home.config.api.menu.transfer')}
        />
      )}
    >
      <Form ref={formRef} schema={schema} onSubmit={transfer} footer={() => <></>} />
    </SideSheet>
  );
};
