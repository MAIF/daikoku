import { Form, FormRef } from '@maif/react-forms';
import { useQueryClient } from '@tanstack/react-query';
import classNames from 'classnames';
import pick from 'lodash/pick';
import { useContext, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Select from 'react-select';
import { toast } from 'sonner';

import { I18nContext } from '../../../../contexts';
import { GlobalContext } from '../../../../contexts/globalContext';
import * as Services from '../../../../services';
import { IApi, ICmsPageGQL, isError, ITeamSimple } from '../../../../types';
import { teamApiInfoForm } from '../../../backoffice/apis/TeamApiInfo';
import { ChoiceChips, ExpertModeChips } from '../../../inputs';
import { SideSheet } from '../../../utils';

const STEPS = [
  'api.creation.step.context',
  'api.creation.step.general',
  'api.creation.step.technical',
  'api.creation.step.access',
];

type Draft = {
  apigroup: boolean;
  api: IApi;
};

type CreateApiSideSheetProps = {
  teams: Array<ITeamSimple>;
  onClose: () => void;
};

export const CreateApiSideSheet = (props: CreateApiSideSheetProps) => {
  const { translate } = useContext(I18nContext);
  const { tenant, expertMode, customGraphQLClient } = useContext(GlobalContext);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const formRef = useRef<FormRef | undefined>(undefined);

  const [step, setStep] = useState(0);
  const [teamId, setTeamId] = useState(props.teams.length === 1 ? props.teams[0]._id : undefined);
  const [apigroup, setApigroup] = useState(false);
  const [draft, setDraft] = useState<Draft>();
  const [pending, setPending] = useState(false);

  const team = props.teams.find((t) => t._id === teamId);
  const lastStep = step === STEPS.length - 1;

  const getCmsPages = (): Promise<Array<ICmsPageGQL>> =>
    customGraphQLClient
      .request<{ pages: Array<ICmsPageGQL> }>(Services.graphql.cmsPages)
      .then((res) => res.pages);

  const informationForm = team && teamApiInfoForm(translate, team, tenant, getCmsPages, apigroup);
  const stepFlow = step > 0 ? informationForm?.creationFlows(expertMode)[step - 1] : undefined;
  const stepValue = stepFlow && draft && pick(draft.api, ['_id', ...stepFlow.flatMap((section) => section.flow)]);

  const soloFields = (stepFlow ?? []).filter((section) => section.flow.length === 1).map((section) => section.flow[0]);
  const stepSchema =
    informationForm &&
    Object.fromEntries(
      Object.entries(informationForm.schema).map(([key, entry]) => [
        key,
        soloFields.includes(key) ? { ...entry, label: null } : entry,
      ])
    );

  const leaveContext = () => {
    if (!team) {
      return;
    }

    if (draft?.apigroup === apigroup) {
      setDraft({ ...draft, api: { ...draft.api, team: team._id } });
      setStep(1);
      return;
    }

    setPending(true);
    (apigroup ? Services.fetchNewApiGroup() : Services.fetchNewApi())
      .then((template: IApi) => {
        setDraft({ apigroup, api: { ...template, team: team._id } });
        setStep(1);
      })
      .finally(() => setPending(false));
  };

  const create = (api: IApi) => {
    setPending(true);
    Services.createTeamApi(team!._id, api)
      .then((created) => {
        if (isError(created)) {
          toast.error(created.error);
          return;
        }

        queryClient.invalidateQueries({ queryKey: ['apis'] });
        toast.success(translate({ key: 'api.created.successful.toast', replacements: [created.name] }));
        props.onClose();
        navigate(`/${team!._humanReadableId}/${created._humanReadableId}/${created.currentVersion}/description`);
      })
      .finally(() => setPending(false));
  };

  const saveStep = (values: Partial<IApi>) => {
    const api = { ...draft!.api, ...values };

    if (lastStep) {
      create(api);
    } else {
      setDraft({ ...draft!, api });
      setStep(step + 1);
    }
  };

  const previous = () => {
    if (draft && step > 0) {
      setDraft({ ...draft, api: { ...draft.api, ...formRef.current?.methods.data() } });
    }

    setStep(step - 1);
  };

  const next = () => (step === 0 ? leaveContext() : formRef.current?.handleSubmit());

  return (
    <SideSheet
      title={translate(apigroup ? 'apigroup.creation.right.panel.title' : 'api.creation.right.panel.title')}
      onClose={props.onClose}
      isDirty={() => !!draft}
      footer={(requestClose) => (
        <>
          <button type="button" className="btn --secondary" onClick={step === 0 ? requestClose : previous}>
            {translate(step === 0 ? 'Cancel' : 'Previous')}
          </button>
          <button type="button" className="btn --primary" disabled={pending || !team} onClick={next}>
            {translate(lastStep ? 'Create' : 'Next')}
          </button>
        </>
      )}
    >
      <div className="api-stepper">
        <div className="api-stepper__progress">
          <span className="api-stepper__title">{translate(STEPS[step])}</span>
          <div
            className="api-stepper__bars"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
            aria-valuenow={step + 1}
            aria-label={translate({
              key: 'api.creation.step.progress',
              replacements: [`${step + 1}`, `${STEPS.length}`],
            })}
          >
            {STEPS.map((key, index) => (
              <span key={key} className={classNames('api-stepper__bar', { '--done': index <= step })} />
            ))}
          </div>
        </div>

        {step === 0 && (
          <ContextStep
            teams={props.teams}
            teamId={teamId}
            onTeamChange={setTeamId}
            apigroup={apigroup}
            onApigroupChange={setApigroup}
          />
        )}

        {stepSchema && stepFlow && stepValue && (
          <Form
            key={step}
            ref={formRef}
            schema={stepSchema}
            flow={stepFlow}
            value={stepValue}
            onSubmit={saveStep}
            footer={() => <></>}
          />
        )}
      </div>
    </SideSheet>
  );
};

type ContextStepProps = {
  teams: Array<ITeamSimple>;
  teamId?: string;
  onTeamChange: (teamId: string) => void;
  apigroup: boolean;
  onApigroupChange: (apigroup: boolean) => void;
};

const ContextStep = (props: ContextStepProps) => {
  const { translate } = useContext(I18nContext);
  const teamSelectId = useId();

  const options = props.teams.map((team) => ({ label: team.name, value: team._id }));

  return (
    <div className="api-stepper__context">
      <div>
        <label className="form-label" htmlFor={teamSelectId}>
          {translate('api.creation.team.label')}
        </label>
        <Select
          inputId={teamSelectId}
          className="reactSelect"
          classNamePrefix="reactSelect"
          options={options}
          value={options.find((option) => option.value === props.teamId) ?? null}
          onChange={(option) => option && props.onTeamChange(option.value)}
          placeholder={translate('api.creation.team.placeholder')}
          menuPortalTarget={document.body}
          styles={{ menuPortal: (base) => ({ ...base, zIndex: 2147483647 }) }}
        />
      </div>

      <ChoiceChips
        label={translate('api.creation.group.label')}
        options={[
          { value: false, label: translate('No') },
          { value: true, label: translate('Yes') },
        ]}
        value={props.apigroup}
        onChange={props.onApigroupChange}
      />

      <ExpertModeChips />
    </div>
  );
};
